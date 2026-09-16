import { describe, expect, it } from 'vitest'
import { hodl5050Pnl, hodlVolatile100Pnl, lpFullRangePnl } from './benchmarks.js'
import { lvrPeriodCost, secondsToYears } from './lvr-period.js'
import {
  passesRealityCheck,
  realityCheckPValue,
} from './reality-check.js'
import {
  cvar95,
  equityFromPeriodPnl,
  maxDrawdown,
} from './risk-metrics.js'
import { walkForwardFolds } from './walk-forward.js'

describe('walkForwardFolds', () => {
  it('builds non-overlapping OOS folds', () => {
    const folds = walkForwardFolds({
      windowStart: new Date('2026-01-01T00:00:00Z'),
      windowEnd: new Date('2026-04-01T00:00:00Z'),
      trainDays: 30,
      testDays: 15,
    })
    expect(folds.length).toBeGreaterThan(0)
    for (const f of folds) {
      expect(f.isOutOfSample).toBe(true)
      expect(f.trainEnd.getTime()).toBe(f.testStart.getTime())
      expect(f.testEnd.getTime()).toBeGreaterThan(f.testStart.getTime())
    }
  })
})

describe('realityCheckPValue', () => {
  it('returns 1 when excess is non-positive', () => {
    const p = realityCheckPValue({
      excessReturns: [-0.1, -0.05, 0],
      nTrials: 10,
      bootstrapSamples: 50,
      random: () => 0.5,
    })
    expect(p).toBe(1)
  })

  it('passes gate for strong positive excess with nTrials=1', () => {
    const p = realityCheckPValue({
      excessReturns: [1, 1, 1, 1, 1, 1, 1, 1],
      nTrials: 1,
      bootstrapSamples: 200,
      random: (() => {
        let i = 0
        return () => {
          i += 1
          return (i % 10) / 10
        }
      })(),
    })
    expect(passesRealityCheck(p, 0.05)).toBe(true)
  })
})

describe('risk metrics', () => {
  it('maxDrawdown and cvar95', () => {
    const eq = equityFromPeriodPnl([10, -5, -20, 8], 100)
    expect(maxDrawdown(eq)).toBeGreaterThan(0)
    expect(cvar95([-1, -2, -10, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])).toBeLessThan(0)
  })
})

describe('lvrPeriodCost', () => {
  it('scales with time in range', () => {
    const year = lvrPeriodCost({
      lvrRateAnnual: 0.5,
      valueQuote: 1000,
      timeInRangeYears: 1,
    })
    expect(year).toBe(500)
    expect(secondsToYears(365.25 * 24 * 3600)).toBeCloseTo(1, 10)
  })
})

describe('benchmarks', () => {
  it('hodl variants and full-range', () => {
    const h50 = hodl5050Pnl({
      entryNotionalUsd: 100,
      entryPrice: 100,
      exitPrice: 110,
    })
    expect(h50.pnlUsd).toBeCloseTo(5, 8)
    const h100 = hodlVolatile100Pnl({
      entryNotionalUsd: 100,
      entryPrice: 100,
      exitPrice: 110,
    })
    expect(h100.pnlUsd).toBeCloseTo(10, 8)
    const fr = lpFullRangePnl({
      entryNotionalUsd: 100,
      entryPrice: 100,
      exitPrice: 110,
      feesUsd: 2,
      costsUsd: 0.5,
    })
    expect(fr.pnlUsd).toBeCloseTo(h50.pnlUsd + 2 - 0.5, 8)
  })
})
