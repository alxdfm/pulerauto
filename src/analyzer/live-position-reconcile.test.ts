import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client.js'
import { analyzePositionFromDb } from '../analyzer/position-snapshot.js'
import {
  ensureWallet,
  insertPositionEvent,
  upsertOpenPosition,
} from '../indexer/persist-position.js'
import { amountsFromLiquidity } from '../math/position-amounts.js'
import { sqrtPriceX64AtTick } from '../math/sqrt-price.js'
import { priceFromSqrtPriceX } from '../math/tick-price.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('live Orca position fixture reconcile', () => {
  it('snapshot value matches amountsFromLiquidity to the cent', async () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(root, 'fixtures/orca-sol-usdc-positions.json'),
        'utf8',
      ),
    ) as {
      pool: string
      capturedAt: string
      openPositions: {
        positionAddress: string
        positionMint: string
        tickLower: number
        tickUpper: number
        liquidity: string
        feeOwedA: string
        feeOwedB: string
      }[]
    }
    const live = fixture.openPositions[4]
    if (!live) throw new Error('fixture missing position')

    const db = createDb()
    try {
      const { rows: poolRows } = await db.withClient((c) =>
        c.query<{ id: string; chain_id: number }>(
          `SELECT p.id::text, d.chain_id
           FROM pools p JOIN dexes d ON d.id = p.dex_id
           ORDER BY p.id LIMIT 1`,
        ),
      )
      if (poolRows.length === 0) return
      const poolId = Number(poolRows[0]!.id)
      const chainId = poolRows[0]!.chain_id

      const { rows: stateRows } = await db.withClient((c) =>
        c.query<{ sqrt_price: string }>(
          `SELECT sqrt_price::text FROM pool_states
           WHERE pool_id = $1
           ORDER BY ts DESC, block_or_slot DESC LIMIT 1`,
          [poolId],
        ),
      )
      if (stateRows.length === 0) return

      const sqrtPrice = BigInt(stateRows[0]!.sqrt_price)
      const price = priceFromSqrtPriceX(sqrtPrice, 64, 9, 6)
      const L = BigInt(live.liquidity)
      const amounts = amountsFromLiquidity(
        L,
        sqrtPrice,
        sqrtPriceX64AtTick(live.tickLower),
        sqrtPriceX64AtTick(live.tickUpper),
      )
      const valueUsd =
        (Number(amounts.amount0) / 1e9) * price +
        Number(amounts.amount1) / 1e6

      const walletId = await ensureWallet(db, {
        chainId,
        address: `VitestLive${Date.now()}`,
        label: 'orca-live-fixture',
      })

      const positionId = await db.withClient(async (c) => {
        await c.query('BEGIN')
        try {
          const upserted = await upsertOpenPosition(c, {
            walletId,
            poolId,
            position: {
              whirlpool: fixture.pool,
              positionMint: `${live.positionMint}-${Date.now()}`,
              liquidity: L,
              tickLowerIndex: live.tickLower,
              tickUpperIndex: live.tickUpper,
              feeGrowthCheckpointA: 0n,
              feeOwedA: BigInt(live.feeOwedA),
              feeGrowthCheckpointB: 0n,
              feeOwedB: BigInt(live.feeOwedB),
              rewardInfos: [
                { growthInsideCheckpoint: 0n, amountOwed: 0n },
                { growthInsideCheckpoint: 0n, amountOwed: 0n },
                { growthInsideCheckpoint: 0n, amountOwed: 0n },
              ],
            },
            openedAt: new Date(fixture.capturedAt),
            entryPrice: String(price),
            entryAmount0: amounts.amount0,
            entryAmount1: amounts.amount1,
            entryValueUsd: valueUsd.toFixed(6),
          })
          const id = upserted.positionId
          await insertPositionEvent(c, {
            positionId: id,
            ts: new Date(fixture.capturedAt),
            kind: 'mint',
            amount0: amounts.amount0,
            amount1: amounts.amount1,
            txRef: `fixture:${live.positionAddress}`,
          })
          await c.query('COMMIT')
          return id
        } catch (err) {
          await c.query('ROLLBACK')
          throw err
        }
      })

      const snap = await analyzePositionFromDb(db, positionId, {
        decimals0: 9,
        decimals1: 6,
      })
      expect(snap).not.toBeNull()
      expect(Math.abs(snap!.valueUsd - valueUsd)).toBeLessThan(0.01)
    } finally {
      await db.close()
    }
  })
})
