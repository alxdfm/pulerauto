/**
 * Analyze Position mark-to-market snapshots (spec §13 / §16).
 * Verb: analyze — metrics from DB state, no RPC required for synthetic path.
 */

import type { Db } from '../db/client.js'
import {
  feeGrowthInside,
  pendingFeesFromGrowth,
} from '../math/fee-growth-inside.js'
import { amountsFromLiquidity } from '../math/position-amounts.js'
import { computePositionPnl } from '../math/position-pnl.js'
import { hodlValueQuote, isInRange } from '../math/position-value.js'
import { sqrtPriceX64AtTick } from '../math/sqrt-price.js'
import { priceFromSqrtPriceX, priceFromTick } from '../math/tick-price.js'

export type SnapshotComputeInput = {
  positionId: number
  tickLower: number
  tickUpper: number
  liquidity: bigint
  entryPrice: number
  entryAmount0: number
  entryAmount1: number
  entryValueUsd: number
  feesCollectedUsd: number
  costsUsd: number
  rewardsUsd: number
  fundingUsd: number
  /** Human price (token1 per token0). */
  price: number
  decimals0: number
  decimals1: number
  sqrtPrice?: bigint
  feeGrowthGlobal0?: bigint
  feeGrowthGlobal1?: bigint
  feeGrowthOutsideLower0?: bigint
  feeGrowthOutsideLower1?: bigint
  feeGrowthOutsideUpper0?: bigint
  feeGrowthOutsideUpper1?: bigint
  feeGrowthCheckpoint0?: bigint
  feeGrowthCheckpoint1?: bigint
  feeGrowthShift?: number
  currentTick?: number
  cumTimeInRange?: number
}

export type ComputedSnapshot = {
  positionId: number
  price: number
  inRange: boolean
  valueUsd: number
  hodlValueUsd: number
  feesEarnedUsd: number
  feesPendingUsd: number
  rewardsUsd: number
  costsUsd: number
  fundingUsd: number
  divergenceUsd: number
  pnlVsHodlUsd: number
  deltaToken0: number
  cumTimeInRange: number
}

export function computePositionSnapshot(
  input: SnapshotComputeInput,
): ComputedSnapshot {
  const sqrtCurrent =
    input.sqrtPrice ?? sqrtPriceX64AtTick(input.currentTick ?? 0)
  const sqrtLower = sqrtPriceX64AtTick(input.tickLower)
  const sqrtUpper = sqrtPriceX64AtTick(input.tickUpper)
  const amounts = amountsFromLiquidity(
    input.liquidity,
    sqrtCurrent,
    sqrtLower,
    sqrtUpper,
  )
  const scale0 = 10 ** input.decimals0
  const scale1 = 10 ** input.decimals1
  const a0 = Number(amounts.amount0) / scale0
  const a1 = Number(amounts.amount1) / scale1
  const price =
    input.price > 0
      ? input.price
      : priceFromSqrtPriceX(sqrtCurrent, 64, input.decimals0, input.decimals1)
  const pa = priceFromTick(input.tickLower)
  const pb = priceFromTick(input.tickUpper)
  // Adjust tick prices for decimals when using raw 1.0001^tick (SOL/USDC).
  // For synthetic tests, callers pass human `price` and entry amounts already scaled.
  const valueUsd = a0 * price + a1
  const hodlValueUsd = hodlValueQuote(
    input.entryAmount0,
    input.entryAmount1,
    price,
  )

  let feesPendingUsd = 0
  const shift = input.feeGrowthShift ?? 64
  if (
    input.feeGrowthGlobal0 !== undefined &&
    input.feeGrowthGlobal1 !== undefined &&
    input.currentTick !== undefined
  ) {
    const inside = feeGrowthInside({
      feeGrowthGlobal0: input.feeGrowthGlobal0,
      feeGrowthGlobal1: input.feeGrowthGlobal1,
      tickLower: input.tickLower,
      tickUpper: input.tickUpper,
      currentTick: input.currentTick,
      lower: {
        feeGrowthOutside0: input.feeGrowthOutsideLower0 ?? 0n,
        feeGrowthOutside1: input.feeGrowthOutsideLower1 ?? 0n,
      },
      upper: {
        feeGrowthOutside0: input.feeGrowthOutsideUpper0 ?? 0n,
        feeGrowthOutside1: input.feeGrowthOutsideUpper1 ?? 0n,
      },
    })
    const pending = pendingFeesFromGrowth({
      liquidity: input.liquidity,
      feeGrowthInside0Now: inside.feeGrowthInside0,
      feeGrowthInside1Now: inside.feeGrowthInside1,
      feeGrowthInside0Last: input.feeGrowthCheckpoint0 ?? 0n,
      feeGrowthInside1Last: input.feeGrowthCheckpoint1 ?? 0n,
      feeGrowthShift: shift,
    })
    feesPendingUsd =
      (Number(pending.fees0) / scale0) * price + Number(pending.fees1) / scale1
  }

  const pnl = computePositionPnl({
    valueNow: valueUsd,
    valueEntry: input.entryValueUsd,
    feesCollected: input.feesCollectedUsd,
    feesPending: feesPendingUsd,
    rewards: input.rewardsUsd,
    gas: 0,
    swapCosts: input.costsUsd,
    funding: input.fundingUsd,
    hodlValueNow: hodlValueUsd,
  })

  const inRange =
    input.currentTick !== undefined
      ? input.currentTick >= input.tickLower &&
        input.currentTick < input.tickUpper
      : isInRange(price, pa, pb)

  return {
    positionId: input.positionId,
    price,
    inRange,
    valueUsd,
    hodlValueUsd,
    feesEarnedUsd: input.feesCollectedUsd,
    feesPendingUsd,
    rewardsUsd: input.rewardsUsd,
    costsUsd: input.costsUsd,
    fundingUsd: input.fundingUsd,
    divergenceUsd: pnl.divergence,
    pnlVsHodlUsd: pnl.pnlVsHodl,
    deltaToken0: a0,
    cumTimeInRange: input.cumTimeInRange ?? 0,
  }
}

