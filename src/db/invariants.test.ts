import 'dotenv/config'
import { afterAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from './client.js'
import { checkPoolInvariants } from './invariants.js'
import { writeSyntheticConsistentCheckpoint } from '../indexer/index-pool.js'

const hasDb = Boolean(process.env.DATABASE_URL)
let db: Db | null = null

describe.runIf(hasDb)('db invariants (synthetic)', () => {
  afterAll(async () => {
    if (db) await db.close()
  })

  it('passes when checkpoint reconstructs L exactly', async () => {
    db = createDb()
    const { rows } = await db.withClient(async (client) => {
      return client.query<{ id: string }>('SELECT id::text FROM pools LIMIT 1')
    })
    expect(rows.length).toBe(1)
    const poolId = Number(rows[0]!.id)
    const L = 123456789012345678n
    const tick = 1000
    const ts = new Date()

    await db.withClient(async (client) => {
      await client.query(
        `INSERT INTO pool_states (
           pool_id, ts, block_or_slot, sqrt_price, tick, liquidity,
           fee_growth_global0, fee_growth_global1
         ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0)`,
        [poolId, ts, 1, '0', tick, L.toString()],
      )
    })

    await writeSyntheticConsistentCheckpoint(db, {
      poolId,
      currentTick: tick,
      activeLiquidity: L,
      tickSpacing: 4,
    })

    const report = await checkPoolInvariants(db, poolId)
    const byName = Object.fromEntries(report.checks.map((c) => [c.name, c]))
    expect(byName.l_active_matches_pool_state?.ok).toBe(true)
    expect(byName.sum_liquidity_net_zero?.ok).toBe(true)
    expect(byName.gross_ge_abs_net?.ok).toBe(true)

    await db.withClient(async (client) => {
      await client.query(
        `DELETE FROM tick_liquidity_checkpoints
         WHERE pool_id = $1
           AND liquidity_net::text IN ($2, $3)`,
        [poolId, L.toString(), (-L).toString()],
      )
      await client.query(
        `DELETE FROM pool_states
         WHERE pool_id = $1 AND liquidity::text = $2 AND block_or_slot = 1`,
        [poolId, L.toString()],
      )
    })
  })
})
