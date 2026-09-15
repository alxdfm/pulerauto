/**
 * Fetch + decode a Whirlpool Position account and upsert into DB.
 */

import { Connection, PublicKey } from '@solana/web3.js'
import type { Db } from '../db/client.js'
import { amountsFromLiquidity } from '../math/position-amounts.js'
import { sqrtPriceX64AtTick } from '../math/sqrt-price.js'
import { priceFromSqrtPriceX } from '../math/tick-price.js'
import { decodeWhirlpool } from './whirlpool-decode.js'
import {
  decodePosition,
  derivePositionPda,
} from './position-decode.js'
import {
  ensureWallet,
  insertPositionEvent,
  upsertOpenPosition,
} from './persist-position.js'

export type IndexPositionResult = {
  positionId: number
  walletId: number
  nftMint: string
  liquidity: string
  tickLower: number
  tickUpper: number
}

export async function indexPositionByMint(
  db: Db,
  opts: {
    rpcUrl: string
    poolId: number
    chainId: number
    walletAddress: string
    positionMint: string
    decimals0: number
    decimals1: number
    openedAt?: Date
    txRef?: string
  },
): Promise<IndexPositionResult> {
  const connection = new Connection(opts.rpcUrl, 'confirmed')
  const mint = new PublicKey(opts.positionMint)
  const pda = derivePositionPda(mint)
  const acc = await connection.getAccountInfo(pda)
  if (!acc) throw new Error(`Position PDA not found: ${pda.toBase58()}`)

  const position = decodePosition(acc.data as Buffer)
  const poolAcc = await connection.getAccountInfo(
    new PublicKey(position.whirlpool),
  )
  if (!poolAcc) throw new Error(`Whirlpool not found: ${position.whirlpool}`)
  const pool = decodeWhirlpool(poolAcc.data as Buffer)

  const sqrtLower = sqrtPriceX64AtTick(position.tickLowerIndex)
  const sqrtUpper = sqrtPriceX64AtTick(position.tickUpperIndex)
  const amounts = amountsFromLiquidity(
    position.liquidity,
    pool.sqrtPrice,
    sqrtLower,
    sqrtUpper,
  )
  const price = priceFromSqrtPriceX(
    pool.sqrtPrice,
    64,
    opts.decimals0,
    opts.decimals1,
  )
  const scale0 = 10 ** opts.decimals0
  const scale1 = 10 ** opts.decimals1
  const valueUsd =
    (Number(amounts.amount0) / scale0) * price +
    Number(amounts.amount1) / scale1

  const walletId = await ensureWallet(db, {
    chainId: opts.chainId,
    address: opts.walletAddress,
  })

  const openedAt = opts.openedAt ?? new Date()
  const positionId = await db.withClient(async (client) => {
    await client.query('BEGIN')
    try {
      const id = await upsertOpenPosition(client, {
        walletId,
        poolId: opts.poolId,
        position,
        openedAt,
        entryPrice: String(price),
        entryAmount0: amounts.amount0,
        entryAmount1: amounts.amount1,
        entryValueUsd: valueUsd.toFixed(6),
      })
      await insertPositionEvent(client, {
        positionId: id,
        ts: openedAt,
        kind: 'mint',
        amount0: amounts.amount0,
        amount1: amounts.amount1,
        fee0: position.feeOwedA,
        fee1: position.feeOwedB,
        txRef: opts.txRef ?? `index:${pda.toBase58()}`,
      })
      await client.query('COMMIT')
      return id
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  })

  return {
    positionId,
    walletId,
    nftMint: position.positionMint,
    liquidity: position.liquidity.toString(),
    tickLower: position.tickLowerIndex,
    tickUpper: position.tickUpperIndex,
  }
}
