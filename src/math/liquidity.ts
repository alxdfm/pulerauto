/**
 * Reconstruct active liquidity L from tick nets (spec §15 invariant 2).
 * Crossing tick i left→right applies liquidity_net(i).
 * L_active at `currentTick` = sum of nets for all ticks ≤ currentTick.
 */

export type TickNet = {
  tickIndex: number
  liquidityNet: bigint
  liquidityGross?: bigint
}

export type ReconstructResult = {
  activeLiquidity: bigint
  sumNet: bigint
  grossViolations: number
}

export function reconstructActiveLiquidity(
  ticks: TickNet[],
  currentTick: number,
): ReconstructResult {
  let active = 0n
  let sumNet = 0n
  let grossViolations = 0

  const sorted = [...ticks].sort((a, b) => a.tickIndex - b.tickIndex)

  for (const t of sorted) {
    sumNet += t.liquidityNet
    if (t.liquidityGross !== undefined) {
      const absNet =
        t.liquidityNet < 0n ? -t.liquidityNet : t.liquidityNet
      if (t.liquidityGross < absNet) {
        grossViolations += 1
      }
    }
    if (t.tickIndex <= currentTick) {
      active += t.liquidityNet
    }
  }

  return { activeLiquidity: active, sumNet, grossViolations }
}

/** Invariant 1: sum of liquidity_net over a pool must be 0. */
export function assertSumNetZero(ticks: TickNet[]): void {
  const { sumNet } = reconstructActiveLiquidity(ticks, Number.MAX_SAFE_INTEGER)
  if (sumNet !== 0n) {
    throw new Error(`sum(liquidity_net) = ${sumNet}, expected 0`)
  }
}