export async function writePositionSnapshot(
  db: Db,
  snap: ComputedSnapshot,
  ts: Date,
): Promise<void> {
  await db.withClient(async (client) => {
    await client.query(
      `INSERT INTO position_snapshots (
         position_id, ts, price, in_range,
         value_usd, hodl_value_usd, fees_earned_usd, fees_pending_usd,
         rewards_usd, costs_usd, funding_usd, divergence_usd, pnl_vs_hodl_usd,
         delta_token0, hedge_size, cum_time_in_range
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NULL,$15
       )
       ON CONFLICT (position_id, ts) DO UPDATE SET
         price = EXCLUDED.price,
         in_range = EXCLUDED.in_range,
         value_usd = EXCLUDED.value_usd,
         hodl_value_usd = EXCLUDED.hodl_value_usd,
         fees_earned_usd = EXCLUDED.fees_earned_usd,
         fees_pending_usd = EXCLUDED.fees_pending_usd,
         rewards_usd = EXCLUDED.rewards_usd,
         costs_usd = EXCLUDED.costs_usd,
         funding_usd = EXCLUDED.funding_usd,
         divergence_usd = EXCLUDED.divergence_usd,
         pnl_vs_hodl_usd = EXCLUDED.pnl_vs_hodl_usd,
         delta_token0 = EXCLUDED.delta_token0,
         cum_time_in_range = EXCLUDED.cum_time_in_range`,
      [
        snap.positionId,
        ts,
        snap.price,
        snap.inRange,
        snap.valueUsd.toFixed(6),
        snap.hodlValueUsd.toFixed(6),
        snap.feesEarnedUsd.toFixed(6),
        snap.feesPendingUsd.toFixed(6),
        snap.rewardsUsd.toFixed(6),
        snap.costsUsd.toFixed(6),
        snap.fundingUsd.toFixed(6),
        snap.divergenceUsd.toFixed(6),
        snap.pnlVsHodlUsd.toFixed(6),
        snap.deltaToken0.toFixed(18),
        snap.cumTimeInRange,
      ],
    )
  })
}

export async function analyzePositionFromDb(
  db: Db,
  positionId: number,
  opts: { decimals0: number; decimals1: number; ts?: Date },
): Promise<ComputedSnapshot | null> {
  return db.withClient(async (client) => {
    const { rows: posRows } = await client.query<{
      tick_lower: number
      tick_upper: number
      liquidity: string
      entry_price: string
      entry_amount0: string
      entry_amount1: string
      entry_value_usd: string
      pool_id: string
    }>(
      `SELECT tick_lower, tick_upper, liquidity::text, entry_price::text,
              entry_amount0::text, entry_amount1::text, entry_value_usd::text,
              pool_id::text
       FROM positions WHERE id = $1`,
      [positionId],
    )
    const pos = posRows[0]
    if (!pos) return null

    const { rows: stateRows } = await client.query<{
      sqrt_price: string
      tick: number
      fee_growth_global0: string
      fee_growth_global1: string
    }>(
      `SELECT sqrt_price::text, tick, fee_growth_global0::text, fee_growth_global1::text
       FROM pool_states WHERE pool_id = $1
       ORDER BY ts DESC, block_or_slot DESC LIMIT 1`,
      [Number(pos.pool_id)],
    )
    const state = stateRows[0]
    if (!state) return null

    const { rows: feeRows } = await client.query<{ fees: string }>(
      `SELECT COALESCE(SUM(COALESCE(fee0,0) + COALESCE(fee1,0)), 0)::text AS fees
       FROM position_events WHERE position_id = $1 AND kind = 'collect'`,
      [positionId],
    )
    const { rows: costRows } = await client.query<{ costs: string }>(
      `SELECT COALESCE(SUM(COALESCE(gas_usd,0) + COALESCE(slippage_usd,0)), 0)::text AS costs
       FROM position_events WHERE position_id = $1`,
      [positionId],
    )

    const scale0 = 10 ** opts.decimals0
    const scale1 = 10 ** opts.decimals1
    const sqrtPrice = BigInt(state.sqrt_price)
    const price = priceFromSqrtPriceX(
      sqrtPrice,
      64,
      opts.decimals0,
      opts.decimals1,
    )

    const snap = computePositionSnapshot({
      positionId,
      tickLower: pos.tick_lower,
      tickUpper: pos.tick_upper,
      liquidity: BigInt(pos.liquidity),
      entryPrice: Number(pos.entry_price),
      entryAmount0: Number(pos.entry_amount0) / scale0,
      entryAmount1: Number(pos.entry_amount1) / scale1,
      entryValueUsd: Number(pos.entry_value_usd),
      feesCollectedUsd: Number(feeRows[0]?.fees ?? 0) / scale1,
      costsUsd: Number(costRows[0]?.costs ?? 0),
      rewardsUsd: 0,
      fundingUsd: 0,
      price,
      decimals0: opts.decimals0,
      decimals1: opts.decimals1,
      sqrtPrice,
      currentTick: state.tick,
      feeGrowthGlobal0: BigInt(state.fee_growth_global0),
      feeGrowthGlobal1: BigInt(state.fee_growth_global1),
      feeGrowthShift: 64,
    })

    await writePositionSnapshot(db, snap, opts.ts ?? new Date())
    return snap
  })
}
