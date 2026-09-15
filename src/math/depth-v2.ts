/**
 * Depth equivalent-v2 D₂ ≡ 2 · L_ativa · √p (spec §4).
 * Float allowed for ranking metrics; not for on-chain fee growth.
 */

/** D₂ from human price p (token1 per token0) and active liquidity L. */
export function depthV2(liquidity: number, price: number): number {
  if (!(liquidity > 0 && price > 0)) {
    throw new Error('D2 requires positive liquidity and price')
  }
  return 2 * liquidity * Math.sqrt(price)
}

/**
 * When L is Q64 Whirlpool liquidity and price is human, callers must scale L
 * into a depth-USD convention first. This helper is for already-scaled inputs
 * matching the §4 numeric example (D₂ in USD).
 */
export function depthV2Usd(liquidityUsdScaled: number, price: number): number {
  return depthV2(liquidityUsdScaled, price)
}
