/**
 * Resolve edge_decay / markout_negative condition from pool_metrics_daily.
 */

import type pg from 'pg'

export type MetricSignal = {
  conditionTrue: boolean
  signalValue: number | null
  metricsDay: string | null
  threshold: number
}

export async function loadLatestMetricSignal(
  client: pg.PoolClient,
  opts: {
    poolId: number
    kind: 'edge_decay' | 'markout_negative'
    thresholdRaw: string | null
  },
): Promise<MetricSignal> {
  const threshold = Number(opts.thresholdRaw ?? 0)
  const { rows: metricRows } = await client.query<{
    edge_ratio: string
    markout_5m_bps: string | null
    day: Date
  }>(
    `SELECT edge_ratio::text, markout_5m_bps::text, day
     FROM pool_metrics_daily
     WHERE pool_id = $1
     ORDER BY day DESC
     LIMIT 1`,
    [opts.poolId],
  )
  const metric = metricRows[0]
  let conditionTrue = false
  let signalValue: number | null = null
  if (metric) {
    if (opts.kind === 'edge_decay') {
      signalValue = Number(metric.edge_ratio)
      conditionTrue = signalValue < threshold
    } else if (metric.markout_5m_bps != null) {
      signalValue = Number(metric.markout_5m_bps)
      conditionTrue = signalValue < threshold
    }
  }
  return {
    conditionTrue,
    signalValue,
    metricsDay: metric?.day
      ? new Date(metric.day).toISOString().slice(0, 10)
      : null,
    threshold,
  }
}
