/**
 * DB-level rebalance: parent closes, child opens with fresh entry (§13).
 */

import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client.js'
import {
  ensureWallet,
  persistRebalance,
  upsertOpenPosition,
} from './persist-position.js'
import type { DecodedPosition } from './position-decode.js'

function fakePosition(
  mint: string,
  ticks: { lo: number; hi: number; L: bigint },
): DecodedPosition {
  return {
    whirlpool: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
    positionMint: mint,
    liquidity: ticks.L,
    tickLowerIndex: ticks.lo,
    tickUpperIndex: ticks.hi,
    feeGrowthCheckpointA: 0n,
    feeOwedA: 0n,
    feeGrowthCheckpointB: 0n,
    feeOwedB: 0n,
    rewardInfos: [
      { growthInsideCheckpoint: 0n, amountOwed: 0n },
      { growthInsideCheckpoint: 0n, amountOwed: 0n },
      { growthInsideCheckpoint: 0n, amountOwed: 0n },
    ],
  }
}

describe('persistRebalance', () => {
  it('closes parent and opens child with parent_position_id', async () => {
    const db = createDb()
    try {
      const { rows: poolRows } = await db.withClient((c) =>
        c.query<{ id: string }>(`SELECT id::text FROM pools ORDER BY id LIMIT 1`),
      )
      if (poolRows.length === 0) return
      const poolId = Number(poolRows[0]!.id)

      const walletId = await ensureWallet(db, {
        chainId: 1,
        address: `RebalTest${Date.now()}`,
        label: 'rebalance-fixture',
      })

      const parentMint = `ParentMint${Date.now()}`
      const parent = fakePosition(parentMint, { lo: -40, hi: 40, L: 1000n })
      const parentUpsert = await db.withClient((c) =>
        upsertOpenPosition(c, {
          walletId,
          poolId,
          position: parent,
          openedAt: new Date('2026-01-01T00:00:00Z'),
          entryPrice: '100',
          entryAmount0: 10n,
          entryAmount1: 1000n,
          entryValueUsd: '1100',
        }),
      )
      const parentId = parentUpsert.positionId

      const childMint = `ChildMint${Date.now()}`
      const child = fakePosition(childMint, { lo: -20, hi: 20, L: 2000n })
      const result = await persistRebalance(db, {
        parentPositionId: parentId,
        walletId,
        poolId,
        newPosition: child,
        closedAt: new Date('2026-01-02T00:00:00Z'),
        openedAt: new Date('2026-01-02T00:00:01Z'),
        entryPrice: 110,
        entryAmount0: 5n,
        entryAmount1: 550n,
        entryValueUsd: 1100,
        txRef: 'rebalance-test-tx',
      })

      const { rows } = await db.withClient((c) =>
        c.query<{
          id: string
          closed_at: Date | null
          parent_position_id: string | null
          entry_price: string
        }>(
          `SELECT id::text, closed_at, parent_position_id::text, entry_price::text
           FROM positions WHERE id = ANY($1::bigint[])`,
          [[result.parentId, result.childId]],
        ),
      )
      const parentRow = rows.find((r) => Number(r.id) === result.parentId)!
      const childRow = rows.find((r) => Number(r.id) === result.childId)!
      expect(parentRow.closed_at).not.toBeNull()
      expect(childRow.parent_position_id).toBe(String(result.parentId))
      expect(Number(childRow.entry_price)).toBe(110)
      expect(Number(childRow.entry_price)).not.toBe(100)
    } finally {
      await db.close()
    }
  })
})
