/**
 * Persist / query BacktestRun rows (spec §18).
 */

import type { Db } from './client.js'

export type FeeSource = 'reconstructed_segments' | 'modeled'

export type BacktestRunInsert = {
  strategyId: number
  poolId: number
  windowStart: Date
  windowEnd: Date
  isOutOfSample: boolean
  feeSource: FeeSource
  jitFactorApplied: number | null
  nTrials: number
  realityCheckPvalue: number | null
  regimesCovered: number
  pnlUsd: number | null
  pnlVsHodlUsd: number | null
  pnlVsFullrangeUsd: number | null
  maxDrawdown: number | null
  cvar95: number | null
  timeInRange: number | null
  rebalanceCount: number | null
  totalCostsUsd: number | null
  paramsSnapshot: Record<string, unknown>
}

export type BacktestRunRow = BacktestRunInsert & { id: number }

export async function insertBacktestRun(
  db: Db,
  row: BacktestRunInsert,
): Promise<number> {
  if (row.isOutOfSample && row.feeSource === 'modeled') {
    throw new Error('OOS BacktestRun cannot use modeled FeeSource')
  }
  return db.withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO backtest_runs (
         strategy_id, pool_id, window_start, window_end,
         is_out_of_sample, fee_source, jit_factor_applied,
         n_trials, reality_check_pvalue, regimes_covered,
         pnl_usd, pnl_vs_hodl_usd, pnl_vs_fullrange_usd,
         max_drawdown, cvar_95, time_in_range,
         rebalance_count, total_costs_usd, params_snapshot
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         $11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb
       ) RETURNING id::text`,
      [
        row.strategyId,
        row.poolId,
        row.windowStart,
        row.windowEnd,
        row.isOutOfSample,
        row.feeSource,
        row.jitFactorApplied,
        row.nTrials,
        row.realityCheckPvalue,
        row.regimesCovered,
        row.pnlUsd,
        row.pnlVsHodlUsd,
        row.pnlVsFullrangeUsd,
        row.maxDrawdown,
        row.cvar95,
        row.timeInRange,
        row.rebalanceCount,
        row.totalCostsUsd,
        JSON.stringify(row.paramsSnapshot),
      ],
    )
    return Number(rows[0]!.id)
  })
}

export type OosGateReport = {
  runId: number
  ok: boolean
  beatsHodl5050: boolean
  beatsHodlVolatile: boolean
  beatsFullRange: boolean
  realityCheckOk: boolean
  feeSourceOk: boolean
  detail: string
}

export async function loadLatestOosRun(
  db: Db,
  strategyId: number,
): Promise<{
  id: number
  feeSource: FeeSource
  realityCheckPvalue: number | null
  pnlUsd: number | null
  pnlVsHodlUsd: number | null
  pnlVsFullrangeUsd: number | null
  paramsSnapshot: Record<string, unknown>
} | null> {
  return db.withClient(async (client) => {
    const { rows } = await client.query<{
      id: string
      fee_source: FeeSource
      reality_check_pvalue: string | null
      pnl_usd: string | null
      pnl_vs_hodl_usd: string | null
      pnl_vs_fullrange_usd: string | null
      params_snapshot: Record<string, unknown>
    }>(
      `SELECT id::text, fee_source, reality_check_pvalue::text,
              pnl_usd::text, pnl_vs_hodl_usd::text, pnl_vs_fullrange_usd::text,
              params_snapshot
       FROM backtest_runs
       WHERE strategy_id = $1 AND is_out_of_sample = TRUE
       ORDER BY id DESC
       LIMIT 1`,
      [strategyId],
    )
    const r = rows[0]
    if (!r) return null
    return {
      id: Number(r.id),
      feeSource: r.fee_source,
      realityCheckPvalue:
        r.reality_check_pvalue != null
          ? Number(r.reality_check_pvalue)
          : null,
      pnlUsd: r.pnl_usd != null ? Number(r.pnl_usd) : null,
      pnlVsHodlUsd:
        r.pnl_vs_hodl_usd != null ? Number(r.pnl_vs_hodl_usd) : null,
      pnlVsFullrangeUsd:
        r.pnl_vs_fullrange_usd != null
          ? Number(r.pnl_vs_fullrange_usd)
          : null,
      paramsSnapshot: r.params_snapshot,
    }
  })
}
