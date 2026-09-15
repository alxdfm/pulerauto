/**
 * Token amounts from concentrated liquidity (spec §2).
 * Q64.64 sqrt-price space (Whirlpool); amounts in base units as bigint.
 */

export const Q64 = 1n << 64n

export type PositionAmounts = {
  amount0: bigint
  amount1: bigint
}

function orderedSqrt(
  sqrtA: bigint,
  sqrtB: bigint,
): { lo: bigint; hi: bigint } {
  return sqrtA <= sqrtB ? { lo: sqrtA, hi: sqrtB } : { lo: sqrtB, hi: sqrtA }
}

/** Δamount0 for a price move between two sqrts (round down). */
export function amount0Delta(
  sqrtA: bigint,
  sqrtB: bigint,
  liquidity: bigint,
): bigint {
  if (liquidity === 0n) return 0n
  const { lo, hi } = orderedSqrt(sqrtA, sqrtB)
  if (lo <= 0n) throw new Error('sqrt price must be positive')
  // L · (1/√lo − 1/√hi) · 2^64 = L·2^64/lo − L·2^64/hi
  return (liquidity * Q64) / lo - (liquidity * Q64) / hi
}

/** Δamount1 for a price move between two sqrts (round down). */
export function amount1Delta(
  sqrtA: bigint,
  sqrtB: bigint,
  liquidity: bigint,
): bigint {
  if (liquidity === 0n) return 0n
  const { lo, hi } = orderedSqrt(sqrtA, sqrtB)
  // L · (√hi − √lo) / 2^64
  return (liquidity * (hi - lo)) / Q64
}

/**
 * Token balances held by liquidity L in [sqrtLower, sqrtUpper] at sqrtCurrent.
 * Matches spec §2 piecewise formulas.
 */
export function amountsFromLiquidity(
  liquidity: bigint,
  sqrtCurrent: bigint,
  sqrtLower: bigint,
  sqrtUpper: bigint,
): PositionAmounts {
  if (!(sqrtLower > 0n && sqrtUpper > sqrtLower)) {
    throw new Error('invalid sqrt range')
  }
  if (sqrtCurrent <= 0n) throw new Error('sqrtCurrent must be positive')

  if (sqrtCurrent <= sqrtLower) {
    return {
      amount0: amount0Delta(sqrtLower, sqrtUpper, liquidity),
      amount1: 0n,
    }
  }
  if (sqrtCurrent >= sqrtUpper) {
    return {
      amount0: 0n,
      amount1: amount1Delta(sqrtLower, sqrtUpper, liquidity),
    }
  }
  return {
    amount0: amount0Delta(sqrtCurrent, sqrtUpper, liquidity),
    amount1: amount1Delta(sqrtLower, sqrtCurrent, liquidity),
  }
}
