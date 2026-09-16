/**
 * Assemble BacktestRun row from simulation + RealityCheck (Epic 5).
 */

import type { BacktestRunInsert } from '../db/backtest-runs.js'
import { realityCheckPValue } from '../math/reality-check.js'
import type { SimulateStrategyResult } from './backtest-simulate.js'

export type BacktestReportInput = {
  strategyId: number
  poolId: number
  windowStart: Date
  windowEnd: Date
  isOutOfSample: boolean
  nTrials: number
  jitFactor: number
  sim: SimulateStrategyResult
  paramsSnapshot: Record<string, unknown>
  bootstrapSamples?: number
  trialMeans?: number[]
}

export function buildBacktestRunInsert(
  input: BacktestReportInput,
): BacktestRunInsert {
  const pValue = realityCheckPValue({
    excessReturns: input.sim.excessVsHodl5050,
    nTrials: input.nTrials,
    trialMeans: input.trialMeans,
    bootstrapSamples: input.bootstrapSamples ?? 500,
  })

  return {
    strategyId: input.strategyId,
    poolId: input.poolId,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    isOutOfSample: input.isOutOfSample,
    feeSource: 'reconstructed_segments',
    jitFactorApplied: input.jitFactor,
    nTrials: input.nTrials,
    realityCheckPvalue: pValue,
    regimesCovered: input.sim.regimesCovered,
    pnlUsd: input.sim.pnlUsd,
    pnlVsHodlUsd: input.sim.pnlVsHodl5050Usd,
    pnlVsFullrangeUsd: input.sim.pnlVsFullRangeUsd,
    maxDrawdown: input.sim.maxDrawdown,
    cvar95: input.sim.cvar95,
    timeInRange: input.sim.timeInRange,
    rebalanceCount: input.sim.rebalanceCount,
    totalCostsUsd: input.sim.totalCostsUsd,
    paramsSnapshot: {
      ...input.paramsSnapshot,
      pnlVsHodlVolatileUsd: input.sim.pnlVsHodlVolatileUsd,
      feesUsd: input.sim.feesUsd,
      lvrCostUsd: input.sim.lvrCostUsd,
    },
  }
}

export type BacktestGateResult = {
  ok: boolean
  beatsHodl5050: boolean
  beatsHodlVolatile: boolean
  beatsFullRange: boolean
  realityCheckOk: boolean
  detail: string
}

export function evaluateBacktestGate(opts: {
  pnlVsHodl5050Usd: number
  pnlVsHodlVolatileUsd: number
  pnlVsFullRangeUsd: number
  realityCheckPvalue: number
  alpha?: number
}): BacktestGateResult {
  const alpha = opts.alpha ?? 0.05
  const beatsHodl5050 = opts.pnlVsHodl5050Usd > 0
  const beatsHodlVolatile = opts.pnlVsHodlVolatileUsd > 0
  const beatsFullRange = opts.pnlVsFullRangeUsd > 0
  const realityCheckOk = opts.realityCheckPvalue < alpha
  const ok =
    beatsHodl5050 &&
    beatsHodlVolatile &&
    beatsFullRange &&
    realityCheckOk
  return {
    ok,
    beatsHodl5050,
    beatsHodlVolatile,
    beatsFullRange,
    realityCheckOk,
    detail: ok
      ? 'OOS gate passed'
      : `fail hodl50=${beatsHodl5050} hodlVol=${beatsHodlVolatile} fullRange=${beatsFullRange} rc=${realityCheckOk} p=${opts.realityCheckPvalue}`,
  }
}
