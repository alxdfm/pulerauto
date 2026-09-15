/** Tick ↔ price conventions (spec §1). Solana Orca uses same 1.0001^i tick space. */

export const LN_1_0001 = Math.log(1.0001)

/** Price from tick index: p = 1.0001^i */
export function priceFromTick(tick: number): number {
  return Math.exp(tick * LN_1_0001)
}

/** Tick from price: floor(ln(p) / ln(1.0001)) */
export function tickFromPrice(price: number): number {
  if (!(price > 0)) {
    throw new Error(`price must be positive, got ${price}`)
  }
  return Math.floor(Math.log(price) / LN_1_0001)
}

/**
 * Human price from raw Q-format sqrtPrice.
 * Solana Whirlpool: Q64.64 → p_raw = (sqrt / 2^64)^2
 * EVM Uniswap: Q64.96 → p_raw = (sqrt / 2^96)^2
 */
export function priceFromSqrtPriceX(
  sqrtPrice: bigint,
  fractionBits: 64 | 96,
  decimals0: number,
  decimals1: number,
): number {
  const denom = 2n ** BigInt(fractionBits)
  // Use number only at presentation boundary (spec allows float only there).
  const sqrt = Number(sqrtPrice) / Number(denom)
  const pRaw = sqrt * sqrt
  return pRaw * 10 ** (decimals0 - decimals1)
}

/** Round tick outward (wider range) to tickSpacing — conservative per spec §1. */
export function roundTickOutward(
  tickLower: number,
  tickUpper: number,
  tickSpacing: number,
): { tickLower: number; tickUpper: number } {
  const lower = Math.floor(tickLower / tickSpacing) * tickSpacing
  const upper = Math.ceil(tickUpper / tickSpacing) * tickSpacing
  return { tickLower: lower, tickUpper: upper }
}
