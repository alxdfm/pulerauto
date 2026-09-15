/**
 * Regime — Kaufman Efficiency Ratio and calibrated quantile (spec §11).
 * ER(n) = |p_t − p_{t−n}| / Σ|Δp_i|
 */

export function efficiencyRatio(prices: number[]): number {
  if (prices.length < 2) {
    throw new Error('ER requires at least 2 prices')
  }
  const first = prices[0]!
  const last = prices[prices.length - 1]!
  const change = Math.abs(last - first)
  let path = 0
  for (let i = 1; i < prices.length; i++) {
    path += Math.abs(prices[i]! - prices[i - 1]!)
  }
  if (path === 0) return 0
  return change / path
}

/** Empirical quantile in [0,1] of a sample (inclusive linear). */
export function empiricalQuantile(values: number[], q: number): number {
  if (values.length === 0) {
    throw new Error('quantile requires non-empty sample')
  }
  if (!(q >= 0 && q <= 1)) {
    throw new Error('q must be in [0,1]')
  }
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  const w = idx - lo
  return sorted[lo]! * (1 - w) + sorted[hi]! * w
}

/**
 * er_q80 over available ER history (up to 90d when present).
 * Column name remains er_q80_90d even if window < 90.
 */
export function erQuantile80(efficiencyRatios: number[]): number {
  return empiricalQuantile(efficiencyRatios, 0.8)
}

export function isTrendingRegime(
  erNow: number,
  erQ80: number,
): boolean {
  return erNow > erQ80
}
