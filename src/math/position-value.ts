/**
 * Position valuation V(p), HODL baseline, divergence (spec §2, §13).
 * Float only at presentation / USD boundary.
 */

import { widthFactor } from './primitives.js'
import { amountsFromLiquidity } from './position-amounts.js'
import { priceFromSqrtPriceX } from './tick-price.js'

export type ValueBreakdown = {
  inRange: boolean
  /** Value in quote (token1) units as float — presentation. */
  valueQuote: number
  amount0: bigint
  amount1: bigint
}

/** True when pa < p < pb (exclusive bounds match on-chain tick half-open). */
export function isInRange(price: number, pa: number, pb: number): boolean {
  return price > pa && price < pb
}

/**
 * V(p) in quote units via L·W(p) when in range; else x·p + y from amounts.
 * Uses human prices (not Q-format).
 */
export function positionValueQuote(
  liquidity: number,
  price: number,
  pa: number,
  pb: number,
): number {
  if (!(liquidity >= 0 && price > 0 && pa > 0 && pb > pa)) {
    throw new Error('invalid args for positionValueQuote')
  }
  if (price <= pa) {
    const x = liquidity * (1 / Math.sqrt(pa) - 1 / Math.sqrt(pb))
    return x * price
  }
  if (price >= pb) {
    return liquidity * (Math.sqrt(pb) - Math.sqrt(pa))
  }
  return liquidity * widthFactor(price, pa, pb)
}

/** HODL value of entry amounts at current price (quote). */
export function hodlValueQuote(
  entryAmount0: number,
  entryAmount1: number,
  price: number,
): number {
  return entryAmount0 * price + entryAmount1
}

/** Divergence = V(p) − V_hodl(p) with entry amounts frozen (§13). */
export function divergenceQuote(
  valueQuote: number,
  hodlQuote: number,
): number {
  return valueQuote - hodlQuote
}

/**
 * Value from Q64.64 sqrts + decimals (presentation boundary).
 * fractionBits: 64 Whirlpool, 96 Uniswap v3.
 */
export function valueFromSqrtPrices(opts: {
  liquidity: bigint
  sqrtCurrent: bigint
  sqrtLower: bigint
  sqrtUpper: bigint
  fractionBits: 64 | 96
  decimals0: number
  decimals1: number
}): ValueBreakdown {
  const amounts = amountsFromLiquidity(
    opts.liquidity,
    opts.sqrtCurrent,
    opts.sqrtLower,
    opts.sqrtUpper,
  )
  const price = priceFromSqrtPriceX(
    opts.sqrtCurrent,
    opts.fractionBits,
    opts.decimals0,
    opts.decimals1,
  )
  const pa = priceFromSqrtPriceX(
    opts.sqrtLower,
    opts.fractionBits,
    opts.decimals0,
    opts.decimals1,
  )
  const pb = priceFromSqrtPriceX(
    opts.sqrtUpper,
    opts.fractionBits,
    opts.decimals0,
    opts.decimals1,
  )
  const scale0 = 10 ** opts.decimals0
  const scale1 = 10 ** opts.decimals1
  const a0 = Number(amounts.amount0) / scale0
  const a1 = Number(amounts.amount1) / scale1
  return {
    inRange: isInRange(price, pa, pb),
    valueQuote: a0 * price + a1,
    amount0: amounts.amount0,
    amount1: amounts.amount1,
  }
}
