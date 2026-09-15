/**
 * EdgeRatio = SigmaImplied / sigma_30d (spec §4). Primary ranking metric.
 */

export function edgeRatio(sigmaImplied: number, sigma30d: number): number {
  if (!(sigmaImplied > 0 && sigma30d > 0)) {
    throw new Error('EdgeRatio requires positive SigmaImplied and sigma_30d')
  }
  return sigmaImplied / sigma30d
}

/** Suggested entry threshold from spec (~1.3). */
export const DEFAULT_MIN_EDGE_RATIO = 1.3
