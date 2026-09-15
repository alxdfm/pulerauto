/**
 * Hysteresis for alert firing. Pure logic — no I/O.
 *
 * Boolean condition (e.g. outOfRange): arm when true, fire once after minSec,
 * stay latched until condition clears (no re-fire while still true).
 */

export type LatchState = {
  active: boolean
  sinceAt: Date | null
}

export type HysteresisDecision = {
  shouldFire: boolean
  nextLatch: LatchState
}

const FIRED_SENTINEL = new Date(0)

export function alreadyFiredThisEpisode(latch: LatchState): boolean {
  return (
    latch.active &&
    latch.sinceAt !== null &&
    latch.sinceAt.getTime() === 0
  )
}

export function evaluateBooleanHysteresis(opts: {
  conditionTrue: boolean
  now: Date
  latch: LatchState
  minSec: number
}): HysteresisDecision {
  if (!opts.conditionTrue) {
    return {
      shouldFire: false,
      nextLatch: { active: false, sinceAt: null },
    }
  }
  if (alreadyFiredThisEpisode(opts.latch)) {
    return { shouldFire: false, nextLatch: opts.latch }
  }
  if (!opts.latch.active || opts.latch.sinceAt === null) {
    return {
      shouldFire: false,
      nextLatch: { active: true, sinceAt: opts.now },
    }
  }
  const elapsedSec =
    (opts.now.getTime() - opts.latch.sinceAt.getTime()) / 1000
  if (elapsedSec < opts.minSec) {
    return { shouldFire: false, nextLatch: opts.latch }
  }
  return {
    shouldFire: true,
    nextLatch: { active: true, sinceAt: FIRED_SENTINEL },
  }
}
