/**
 * Load pool path + segments and run WalkForward BacktestRuns (Epic 5).
 * Train selects among ≤3 rangeRatio trials; only OOS folds are persisted.
 */

import type { Db } from '../db/client.js'
import { insertBacktestRun } from '../db/backtest-runs.js'
import { priceFromSqrtPriceX } from '../math/tick-price.js'
import { walkForwardFolds } from '../math/walk-forward.js'
import {
  buildBacktestRunInsert,
  evaluateBacktestGate,
  type BacktestGateResult,
} from './backtest-report.js'
import {
  simulateConcentratedStrategy,
  type SimPricePoint,
  type SimSwap,
  type SimulateStrategyResult,
} from './backtest-simulate.js'

export type RunBacktestOpts = {
  strategyId: number
  poolId: number
  windowStart: Date
  windowEnd: Date
  trainDays: number
  testDays: number
  nTrials: number
  rangeRatio?: number
  entryNotionalUsd?: number
  sigmaAnnual?: number
  jitFactor?: number
  rebalanceTriggerPct?: number
  decimals0?: number
  decimals1?: number
  tickSpacing?: number
}

export type RunBacktestResult = {
  foldRunIds: number[]
  latestGate: BacktestGateResult | null
  detail?: string
}

async function loadPricePath(
  db: Db,
  poolId: number,
  start: Date,
  end: Date,
  decimals0: number,
  decimals1: number,
): Promise<SimPricePoint[]> {
  return db.withClient(async (client) => {
    const { rows } = await client.query<{
      ts: Date
      sqrt_price: string
    }>(
      `SELECT ts, sqrt_price::text
       FROM pool_states
       WHERE pool_id = $1 AND ts >= $2 AND ts < $3
       ORDER BY ts ASC, block_or_slot ASC`,
      [poolId, start, end],
    )
    return rows.map((r) => ({
      ts: r.ts,
      price: priceFromSqrtPriceX(
        BigInt(r.sqrt_price),
        64,
        decimals0,
        decimals1,
      ),
    }))
  })
}

async function loadSwapsWithSegments(
  db: Db,
  poolId: number,
  start: Date,
  end: Date,
): Promise<SimSwap[]> {
  return db.withClient(async (client) => {
    const { rows } = await client.query<{
      ts: Date
      tx_ref: string
      event_path: string
      amount0: string
      tick_lo: number | null
      tick_hi: number | null
      liquidity_seg: string | null
      amount_in_seg: string | null
      fee_seg: string | null
      seg_index: number | null
    }>(
      `SELECT s.ts, s.tx_ref, s.event_path, s.amount0::text,
              seg.tick_lo, seg.tick_hi, seg.liquidity_seg::text,
              seg.amount_in_seg::text, seg.fee_seg::text, seg.seg_index
       FROM swaps s
       LEFT JOIN swap_segments seg
         ON seg.pool_id = s.pool_id
        AND seg.ts = s.ts
        AND seg.tx_ref = s.tx_ref
        AND seg.event_path = s.event_path
       WHERE s.pool_id = $1 AND s.ts >= $2 AND s.ts < $3
       ORDER BY s.ts ASC, s.tx_ref, s.event_path, seg.seg_index ASC NULLS LAST`,
      [poolId, start, end],
    )

    const byKey = new Map<string, SimSwap>()
    for (const r of rows) {
      const key = `${r.ts.toISOString()}|${r.tx_ref}|${r.event_path}`
      let sw = byKey.get(key)
      if (!sw) {
        sw = {
          ts: r.ts,
          feeIsToken0: Number(r.amount0) > 0,
          segments: [],
        }
        byKey.set(key, sw)
      }
      if (
        r.tick_lo != null &&
        r.tick_hi != null &&
        r.liquidity_seg != null &&
        r.amount_in_seg != null &&
        r.fee_seg != null
      ) {
        sw.segments.push({
          tickLo: r.tick_lo,
          tickHi: r.tick_hi,
          liquiditySeg: BigInt(r.liquidity_seg),
          amountInSeg: BigInt(r.amount_in_seg),
          feeSeg: BigInt(r.fee_seg),
        })
      }
    }
    return [...byKey.values()]
  })
}

async function loadStrategyParams(
  db: Db,
  strategyId: number,
): Promise<{
  rangeWidthPct: number
  rebalanceTrigger: number
  minEdgeRatio: number
}> {
  return db.withClient(async (client) => {
    const { rows } = await client.query<{
      range_width_pct: string
      rebalance_trigger: string
      min_edge_ratio: string
    }>(
      `SELECT range_width_pct::text, rebalance_trigger::text,
              min_edge_ratio::text
       FROM strategies WHERE id = $1`,
      [strategyId],
    )
    const r = rows[0]
    if (!r) throw new Error(`strategy ${strategyId} not found`)
    return {
      rangeWidthPct: Number(r.range_width_pct),
      rebalanceTrigger: Number(r.rebalance_trigger),
      minEdgeRatio: Number(r.min_edge_ratio),
    }
  })
}

/** ≤3 free params: rangeRatio variants around the strategy default. */
export function candidateRangeRatios(
  base: number,
  nTrials: number,
): number[] {
  const n = Math.min(3, Math.max(1, Math.floor(nTrials)))
  if (n === 1) return [base]
  if (n === 2) return [base * 0.95, base]
  return [base * 0.95, base, base * 1.05]
}

