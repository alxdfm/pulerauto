import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from './client.js'
import { checkFeeSegInvariant } from './invariants.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('fee seg invariant (DB)', () => {
  let db: Db
  let poolId: number

  beforeAll(async () => {
    db = createDb()
    const { rows } = await db.withClient((c) =>
      c.query<{ id: string }>(`SELECT id::text FROM pools ORDER BY id LIMIT 1`),
    )
    poolId = Number(rows[0]!.id)
  })

  afterAll(async () => {
    await db.close()
  })

  it('reports ok when Σ fee_seg = fee_amount for windowed swaps', async () => {
    const ts = new Date()
    const txRef = `test-fee-seg-${Date.now()}`
    try {
      await db.withClient(async (c) => {
        await c.query(
          `INSERT INTO swaps (
             pool_id, ts, block_or_slot, tx_ref, event_path,
             amount0, amount1, sqrt_price_before, sqrt_price_after,
             tick_before, tick_after, liquidity_before, fee_amount
           ) VALUES ($1,$2,1,$3,'traded:0', 1, -1, 10, 9, 0, 0, 100, 100)
           ON CONFLICT DO NOTHING`,
          [poolId, ts, txRef],
        )
        await c.query(
          `INSERT INTO swap_segments (
             pool_id, ts, tx_ref, event_path, seg_index,
             tick_lo, tick_hi, liquidity_seg, amount_in_seg, fee_seg
           ) VALUES
             ($1,$2,$3,'traded:0',0, 0,1,100,60,60),
             ($1,$2,$3,'traded:0',1, 1,2,100,40,40)
           ON CONFLICT DO NOTHING`,
          [poolId, ts, txRef],
        )
      })

      const check = await checkFeeSegInvariant(db, poolId, 30)
      expect(check.ok).toBe(true)
      expect(check.detail).toMatch(/mismatched=0/)
    } finally {
      await db.withClient(async (c) => {
        await c.query(`DELETE FROM swap_segments WHERE tx_ref = $1`, [txRef])
        await c.query(`DELETE FROM swaps WHERE tx_ref = $1`, [txRef])
      })
    }
  })
})
