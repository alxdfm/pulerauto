/**
 * White Reality Check approximation (spec §12 / ADR Epic 5).
 * Bootstrap max-under-null of mean excess; inflate by nTrials.
 * Not the full White (2000) procedure over a stored trial surface —
 * pass nTrials = actual search size; prefer trialMeans when available.
 */

export type RealityCheckInput = {
  /** Per-period excess returns of the selected candidate. */
  excessReturns: number[]
  /** How many parameter trials were searched (required). */
  nTrials: number
  /**
   * Optional mean excess per trial (length = nTrials).
   * When set, p-value uses max(trialMeans) vs bootstrap max under H0
   * recentered from the selected series.
   */
  trialMeans?: number[]
  bootstrapSamples?: number
  random?: () => number
}

function meanOf(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function bootstrapMean(
  recentered: number[],
  random: () => number,
): number {
  const n = recentered.length
  let sum = 0
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(random() * n)
    sum += recentered[idx]!
  }
  return sum / n
}

/**
 * One-sided p-value: P(max under H0 ≥ observed | recentered bootstrap).
 */
export function realityCheckPValue(input: RealityCheckInput): number {
  const { excessReturns, nTrials } = input
  if (nTrials < 1) throw new Error('nTrials must be ≥ 1')
  if (excessReturns.length === 0) throw new Error('excessReturns empty')

  const observedMean =
    input.trialMeans && input.trialMeans.length > 0
      ? Math.max(...input.trialMeans)
      : meanOf(excessReturns)
  if (!(observedMean > 0)) return 1

  const mean = meanOf(excessReturns)
  const recentered = excessReturns.map((x) => x - mean)
  const samples = input.bootstrapSamples ?? 1000
  const random = input.random ?? Math.random
  const trials = input.trialMeans?.length ?? nTrials

  let exceed = 0
  for (let b = 0; b < samples; b++) {
    let maxBoot = bootstrapMean(recentered, random)
    for (let t = 1; t < trials; t++) {
      maxBoot = Math.max(maxBoot, bootstrapMean(recentered, random))
    }
    if (maxBoot >= observedMean) exceed += 1
  }
  return exceed / samples
}

/** Gate helper: OOS claim requires p < alpha (default 0.05). */
export function passesRealityCheck(
  pValue: number,
  alpha = 0.05,
): boolean {
  return pValue < alpha
}
