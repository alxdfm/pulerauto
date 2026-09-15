/**
 * Q64.64 sqrt-price ↔ tick (Whirlpool).
 * sqrtPriceX64AtTick still uses float for mid-range ticks; tickFromSqrt
 * never casts the full u128 through Number.
 */

import { LN_1_0001 } from './tick-price.js'

const Q64 = 2 ** 64
/** Whirlpool usable tick bounds (protocol). */
const MIN_TICK = -443636
const MAX_TICK = 443636

/** Approximate sqrtPriceX64 at tick (Whirlpool Q64.64). */
export function sqrtPriceX64AtTick(tick: number): bigint {
  const sqrt = Math.exp((tick * LN_1_0001) / 2) * Q64
  if (!Number.isFinite(sqrt) || sqrt <= 0) {
    throw new Error(`sqrtPriceX64AtTick overflow at tick ${tick}`)
  }
  return BigInt(Math.floor(sqrt))
}

/** Largest tick whose sqrtPriceX64 ≤ given sqrt (binary search, no Number(u128)). */
export function tickFromSqrtPriceX64(sqrtPriceX64: bigint): number {
  if (sqrtPriceX64 <= 0n) {
    throw new Error('sqrtPriceX64 must be positive')
  }
  let lo = MIN_TICK
  let hi = MAX_TICK
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (sqrtPriceX64AtTick(mid) <= sqrtPriceX64) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo
}
