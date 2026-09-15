/**
 * Fee capture by swap segments (spec §5).
 * Your fees = Σ fee_seg × (L_you / L_active_seg) for intersecting segments.
 * fee_seg already embeds fee_rate_LP × vol_seg for that segment.
 */

export type SwapSegment = {
  tickLo: number
  tickHi: number
  liquiditySeg: bigint
  amountInSeg: bigint
  feeSeg: bigint
}

export type FeeCaptureInput = {
  yourLiquidity: bigint
  segments: SwapSegment[]
  rangeTickLower: number
  rangeTickUpper: number
}

/** Ranges [lo, hi) intersect if lo < otherHi && otherLo < hi */
export function rangesIntersect(
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): boolean {
  return aLo < bHi && bLo < aHi
}

/**
 * Allocate parent fee_amount across segments proportional to amount_in_seg.
 * Ensures Σ fee_seg === feeAmount (integer remainder to last segment).
 */
export function allocateFeeSegments(
  amountInSegs: bigint[],
  feeAmount: bigint,
): bigint[] {
  if (amountInSegs.length === 0) return []
  const totalIn = amountInSegs.reduce((a, b) => a + b, 0n)
  if (totalIn === 0n) {
    return amountInSegs.map((_, i) => (i === 0 ? feeAmount : 0n))
  }

  const fees: bigint[] = []
  let allocated = 0n
  for (let i = 0; i < amountInSegs.length; i++) {
    if (i === amountInSegs.length - 1) {
      fees.push(feeAmount - allocated)
    } else {
      const part = (feeAmount * amountInSegs[i]!) / totalIn
      fees.push(part)
      allocated += part
    }
  }
  return fees
}

/**
 * Build fee_seg from fee_rate_LP × amount_in when the chain does not emit per-segment fees.
 * Uses integer millibps (feeRateLp * 1e6) to avoid float in the hot path when possible.
 * For unit tests with decimal rates, pass precomputed feeSeg instead.
 */
export function feeSegFromVolume(
  amountInSeg: bigint,
  feeRateLp: number,
): bigint {
  // feeRateLp is a fraction (e.g. 0.0004). Scale to 1e9 for bigint math.
  const scale = 1_000_000_000n
  const rateScaled = BigInt(Math.round(feeRateLp * Number(scale)))
  return (amountInSeg * rateScaled) / scale
}

/** Your fee share from segments intersecting your range. */
export function captureYourFees(input: FeeCaptureInput): bigint {
  let total = 0n
  const { yourLiquidity, segments, rangeTickLower, rangeTickUpper } = input

  for (const seg of segments) {
    if (
      !rangesIntersect(
        rangeTickLower,
        rangeTickUpper,
        seg.tickLo,
        seg.tickHi,
      )
    ) {
      continue
    }
    if (seg.liquiditySeg === 0n) continue
    total += (seg.feeSeg * yourLiquidity) / seg.liquiditySeg
  }
  return total
}

/** Invariant 5: sum of fee_seg equals parent fee_amount. */
export function assertFeeSegmentsReconcile(
  segments: { feeSeg: bigint }[],
  feeAmount: bigint,
): void {
  const sum = segments.reduce((a, s) => a + s.feeSeg, 0n)
  if (sum !== feeAmount) {
    throw new Error(`Σ fee_seg (${sum}) !== fee_amount (${feeAmount})`)
  }
}

export function feeRateLp(
  feeTier: number,
  protocolFeeShare: number,
): number {
  return feeTier * (1 - protocolFeeShare)
}
