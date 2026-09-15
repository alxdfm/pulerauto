import { describe, expect, it } from 'vitest'
import {
  amplificationFromRatio,
  lvrRateAtCenter,
  priceFromTick,
  reconstructActiveLiquidity,
  roundTickOutward,
  tickFromPrice,
  widthFactor,
} from './index.js'

describe('tick ↔ price', () => {
  it('round-trips near tick 0', () => {
    expect(priceFromTick(0)).toBeCloseTo(1, 12)
    expect(tickFromPrice(1)).toBe(0)
  })

  it('tickFromPrice is floor of inverse', () => {
    // Float path: accept ±1 tick of rounding error near boundaries
    const p = priceFromTick(100)
    expect(tickFromPrice(p)).toBeGreaterThanOrEqual(99)
    expect(tickFromPrice(p)).toBeLessThanOrEqual(100)
    expect(tickFromPrice(p * 1.00005)).toBeGreaterThanOrEqual(99)
    expect(tickFromPrice(1.0)).toBe(0)
  })

  it('roundTickOutward widens to spacing', () => {
    expect(roundTickOutward(-7, 9, 4)).toEqual({
      tickLower: -8,
      tickUpper: 12,
    })
  })
})

describe('primitives W and A (spec §2)', () => {
  it('amplification table matches ±10%', () => {
    const a = amplificationFromRatio(1.1)
    expect(a).toBeCloseTo(21.48808848, 5)
  })

  it('A exact at geometric center for p=150, r=1.10', () => {
    const p = 150
    const r = 1.1
    const pa = p / r
    const pb = p * r
    const a = amplificationFromRatio(r)
    const w = widthFactor(p, pa, pb)
    // W = 2√p / A at geometric center
    expect(w).toBeCloseTo((2 * Math.sqrt(p)) / a, 8)
  })

  it('LVR_rate at center = (σ²/8)·A (spec §3)', () => {
    const sigma = 0.8
    const a = amplificationFromRatio(1.1)
    const rate = lvrRateAtCenter(sigma, a)
    expect(rate).toBeCloseTo(1.71904708, 5)
  })
})

describe('reconstructActiveLiquidity (spec §15)', () => {
  it('sum of nets is zero and L matches expected', () => {
    const ticks = [
      { tickIndex: -100, liquidityNet: 1_000_000n, liquidityGross: 1_000_000n },
      { tickIndex: 100, liquidityNet: -1_000_000n, liquidityGross: 1_000_000n },
    ]
    const inRange = reconstructActiveLiquidity(ticks, 0)
    expect(inRange.sumNet).toBe(0n)
    expect(inRange.activeLiquidity).toBe(1_000_000n)
    expect(inRange.grossViolations).toBe(0)

    const below = reconstructActiveLiquidity(ticks, -200)
    expect(below.activeLiquidity).toBe(0n)

    const above = reconstructActiveLiquidity(ticks, 200)
    expect(above.activeLiquidity).toBe(0n)
  })

  it('flags gross < |net|', () => {
    const ticks = [
      { tickIndex: 0, liquidityNet: 10n, liquidityGross: 5n },
      { tickIndex: 10, liquidityNet: -10n, liquidityGross: 10n },
    ]
    const r = reconstructActiveLiquidity(ticks, 5)
    expect(r.grossViolations).toBe(1)
  })
})
