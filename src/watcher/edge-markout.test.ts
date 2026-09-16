import { describe, expect, it } from 'vitest'
import { simulateConcentratedStrategy } from '../analyzer/backtest-simulate.js'
import {
  buildBacktestRunInsert,
  evaluateBacktestGate,
} from '../analyzer/backtest-report.js'
import { candidateRangeRatios } from '../analyzer/backtest-run.js'
import { buildDedupKey } from './dedup.js'

describe('edge/markout dedup keys', () => {
  it('scopes by pool', () => {
    const key = buildDedupKey({
      kind: 'edge_decay',
      strategyId: 1,
      extra: 'pool:1',
    })
    expect(key).toContain('edge_decay')
    expect(key).toContain('pool:1')
  })
})

describe('candidateRangeRatios', () => {
  it('caps at 3 trials', () => {
    expect(candidateRangeRatios(1.1, 1)).toEqual([1.1])
    expect(candidateRangeRatios(1.1, 3)).toHaveLength(3)
    expect(candidateRangeRatios(1.1, 99)).toHaveLength(3)
  })
})

describe('simulateConcentratedStrategy', () => {
  it('calibrates entry mark to notional and captures timed fees', () => {
    const start = new Date('2026-01-01T00:00:00Z')
    const path = Array.from({ length: 10 }, (_, i) => ({
      ts: new Date(start.getTime() + i * 3600_000),
      price: 100 + i * 0.1,
    }))
    const sim = simulateConcentratedStrategy({
      entryNotionalUsd: 1000,
      rangeRatio: 1.1,
      pricePath: path,
      swaps: [
        {
          ts: path[1]!.ts,
          feeIsToken0: false,
          segments: [
            {
              // Cover full tick space so capture intersects calibrated range.
              tickLo: -887_272,
              tickHi: 887_272,
              liquiditySeg: 10_000_000n,
              amountInSeg: 1_000_000n,
              feeSeg: 400_000n,
            },
          ],
        },
      ],
      sigmaAnnual: 0.8,
      jitFactor: 1,
    })
    expect(sim.liquidity).toBeGreaterThan(0)
    expect(Math.abs(sim.pnlUsd)).toBeLessThan(5_000)
    expect(sim.timeInRange).toBeGreaterThanOrEqual(0)
    expect(sim.timeInRange).toBeLessThanOrEqual(1)
    expect(sim.feesUsd).toBeGreaterThan(0)

    const insert = buildBacktestRunInsert({
      strategyId: 1,
      poolId: 1,
      windowStart: path[0]!.ts,
      windowEnd: path[path.length - 1]!.ts,
      isOutOfSample: true,
      nTrials: 1,
      jitFactor: 1,
      sim,
      paramsSnapshot: { test: true },
      bootstrapSamples: 50,
    })
    expect(insert.feeSource).toBe('reconstructed_segments')
    expect(insert.nTrials).toBe(1)

    const gate = evaluateBacktestGate({
      pnlVsHodl5050Usd: 1,
      pnlVsHodlVolatileUsd: 1,
      pnlVsFullRangeUsd: 1,
      realityCheckPvalue: 0.01,
    })
    expect(gate.ok).toBe(true)
  })
})
