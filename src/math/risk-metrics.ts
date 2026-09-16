/**
 * Risk metrics for BacktestRun paths (spec §12): CVaR₉₅, max drawdown.
 */

/** Maximum peak-to-trough drawdown on an equity / cumulative PnL path. */
export function maxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length === 0) return 0
  let peak = equityCurve[0]!
  let maxDd = 0
  for (const v of equityCurve) {
    if (v > peak) peak = v
    const dd = peak - v
    if (dd > maxDd) maxDd = dd
  }
  return maxDd
}

/**
 * CVaR₉₅ = mean of losses in the worst 5% tail of the PnL series.
 * Returns a negative number when the tail is losses (spec constraint form).
 */
export function cvar95(pnlSeries: number[]): number {
  if (pnlSeries.length === 0) return 0
  const sorted = [...pnlSeries].sort((a, b) => a - b)
  const tailCount = Math.max(1, Math.ceil(sorted.length * 0.05))
  const tail = sorted.slice(0, tailCount)
  return tail.reduce((a, b) => a + b, 0) / tail.length
}

/** Running cumulative sum → equity curve from period PnL. */
export function equityFromPeriodPnl(
  periodPnl: number[],
  startEquity = 0,
): number[] {
  const out: number[] = []
  let eq = startEquity
  for (const p of periodPnl) {
    eq += p
    out.push(eq)
  }
  return out
}
