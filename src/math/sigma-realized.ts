/**
 * Annualized vol of the price ratio from log returns (sigma_30d input).
 */

export function sigmaAnnualFromLogReturns(
  logReturns: number[],
  periodsPerYear: number,
): number {
  if (logReturns.length < 2) {
    throw new Error('sigma needs >= 2 log returns')
  }
  const mean =
    logReturns.reduce((a, b) => a + b, 0) / logReturns.length
  let varSum = 0
  for (const r of logReturns) {
    const d = r - mean
    varSum += d * d
  }
  const variance = varSum / (logReturns.length - 1)
  return Math.sqrt(variance * periodsPerYear)
}

export function logReturnsFromPrices(prices: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1]!
    const cur = prices[i]!
    if (!(prev > 0 && cur > 0)) {
      throw new Error('prices must be positive for log returns')
    }
    out.push(Math.log(cur / prev))
  }
  return out
}
