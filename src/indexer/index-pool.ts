import { Connection, PublicKey } from '@solana/web3.js'
import type pg from 'pg'
import type { Db } from '../db/client.js'
import { reconstructActiveLiquidity } from '../math/liquidity.js'
import { fetchWhirlpoolTicks } from './fetch-whirlpool-ticks.js'
import type { DecodedTick } from './tick-array.js'
import { decodeWhirlpool } from './whirlpool-decode.js'

export type IndexedPoolState = {
  poolId: number
  address: string
  slot: number
  liquidity: bigint
  sqrtPrice: bigint
  tick: number
  feeGrowthGlobal0: bigint
  feeGrowthGlobal1: bigint
  tokenMintA: string
  tokenMintB: string
  tickSpacing: number
  feeRate: number
}

const CHECKPOINT_BATCH_SIZE = 500

export async function fetchWhirlpoolState(
  rpcUrl: string,
  poolAddress: string,
): Promise<{ state: ReturnType<typeof decodeWhirlpool>; slot: number }> {
  const connection = new Connection(rpcUrl, 'confirmed')
  const pubkey = new PublicKey(poolAddress)
  const result = await connection.getAccountInfoAndContext(pubkey, 'confirmed')
  if (!result.value) {
    throw new Error(`Whirlpool account not found: ${poolAddress}`)
  }
  return {
    state: decodeWhirlpool(result.value.data as Buffer),
    slot: result.context.slot,
  }
}

export async function indexPoolSnapshot(
  db: Db,
  opts: {
    rpcUrl: string
    poolId: number
    poolAddress: string
  },
): Promise<IndexedPoolState> {
  const { state, slot } = await fetchWhirlpoolState(opts.rpcUrl, opts.poolAddress)
  const ts = new Date()

  await db.withClient(async (client) => {
    await client.query(
      `INSERT INTO pool_states (
         pool_id, ts, block_or_slot, sqrt_price, tick, liquidity,
         fee_growth_global0, fee_growth_global1
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        opts.poolId,
        ts,
        slot,
        state.sqrtPrice.toString(),
        state.tickCurrentIndex,
        state.liquidity.toString(),
        state.feeGrowthGlobalA.toString(),
        state.feeGrowthGlobalB.toString(),
      ],
    )
  })

  return {
    poolId: opts.poolId,
    address: opts.poolAddress,
    slot,
    liquidity: state.liquidity,
    sqrtPrice: state.sqrtPrice,
    tick: state.tickCurrentIndex,
    feeGrowthGlobal0: state.feeGrowthGlobalA,
    feeGrowthGlobal1: state.feeGrowthGlobalB,
    tokenMintA: state.tokenMintA,
    tokenMintB: state.tokenMintB,
    tickSpacing: state.tickSpacing,
    feeRate: state.feeRate,
  }
}

async function insertCheckpointBatch(
  client: pg.PoolClient,
  poolId: number,
  ts: Date,
  batch: DecodedTick[],
): Promise<void> {
  if (batch.length === 0) return

  const values: unknown[] = []
  const placeholders: string[] = []
  let i = 1
  for (const t of batch) {
    placeholders.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
    )
    values.push(
      poolId,
      ts,
      t.tickIndex,
      t.liquidityNet.toString(),
      t.liquidityGross.toString(),
      t.feeGrowthOutsideA.toString(),
      t.feeGrowthOutsideB.toString(),
    )
  }

  await client.query(
    `INSERT INTO tick_liquidity_checkpoints
       (pool_id, ts, tick_index, liquidity_net, liquidity_gross,
        fee_growth_outside0, fee_growth_outside1)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (pool_id, ts, tick_index) DO UPDATE SET
       liquidity_net = EXCLUDED.liquidity_net,
       liquidity_gross = EXCLUDED.liquidity_gross,
       fee_growth_outside0 = EXCLUDED.fee_growth_outside0,
       fee_growth_outside1 = EXCLUDED.fee_growth_outside1`,
    values,
  )
}

/**
 * Write tick checkpoint from on-chain tick arrays (gPA all arrays, or neighbor fallback).
 * Returns whether reconstructed L matches pool liquidity exactly.
 */
export async function writeOnChainTickCheckpoint(
  db: Db,
  opts: {
    rpcUrl: string
    poolId: number
    poolAddress: string
    currentTick: number
    tickSpacing: number
    expectedLiquidity: bigint
  },
): Promise<{
  tickCount: number
  reconstructed: bigint
  sumNet: bigint
  matches: boolean
}> {
  const ticks = await fetchWhirlpoolTicks({
    rpcUrl: opts.rpcUrl,
    poolAddress: opts.poolAddress,
  })

  const ts = new Date()
  await db.withClient(async (client) => {
    await client.query('BEGIN')
    try {
      for (let i = 0; i < ticks.length; i += CHECKPOINT_BATCH_SIZE) {
        await insertCheckpointBatch(
          client,
          opts.poolId,
          ts,
          ticks.slice(i, i + CHECKPOINT_BATCH_SIZE),
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  })

  const recon = reconstructActiveLiquidity(
    ticks.map((t) => ({
      tickIndex: t.tickIndex,
      liquidityNet: t.liquidityNet,
      liquidityGross: t.liquidityGross,
    })),
    opts.currentTick,
  )

  return {
    tickCount: ticks.length,
    reconstructed: recon.activeLiquidity,
    sumNet: recon.sumNet,
    matches:
      recon.sumNet === 0n &&
      recon.activeLiquidity === opts.expectedLiquidity,
  }
}

/** Deterministic checkpoint for unit tests (exact L match). */
export async function writeSyntheticConsistentCheckpoint(
  db: Db,
  opts: {
    poolId: number
    currentTick: number
    activeLiquidity: bigint
    tickSpacing: number
  },
): Promise<void> {
  const lower = opts.currentTick - opts.tickSpacing * 10
  const upper = opts.currentTick + opts.tickSpacing * 10
  const L = opts.activeLiquidity
  const ts = new Date()

  await db.withClient(async (client) => {
    await client.query(
      `INSERT INTO tick_liquidity_checkpoints
         (pool_id, ts, tick_index, liquidity_net, liquidity_gross,
          fee_growth_outside0, fee_growth_outside1)
       VALUES
         ($1, $2, $3, $4, $4, 0, 0),
         ($1, $2, $5, $6, $4, 0, 0)`,
      [opts.poolId, ts, lower, L.toString(), upper, (-L).toString()],
    )
  })
}
