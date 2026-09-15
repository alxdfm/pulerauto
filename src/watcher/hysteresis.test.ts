import { describe, expect, it } from 'vitest'
import {
  alreadyFiredThisEpisode,
  evaluateBooleanHysteresis,
} from './hysteresis.js'
import { buildDedupKey, canEmitAlert, withinCooldown } from './dedup.js'

describe('hysteresis', () => {
  const t0 = new Date('2026-09-15T12:00:00Z')

  it('arms then fires after minSec; FIRED only via firedLatch', () => {
    const arm = evaluateBooleanHysteresis({
      conditionTrue: true,
      now: t0,
      latch: { active: false, sinceAt: null, episodeFired: false },
      minSec: 60,
    })
    expect(arm.shouldFire).toBe(false)
    expect(arm.nextLatch.active).toBe(true)
    expect(arm.firedLatch).toBeNull()

    const early = evaluateBooleanHysteresis({
      conditionTrue: true,
      now: new Date(t0.getTime() + 30_000),
      latch: arm.nextLatch,
      minSec: 60,
    })
    expect(early.shouldFire).toBe(false)

    const fire = evaluateBooleanHysteresis({
      conditionTrue: true,
      now: new Date(t0.getTime() + 60_000),
      latch: arm.nextLatch,
      minSec: 60,
    })
    expect(fire.shouldFire).toBe(true)
    expect(fire.nextLatch.episodeFired).toBe(false)
    expect(fire.firedLatch).not.toBeNull()
    expect(alreadyFiredThisEpisode(fire.firedLatch!)).toBe(true)

    const again = evaluateBooleanHysteresis({
      conditionTrue: true,
      now: new Date(t0.getTime() + 120_000),
      latch: fire.firedLatch!,
      minSec: 60,
    })
    expect(again.shouldFire).toBe(false)

    const clear = evaluateBooleanHysteresis({
      conditionTrue: false,
      now: new Date(t0.getTime() + 180_000),
      latch: fire.firedLatch!,
      minSec: 60,
    })
    expect(clear.nextLatch.active).toBe(false)
    expect(clear.nextLatch.episodeFired).toBe(false)
  })

  it('keeps armed (not fired) when emit is deferred', () => {
    const armed = {
      active: true,
      sinceAt: t0,
      episodeFired: false,
    }
    const fire = evaluateBooleanHysteresis({
      conditionTrue: true,
      now: new Date(t0.getTime() + 60_000),
      latch: armed,
      minSec: 60,
    })
    // Simulate dedup reject: persist nextLatch (armed), not firedLatch
    expect(fire.shouldFire).toBe(true)
    const afterReject = evaluateBooleanHysteresis({
      conditionTrue: true,
      now: new Date(t0.getTime() + 120_000),
      latch: fire.nextLatch,
      minSec: 60,
    })
    expect(afterReject.shouldFire).toBe(true)
  })
})

describe('dedup', () => {
  it('blocks within cooldown', () => {
    const now = new Date('2026-09-15T12:00:00Z')
    const last = new Date('2026-09-15T11:50:00Z')
    expect(
      withinCooldown({ lastAlertAt: last, now, cooldownSec: 900 }),
    ).toBe(true)
    expect(canEmitAlert({ lastAlertAt: last, now, cooldownSec: 900 })).toBe(
      false,
    )
    expect(
      canEmitAlert({
        lastAlertAt: last,
        now: new Date('2026-09-15T12:20:00Z'),
        cooldownSec: 900,
      }),
    ).toBe(true)
  })

  it('builds stable dedup keys', () => {
    expect(
      buildDedupKey({ kind: 'range_exit', positionId: 3 }),
    ).toBe('range_exit|pos:3')
  })
})
