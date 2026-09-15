/**
 * SigmaImplied — break-even vol from fee vs LVR (spec §4).
 * σ_impl = sqrt(8 · fee_rate_LP · Vol_anual / D₂)
 */

export function sigmaImplied(opts: {
  feeRateLp: number
  volumeAnnualUsd: number
  depthV2Usd: number
}): number {
  const { feeRateLp, volumeAnnualUsd, depthV2Usd } = opts
  if (!(feeRateLp > 0 && volumeAnnualUsd > 0 && depthV2Usd > 0)) {
    throw new Error('SigmaImplied requires positive feeRateLp, Vol, D2')
  }
  return Math.sqrt((8 * feeRateLp * volumeAnnualUsd) / depthV2Usd)
}

/** Vol_anual from daily USD volume (× 365). */
export function volumeAnnualFromDaily(volumeDailyUsd: number): number {
  return volumeDailyUsd * 365
}
