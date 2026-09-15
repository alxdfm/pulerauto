/**
 * Fetch + decode a Whirlpool Position account and upsert into DB.
 * entry_* must come from open-time (CLI flags); live mark is forbidden on create.
 * RPC open-meta resolution never runs while holding a DB transaction.
 */

import { Connection, PublicKey } from '@solana/web3.js'
import type { Db } from '../db/client.js'
import {
  decodePosition,
  derivePositionPda,
} from './position-decode.js'
import {
  ensureWallet,
  insertPositionEvent,
  upsertOpenPosition,
} from './persist-position.js'

export type PositionEntry = {
  openedAt: Date
  entryPrice: string
  entryAmount0: bigint
  entryAmount1: bigint
  entryValueUsd: string
  txRef: string
}

export type IndexPositionResult = {
  positionId: number
  walletId: number
  nftMint: string
  liquidity: string
  tickLower: number
  tickUpper: number
  created: boolean
  poolId: number
  whirlpool: string
}

/** Oldest successful signature for the Position PDA → open-time hint. */
export async function resolvePositionOpenMeta(
  connection: Connection,
  positionPda: PublicKey,
): Promise<{ openedAt: Date; txRef: string } | null> {
  let before: string | undefined
  let oldest: { signature: string; blockTime: number | null | undefined } | null =
    null
  for (let page = 0; page < 20; page++) {
    const sigs = await connection.getSignaturesForAddress(positionPda, {
      limit: 1000,
      before,
    })
    if (sigs.length === 0) break
    const last = sigs[sigs.length - 1]!
    oldest = { signature: last.signature, blockTime: last.blockTime }
    before = last.signature
    if (sigs.length < 1000) break
  }
  if (!oldest) return null
  return {
    txRef: oldest.signature,
    openedAt: oldest.blockTime
      ? new Date(oldest.blockTime * 1000)
      : new Date(),
  }
}

export async function resolvePoolIdByWhirlpool(
  db: Db,
  whirlpool: string,
): Promise<{ poolId: number; chainId: number }> {
  const { rows } = await db.withClient((c) =>
    c.query<{ id: string; chain_id: number }>(
      `SELECT p.id::text, d.chain_id
       FROM pools p JOIN dexes d ON d.id = p.dex_id
       WHERE p.address = $1`,
      [whirlpool],
    ),
  )
  const row = rows[0]
  if (!row) {
    throw new Error(
      `No pool row for whirlpool ${whirlpool} — seed/index the pool first`,
    )
  }
  return { poolId: Number(row.id), chainId: row.chain_id }
}

export async function indexPositionByMint(
  db: Db,
  opts: {
    rpcUrl: string
    walletAddress: string
    positionMint: string
    /** Required on first insert; ignored on re-index (entry_* preserved). */
    entry?: PositionEntry
    poolId?: number
    chainId?: number
  },
): Promise<IndexPositionResult> {
  const connection = new Connection(opts.rpcUrl, 'confirmed')
  const mint = new PublicKey(opts.positionMint)
  const pda = derivePositionPda(mint)
  const acc = await connection.getAccountInfo(pda)
  if (!acc) throw new Error(`Position PDA not found: ${pda.toBase58()}`)

  const position = decodePosition(acc.data as Buffer)
  const bound = await resolvePoolIdByWhirlpool(db, position.whirlpool)
  if (opts.poolId !== undefined && opts.poolId !== bound.poolId) {
    throw new Error(
      `poolId ${opts.poolId} does not match Position whirlpool ${position.whirlpool} (pool ${bound.poolId})`,
    )
  }
  const poolId = bound.poolId
  const chainId = opts.chainId ?? bound.chainId

  const walletId = await ensureWallet(db, {
    chainId,
    address: opts.walletAddress,
  })

  // Existence check outside any long-lived transaction (no RPC while holding a client).
  const existingId = await db.withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id::text FROM positions
       WHERE wallet_id = $1 AND pool_id = $2 AND nft_mint = $3`,
      [walletId, poolId, position.positionMint],
    )
    return rows[0] ? Number(rows[0].id) : null
  })
  const isNew = existingId == null

  if (isNew && !opts.entry) {
    const meta = await resolvePositionOpenMeta(connection, pda)
    throw new Error(
      `entry_* required for new Position (live mark forbidden). ` +
        `Pass --entry-price --entry-amount0 --entry-amount1 --entry-value-usd` +
        (meta
          ? ` (suggested --opened-at ${meta.openedAt.toISOString()} --tx-ref ${meta.txRef})`
          : ''),
    )
  }

  const entry = opts.entry
  const result = await db.withClient(async (client) => {
    await client.query('BEGIN')
    try {
      const upserted = await upsertOpenPosition(client, {
        walletId,
        poolId,
        position,
        openedAt: entry?.openedAt ?? new Date(),
        entryPrice: entry?.entryPrice ?? '0',
        entryAmount0: entry?.entryAmount0 ?? 0n,
        entryAmount1: entry?.entryAmount1 ?? 0n,
        entryValueUsd: entry?.entryValueUsd ?? '0',
      })

      if (isNew && entry) {
        await insertPositionEvent(client, {
          positionId: upserted.positionId,
          ts: entry.openedAt,
          kind: 'mint',
          amount0: entry.entryAmount0,
          amount1: entry.entryAmount1,
          fee0: position.feeOwedA,
          fee1: position.feeOwedB,
          txRef: entry.txRef,
        })
      }

      await client.query('COMMIT')
      return upserted
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  })

  return {
    positionId: result.positionId,
    walletId,
    nftMint: position.positionMint,
    liquidity: position.liquidity.toString(),
    tickLower: position.tickLowerIndex,
    tickUpper: position.tickUpperIndex,
    created: result.created,
    poolId,
    whirlpool: position.whirlpool,
  }
}
