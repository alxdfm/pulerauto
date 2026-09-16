/**
 * Benchmark PnL paths for BacktestRun (spec §12):
 * HODL 50/50, HODL 100% volatile, LP full-range.
 */

export type PricePoint = {
  ts: Date
  /** Price of token0 in token1 (quote). */
  price: number
}

export type BenchmarkPnl = {
  pnlUsd: number
  /** Alias used in reports vs concentrated strategy. */
  label: 'hodl_50_50' | 'hodl_volatile_100' | 'lp_full_range'
}

/**
 * HODL 50/50: half notional in token0, half in token1 at entry;
 * mark at exit price (token1 = cash).
 */
export function hodl5050Pnl(opts: {
  entryNotionalUsd: number
  entryPrice: number
  exitPrice: number
}): BenchmarkPnl {
  const half = opts.entryNotionalUsd / 2
  const amount0 = half / opts.entryPrice
  const amount1 = half
  const exitValue = amount0 * opts.exitPrice + amount1
  return {
    label: 'hodl_50_50',
    pnlUsd: exitValue - opts.entryNotionalUsd,
  }
}

/** HODL 100% of the volatile asset (token0). */
export function hodlVolatile100Pnl(opts: {
  entryNotionalUsd: number
  entryPrice: number
  exitPrice: number
}): BenchmarkPnl {
  const amount0 = opts.entryNotionalUsd / opts.entryPrice
  const exitValue = amount0 * opts.exitPrice
  return {
    label: 'hodl_volatile_100',
    pnlUsd: exitValue - opts.entryNotionalUsd,
  }
}

/**
 * Full-range LP approximation: value tracks 50/50 inventory with fee income.
 * Pass reconstructed fees already attributed to the full-range share.
 */
export function lpFullRangePnl(opts: {
  entryNotionalUsd: number
  entryPrice: number
  exitPrice: number
  feesUsd: number
  costsUsd?: number
}): BenchmarkPnl {
  const inventory = hodl5050Pnl(opts)
  const costs = opts.costsUsd ?? 0
  return {
    label: 'lp_full_range',
    pnlUsd: inventory.pnlUsd + opts.feesUsd - costs,
  }
}

/** First/last price helpers for a path. */
export function pathEndpoints(path: PricePoint[]): {
  entryPrice: number
  exitPrice: number
} {
  if (path.length < 2) throw new Error('price path needs ≥2 points')
  return {
    entryPrice: path[0]!.price,
    exitPrice: path[path.length - 1]!.price,
  }
}
