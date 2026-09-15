/**
 * Hysteresis for alert firing. Pure logic — no I/O.
 *
 * Boolean condition (e.g. outOfRange): arm when true, fire once after minSec,
 * stay latched until condition clears (no re-fire while still true).
 * episodeFired is set by the caller only after a successful emit.
 */

export type LatchState = {
  active: boolean
  sinceAt: Date | null
  episodeFired: boolean
}

export type HysteresisDecision = {
  shouldFire: boolean
  /** Latch to persist immediately (arm / clear). Never sets episodeFired. */
  nextLatch: LatchState
  /** Proposed FIRED latch — persist only after emit succeeds. */
  firedLatch: LatchState | null
}

export function alreadyFiredThisEpisode(latch: LatchState): boolean {
  return latch.active && latch.episodeFired
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
      nextLatch: { active: false, sinceAt: null, episodeFired: false },
      firedLatch: null,
    }
  }
  if (alreadyFiredThisEpisode(opts.latch)) {
    return {
      shouldFire: false,
      nextLatch: opts.latch,
      firedLatch: null,
    }
  }
  if (!opts.latch.active || opts.latch.sinceAt === null) {
    return {
      shouldFire: false,
      nextLatch: {
        active: true,
        sinceAt: opts.now,
        episodeFired: false,
      },
      firedLatch: null,
    }
  }
  const elapsedSec =
    (opts.now.getTime() - opts.latch.sinceAt.getTime()) / 1000
  if (elapsedSec < opts.minSec) {
    return {
      shouldFire: false,
      nextLatch: opts.latch,
      firedLatch: null,
    }
  }
  const armed: LatchState = {
    active: true,
    sinceAt: opts.latch.sinceAt,
    episodeFired: false,
  }
  return {
    shouldFire: true,
    nextLatch: armed,
    firedLatch: {
      active: true,
      sinceAt: opts.latch.sinceAt,
      episodeFired: true,
    },
  }
}
