/**
 * Width factor W and amplification A (spec §2).
 * Float allowed only for unit tests matching published numeric examples.
 */

export function widthFactor(p: number, pa: number, pb: number): number {
  if (!(p > 0 && pa > 0 && pb > pa)) {
    throw new Error('invalid prices for W')
  }
  return 2 * Math.sqrt(p) - Math.sqrt(pa) - p / Math.sqrt(pb)
}

/** A = 1 / (1 - (pa/pb)^(1/4)); exact at geometric center. */
export function amplification(pa: number, pb: number): number {
  if (!(pa > 0 && pb > pa)) {
    throw new Error('invalid range for A')
  }
  return 1 / (1 - (pa / pb) ** 0.25)
}

/** For multiplicative range [p/r, p·r]: A = 1 / (1 - r^(-1/2)) */
export function amplificationFromRatio(r: number): number {
  if (!(r > 1)) {
    throw new Error('r must be > 1')
  }
  return 1 / (1 - r ** -0.5)
}

/** LVR rate in-range at geometric center: (σ²/8)·A */
export function lvrRateAtCenter(sigmaAnnual: number, a: number): number {
  return ((sigmaAnnual * sigmaAnnual) / 8) * a
}
