/**
 * Simulate concentrated LP over a historical path with reconstructed fees.
 * Entry liquidity is calibrated so V(entry) = entryNotionalUsd.
 */

import {
  hodl5050Pnl,
  hodlVolatile100Pnl,
  lpFullRangePnl,
} from '../math/benchmarks.js'
import { captureYourFees, type SwapSegment } from '../math/fee-capture.js'
import { amplificationFromRatio, lvrRateAtCenter, widthFactor } from '../math/primitives.js'
import { lvrPeriodCost, secondsToYears } from '../math/lvr-period.js'
import { isInRange, positionValueQuote } from '../math/position-value.js'
import {
  cvar95,
  equityFromPeriodPnl,
  maxDrawdown,
} from '../math/risk-metrics.js'
import { efficiencyRatio } from '../math/regime.js'
import { roundTickOutward, tickFromPrice } from '../math/tick-price.js'

export type SimPricePoint = { ts: Date; price: number }

export type SimSwap = {
  ts: Date
  /** Fee atomic units are in token0 when true (amount0 > 0 on pool). */
  feeIsToken0: boolean
  segments: SwapSegment[]
}

export type SimulateStrategyInput = {
  entryNotionalUsd: number
  /** Multiplicative half-width r (range [p/r, p·r]). */
  rangeRatio: number
  tickSpacing?: number
  pricePath: SimPricePoint[]
  swaps: SimSwap[]
  sigmaAnnual: number
  jitFactor?: number
  gasPerRebalanceUsd?: number
  rebalanceTriggerPct?: number
  decimals0?: number
  decimals1?: number
  /** Your share of pool L in the range (fee capture); default = calibrated L. */
  yourLiquidity?: bigint
}

export type SimulateStrategyResult = {
  pnlUsd: number
  pnlVsHodl5050Usd: number
  pnlVsHodlVolatileUsd: number
  pnlVsFullRangeUsd: number
  feesUsd: number
  lvrCostUsd: number
  totalCostsUsd: number
  timeInRange: number
  rebalanceCount: number
  maxDrawdown: number
  cvar95: number
  regimesCovered: number
  periodPnl: number[]
  excessVsHodl5050: number[]
  liquidity: number
}

function ticksForRange(
  pa: number,
  pb: number,
  tickSpacing: number,
): { tickLower: number; tickUpper: number } {
  return roundTickOutward(tickFromPrice(pa), tickFromPrice(pb), tickSpacing)
}

function feeSegToUsd(
  feeAtomic: bigint,
  feeIsToken0: boolean,
  price: number,
  decimals0: number,
  decimals1: number,
): number {
  if (feeIsToken0) {
    return (Number(feeAtomic) / 10 ** decimals0) * price
  }
  return Number(feeAtomic) / 10 ** decimals1
}

function calibrateLiquidity(
  entryNotional: number,
  entryPrice: number,
  pa: number,
  pb: number,
): number {
  const w = widthFactor(entryPrice, pa, pb)
  if (!(w > 0)) throw new Error('W≤0 at entry — cannot calibrate L')
  return entryNotional / w
}

/**
 * Fixed-range simulation: fees via captureYourFees on timed episodes;
 * LVR while inRange; rebalance updates pa/pb and ticks together.
 */
