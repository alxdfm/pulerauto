/**
 * feeGrowthInside + pending fees (spec §5).
 * Wrapping arithmetic; divisor = 2^fee_growth_shift (64 Orca, 128 EVM).
 */

/** u128 modulus for Solana fee growth; u256 uses 2^256 (NUMERIC path). */
export const U128_MOD = 1n << 128n

export function wrappingSubU128(a: bigint, b: bigint): bigint {
  return ((a % U128_MOD) - (b % U128_MOD) + U128_MOD) % U128_MOD
}

export type FeeGrowthOutside = {
  feeGrowthOutside0: bigint
  feeGrowthOutside1: bigint
}

/**
 * feeGrowthInside = global − below − above (wrapping), Uniswap/Whirlpool convention.
 */
export function feeGrowthInside(opts: {
  feeGrowthGlobal0: bigint
  feeGrowthGlobal1: bigint
  tickLower: number
  tickUpper: number
  currentTick: number
  lower: FeeGrowthOutside
  upper: FeeGrowthOutside
}): { feeGrowthInside0: bigint; feeGrowthInside1: bigint } {
  const below0 =
    opts.currentTick >= opts.tickLower
      ? opts.lower.feeGrowthOutside0
      : wrappingSubU128(opts.feeGrowthGlobal0, opts.lower.feeGrowthOutside0)
  const below1 =
    opts.currentTick >= opts.tickLower
      ? opts.lower.feeGrowthOutside1
      : wrappingSubU128(opts.feeGrowthGlobal1, opts.lower.feeGrowthOutside1)

  const above0 =
    opts.currentTick < opts.tickUpper
      ? opts.upper.feeGrowthOutside0
      : wrappingSubU128(opts.feeGrowthGlobal0, opts.upper.feeGrowthOutside0)
  const above1 =
    opts.currentTick < opts.tickUpper
      ? opts.upper.feeGrowthOutside1
      : wrappingSubU128(opts.feeGrowthGlobal1, opts.upper.feeGrowthOutside1)

  return {
    feeGrowthInside0: wrappingSubU128(
      wrappingSubU128(opts.feeGrowthGlobal0, below0),
      above0,
    ),
    feeGrowthInside1: wrappingSubU128(
      wrappingSubU128(opts.feeGrowthGlobal1, below1),
      above1,
    ),
  }
}

/**
 * Pending fees: L × ΔfeeGrowthInside / 2^feeGrowthShift.
 * feeGrowthShift from dexes.fee_growth_shift (never hardcode a single chain).
 */
export function pendingFeesFromGrowth(opts: {
  liquidity: bigint
  feeGrowthInside0Now: bigint
  feeGrowthInside1Now: bigint
  feeGrowthInside0Last: bigint
  feeGrowthInside1Last: bigint
  feeGrowthShift: number
}): { fees0: bigint; fees1: bigint } {
  if (opts.feeGrowthShift < 0 || opts.feeGrowthShift > 256) {
    throw new Error(`invalid feeGrowthShift ${opts.feeGrowthShift}`)
  }
  const denom = 1n << BigInt(opts.feeGrowthShift)
  const d0 = wrappingSubU128(
    opts.feeGrowthInside0Now,
    opts.feeGrowthInside0Last,
  )
  const d1 = wrappingSubU128(
    opts.feeGrowthInside1Now,
    opts.feeGrowthInside1Last,
  )
  return {
    fees0: (opts.liquidity * d0) / denom,
    fees1: (opts.liquidity * d1) / denom,
  }
}
