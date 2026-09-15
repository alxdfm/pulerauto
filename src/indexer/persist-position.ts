/**
 * Persist Position rows + events; rebalance closes parent and opens child (§13).
 */

import type pg from 'pg'
import type { Db } from '../db/client.js'
import { rebalanceOpenChild } from '../math/position-pnl.js'
import type { DecodedPosition } from './position-decode.js'

export type PositionEventKind =
  | 'mint'
  | 'increase'
  | 'decrease'
  | 'collect'
  | 'burn'
  | 'rebalance'

export type UpsertPositionInput = {
  walletId: number
  poolId: number
  strategyId?: number | null
  position: DecodedPosition
  openedAt: Date
  entryPrice: string
  entryAmount0: bigint
  entryAmount1: bigint
  entryValueUsd: string
  parentPositionId?: number | null
}

export async function ensureWallet(
  db: Db,
  opts: { chainId: number; address: string; label?: string },
): Promise<number> {
  return db.withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO wallets (chain_id, address, label, read_only)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (chain_id, address) DO UPDATE SET label = COALESCE(EXCLUDED.label, wallets.label)
       RETURNING id::text`,
      [opts.chainId, opts.address, opts.label ?? null],
    )
    return Number(rows[0]!.id)
  })
}

export async function upsertOpenPosition(
  client: pg.PoolClient,
  input: UpsertPositionInput,
): Promise<number> {
  const nft = input.position.positionMint
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO positions (
       wallet_id, pool_id, strategy_id, nft_mint,
       tick_lower, tick_upper, liquidity,
       opened_at, entry_price, entry_amount0, entry_amount1, entry_value_usd,
       parent_position_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (wallet_id, pool_id, nft_mint) DO UPDATE SET
       tick_lower = EXCLUDED.tick_lower,
       tick_upper = EXCLUDED.tick_upper,
       liquidity = EXCLUDED.liquidity,
       closed_at = NULL
     RETURNING id::text`,
    [
      input.walletId,
      input.poolId,
      input.strategyId ?? null,
      nft,
      input.position.tickLowerIndex,
      input.position.tickUpperIndex,
      input.position.liquidity.toString(),
      input.openedAt,
      input.entryPrice,
      input.entryAmount0.toString(),
      input.entryAmount1.toString(),
      input.entryValueUsd,
      input.parentPositionId ?? null,
    ],
  )
  return Number(rows[0]!.id)
}

export async function insertPositionEvent(
  client: pg.PoolClient,
  opts: {
    positionId: number
    ts: Date
    kind: PositionEventKind
    amount0?: bigint | null
    amount1?: bigint | null
    fee0?: bigint | null
    fee1?: bigint | null
    gasUsd?: string | null
    slippageUsd?: string | null
    txRef: string
  },
): Promise<void> {
  await client.query(
    `INSERT INTO position_events (
       position_id, ts, kind, amount0, amount1, fee0, fee1,
       gas_usd, slippage_usd, tx_ref
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      opts.positionId,
      opts.ts,
      opts.kind,
      opts.amount0?.toString() ?? null,
      opts.amount1?.toString() ?? null,
      opts.fee0?.toString() ?? null,
      opts.fee1?.toString() ?? null,
      opts.gasUsd ?? null,
      opts.slippageUsd ?? null,
      opts.txRef,
    ],
  )
}

export async function closePosition(
  client: pg.PoolClient,
  positionId: number,
  closedAt: Date,
): Promise<void> {
  await client.query(
    `UPDATE positions SET closed_at = $2, liquidity = 0 WHERE id = $1`,
    [positionId, closedAt],
  )
}

/**
 * Rebalance: close parent, open child with fresh entry baseline (§13).
 * Never carries parent entry_price onto the child.
 */
export async function persistRebalance(
  db: Db,
  opts: {
    parentPositionId: number
    walletId: number
    poolId: number
    strategyId?: number | null
    newPosition: DecodedPosition
    closedAt: Date
    openedAt: Date
    entryPrice: number
    entryAmount0: bigint
    entryAmount1: bigint
    entryValueUsd: number
    txRef: string
    gasUsd?: string
    slippageUsd?: string
  },
): Promise<{ parentId: number; childId: number }> {
  const childFields = rebalanceOpenChild({
    parentPositionId: opts.parentPositionId,
    newEntryPrice: opts.entryPrice,
    newEntryAmount0: opts.entryAmount0,
    newEntryAmount1: opts.entryAmount1,
    newEntryValueUsd: opts.entryValueUsd,
    newLiquidity: opts.newPosition.liquidity,
    tickLower: opts.newPosition.tickLowerIndex,
    tickUpper: opts.newPosition.tickUpperIndex,
  })

  return db.withClient(async (client) => {
    await client.query('BEGIN')
    try {
      await closePosition(client, opts.parentPositionId, opts.closedAt)
      await insertPositionEvent(client, {
        positionId: opts.parentPositionId,
        ts: opts.closedAt,
        kind: 'rebalance',
        txRef: opts.txRef,
        gasUsd: opts.gasUsd ?? null,
        slippageUsd: opts.slippageUsd ?? null,
      })

      const childId = await upsertOpenPosition(client, {
        walletId: opts.walletId,
        poolId: opts.poolId,
        strategyId: opts.strategyId,
        position: opts.newPosition,
        openedAt: opts.openedAt,
        entryPrice: String(childFields.entryPrice),
        entryAmount0: childFields.entryAmount0,
        entryAmount1: childFields.entryAmount1,
        entryValueUsd: String(childFields.entryValueUsd),
        parentPositionId: childFields.parentPositionId,
      })

      await insertPositionEvent(client, {
        positionId: childId,
        ts: opts.openedAt,
        kind: 'mint',
        amount0: opts.entryAmount0,
        amount1: opts.entryAmount1,
        txRef: opts.txRef,
      })

      await client.query('COMMIT')
      return { parentId: opts.parentPositionId, childId }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  })
}