export function simulateConcentratedStrategy(
  input: SimulateStrategyInput,
): SimulateStrategyResult {
  const path = input.pricePath
  if (path.length < 2) throw new Error('pricePath needs ≥2 points')

  const jit = input.jitFactor ?? 1
  const gas = input.gasPerRebalanceUsd ?? 0
  const trigger = input.rebalanceTriggerPct ?? 0
  const decimals0 = input.decimals0 ?? 9
  const decimals1 = input.decimals1 ?? 6
  const tickSpacing = input.tickSpacing ?? 1
  const a = amplificationFromRatio(input.rangeRatio)
  const lvrRate = lvrRateAtCenter(input.sigmaAnnual, a)

  const entryNotional = input.entryNotionalUsd
  let entryPrice = path[0]!.price
  let pa = entryPrice / input.rangeRatio
  let pb = entryPrice * input.rangeRatio
  let { tickLower, tickUpper } = ticksForRange(pa, pb, tickSpacing)
  const liquidity = calibrateLiquidity(entryNotional, entryPrice, pa, pb)
  const yourLiquidity =
    input.yourLiquidity ?? BigInt(Math.max(1, Math.round(liquidity)))

  // Full-range: same notional, wide ticks, L calibrated at entry.
  const frPa = entryPrice / 100
  const frPb = entryPrice * 100
  const frL = calibrateLiquidity(entryNotional, entryPrice, frPa, frPb)
  const frTicks = ticksForRange(frPa, frPb, tickSpacing)
  const frYourL = BigInt(Math.max(1, Math.round(frL)))

  let feesUsd = 0
  let feesFullUsd = 0
  let lvrCost = 0
  let costs = 0
  let rebalanceCount = 0
  let timeInRangeSec = 0
  let wallSec = 0
  const periodPnl: number[] = []
  const excessVsHodl5050: number[] = []
  let prevMark = entryNotional

  const swaps = [...input.swaps].sort(
    (a, b) => a.ts.getTime() - b.ts.getTime(),
  )
  let swapIdx = 0

  function captureFeesUntil(until: Date, priceHint: number): void {
    while (swapIdx < swaps.length && swaps[swapIdx]!.ts.getTime() <= until.getTime()) {
      const sw = swaps[swapIdx]!
      const feeAtomic = captureYourFees({
        yourLiquidity,
        segments: sw.segments,
        rangeTickLower: tickLower,
        rangeTickUpper: tickUpper,
      })
      feesUsd += feeSegToUsd(
        feeAtomic,
        sw.feeIsToken0,
        priceHint,
        decimals0,
        decimals1,
      )
      const frFee = captureYourFees({
        yourLiquidity: frYourL,
        segments: sw.segments,
        rangeTickLower: frTicks.tickLower,
        rangeTickUpper: frTicks.tickUpper,
      })
      feesFullUsd += feeSegToUsd(
        frFee,
        sw.feeIsToken0,
        priceHint,
        decimals0,
        decimals1,
      )
      swapIdx += 1
    }
  }

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1]!
    const cur = path[i]!
    const dtSec = Math.max(
      0,
      (cur.ts.getTime() - prev.ts.getTime()) / 1000,
    )
    wallSec += dtSec
    const midPrice = (prev.price + cur.price) / 2
    if (isInRange(midPrice, pa, pb)) {
      timeInRangeSec += dtSec
      const v = positionValueQuote(liquidity, midPrice, pa, pb)
      lvrCost += lvrPeriodCost({
        lvrRateAnnual: lvrRate,
        valueQuote: v,
        timeInRangeYears: secondsToYears(dtSec),
      })
    }

    captureFeesUntil(cur.ts, midPrice)

    if (
      trigger > 0 &&
      Math.abs(cur.price - entryPrice) / entryPrice >= trigger
    ) {
      costs += gas
      rebalanceCount += 1
      entryPrice = cur.price
      pa = entryPrice / input.rangeRatio
      pb = entryPrice * input.rangeRatio
      ;({ tickLower, tickUpper } = ticksForRange(pa, pb, tickSpacing))
    }

    const mark = positionValueQuote(liquidity, cur.price, pa, pb)
    const stepPnl = mark - prevMark
    periodPnl.push(stepPnl)
    const hodlStep =
      hodl5050Pnl({
        entryNotionalUsd: entryNotional,
        entryPrice: path[0]!.price,
        exitPrice: cur.price,
      }).pnlUsd -
      hodl5050Pnl({
        entryNotionalUsd: entryNotional,
        entryPrice: path[0]!.price,
        exitPrice: prev.price,
      }).pnlUsd
    excessVsHodl5050.push(stepPnl - hodlStep)
    prevMark = mark
  }

  // Trailing swaps after last price point.
  captureFeesUntil(
    new Date(path[path.length - 1]!.ts.getTime() + 1),
    path[path.length - 1]!.price,
  )

  feesUsd *= jit
  feesFullUsd *= jit
  const exitPrice = path[path.length - 1]!.price
  const finalValue = positionValueQuote(liquidity, exitPrice, pa, pb)
  const pnlUsd = finalValue - entryNotional + feesUsd - lvrCost - costs

  const b5050 = hodl5050Pnl({
    entryNotionalUsd: entryNotional,
    entryPrice: path[0]!.price,
    exitPrice,
  })
  const bVol = hodlVolatile100Pnl({
    entryNotionalUsd: entryNotional,
    entryPrice: path[0]!.price,
    exitPrice,
  })
  const bFr = lpFullRangePnl({
    entryNotionalUsd: entryNotional,
    entryPrice: path[0]!.price,
    exitPrice,
    feesUsd: feesFullUsd,
    costsUsd: costs,
  })

  const prices = path.map((p) => p.price)
  const erNow = prices.length >= 2 ? efficiencyRatio(prices) : 0
  let regimesCovered = 1
  if (erNow >= 0.4) regimesCovered += 1
  if (erNow > 0 && erNow <= 0.2) regimesCovered += 1
  for (let i = 1; i < prices.length; i++) {
    if (Math.abs(Math.log(prices[i]! / prices[i - 1]!)) > 0.05) {
      regimesCovered = 3
      break
    }
  }

  const eq = equityFromPeriodPnl(periodPnl, entryNotional)
  const tir = wallSec > 0 ? timeInRangeSec / wallSec : 0

  return {
    pnlUsd,
    pnlVsHodl5050Usd: pnlUsd - b5050.pnlUsd,
    pnlVsHodlVolatileUsd: pnlUsd - bVol.pnlUsd,
    pnlVsFullRangeUsd: pnlUsd - bFr.pnlUsd,
    feesUsd,
    lvrCostUsd: lvrCost,
    totalCostsUsd: costs,
    timeInRange: tir,
    rebalanceCount,
    maxDrawdown: maxDrawdown(eq),
    cvar95: cvar95(periodPnl),
    regimesCovered: Math.min(3, regimesCovered),
    periodPnl,
    excessVsHodl5050,
    liquidity,
  }
}
