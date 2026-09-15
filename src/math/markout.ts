/**
 * Markout — flow toxicity with corrected sign (spec §7).
 * markout_LP(Δt) = Σ amount0_s × (p(t_s+Δt) − p_exec,s)
 * amount0 > 0 ⇒ pool received token0; positive product ⇒ LP gained.
 */

export type MarkoutSample = {
  amount0: number
  priceExec: number
  priceAfter: number
}

export function markoutLp(samples: MarkoutSample[]): number {
  let sum = 0
  for (const s of samples) {
    sum += s.amount0 * (s.priceAfter - s.priceExec)
  }
  return sum
}

export function markoutBps(markoutLpValue: number, volume: number): number {
  if (!(volume > 0)) {
    throw new Error('markout_bps requires positive volume')
  }
  return (markoutLpValue / volume) * 10_000
}