function meanExcess(sim: SimulateStrategyResult): number {
  if (sim.excessVsHodl5050.length === 0) return sim.pnlVsHodl5050Usd
  return (
    sim.excessVsHodl5050.reduce((a, b) => a + b, 0) /
    sim.excessVsHodl5050.length
  )
}

async function simulateWindow(
  db: Db,
  opts: {
    poolId: number
    start: Date
    end: Date
    rangeRatio: number
    entryNotionalUsd: number
    sigmaAnnual: number
    jitFactor: number
    rebalanceTriggerPct: number
    decimals0: number
    decimals1: number
    tickSpacing: number
  },
): Promise<SimulateStrategyResult | null> {
  const pricePath = await loadPricePath(
    db,
    opts.poolId,
    opts.start,
    opts.end,
    opts.decimals0,
    opts.decimals1,
  )
  if (pricePath.length < 2) return null
  const swaps = await loadSwapsWithSegments(
    db,
    opts.poolId,
    opts.start,
    opts.end,
  )
  return simulateConcentratedStrategy({
    entryNotionalUsd: opts.entryNotionalUsd,
    rangeRatio: opts.rangeRatio,
    tickSpacing: opts.tickSpacing,
    pricePath,
    swaps,
    sigmaAnnual: opts.sigmaAnnual,
    jitFactor: opts.jitFactor,
    rebalanceTriggerPct: opts.rebalanceTriggerPct,
    decimals0: opts.decimals0,
    decimals1: opts.decimals1,
  })
}

export async function runWalkForwardBacktest(
  db: Db,
  opts: RunBacktestOpts,
): Promise<RunBacktestResult> {
  const strat = await loadStrategyParams(db, opts.strategyId)
  const poolId = opts.poolId
  const baseRatio = opts.rangeRatio ?? 1 + strat.rangeWidthPct / 100
  const candidates = candidateRangeRatios(baseRatio, opts.nTrials)
  const decimals0 = opts.decimals0 ?? 9
  const decimals1 = opts.decimals1 ?? 6
  const jitFactor = opts.jitFactor ?? 1
  const entryNotionalUsd = opts.entryNotionalUsd ?? 10_000
  const sigmaAnnual = opts.sigmaAnnual ?? 0.75
  const rebalanceTriggerPct =
    opts.rebalanceTriggerPct ?? strat.rebalanceTrigger / 100
  const tickSpacing = opts.tickSpacing ?? 4

  const folds = walkForwardFolds({
    windowStart: opts.windowStart,
    windowEnd: opts.windowEnd,
    trainDays: opts.trainDays,
    testDays: opts.testDays,
  })

  if (folds.length === 0) {
    return {
      foldRunIds: [],
      latestGate: null,
      detail:
        'no WalkForward folds — widen window or reduce train/test days; refusing OOS without train',
    }
  }

  const foldRunIds: number[] = []
  let latestGate: BacktestGateResult | null = null

  for (const fold of folds) {
    const trialMeans: number[] = []
    let bestRatio = candidates[0]!
    let bestTrain = Number.NEGATIVE_INFINITY

    for (const ratio of candidates) {
      const trainSim = await simulateWindow(db, {
        poolId,
        start: fold.trainStart,
        end: fold.trainEnd,
        rangeRatio: ratio,
        entryNotionalUsd,
        sigmaAnnual,
        jitFactor,
        rebalanceTriggerPct,
        decimals0,
        decimals1,
        tickSpacing,
      })
      if (!trainSim) continue
      const score = meanExcess(trainSim)
      trialMeans.push(score)
      if (score > bestTrain) {
        bestTrain = score
        bestRatio = ratio
      }
    }

    const nTrialsEffective = Math.max(1, trialMeans.length)
    const oosSim = await simulateWindow(db, {
      poolId,
      start: fold.testStart,
      end: fold.testEnd,
      rangeRatio: bestRatio,
      entryNotionalUsd,
      sigmaAnnual,
      jitFactor,
      rebalanceTriggerPct,
      decimals0,
      decimals1,
      tickSpacing,
    })
    if (!oosSim) continue

    const insert = buildBacktestRunInsert({
      strategyId: opts.strategyId,
      poolId,
      windowStart: fold.testStart,
      windowEnd: fold.testEnd,
      isOutOfSample: true,
      nTrials: nTrialsEffective,
      jitFactor,
      sim: oosSim,
      trialMeans: trialMeans.length > 0 ? trialMeans : undefined,
      paramsSnapshot: {
        rangeRatio: bestRatio,
        candidates,
        rangeWidthPct: strat.rangeWidthPct,
        rebalanceTrigger: strat.rebalanceTrigger,
        minEdgeRatio: strat.minEdgeRatio,
        liquidity: oosSim.liquidity,
        foldIndex: fold.foldIndex,
      },
    })
    const id = await insertBacktestRun(db, insert)
    foldRunIds.push(id)
    latestGate = evaluateBacktestGate({
      pnlVsHodl5050Usd: oosSim.pnlVsHodl5050Usd,
      pnlVsHodlVolatileUsd: oosSim.pnlVsHodlVolatileUsd,
      pnlVsFullRangeUsd: oosSim.pnlVsFullRangeUsd,
      realityCheckPvalue: insert.realityCheckPvalue ?? 1,
    })
  }

  return {
    foldRunIds,
    latestGate,
    detail:
      foldRunIds.length === 0
        ? 'folds present but no window had ≥2 pool_states'
        : undefined,
  }
}
