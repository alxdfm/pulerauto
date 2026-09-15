/**
 * Weekly ranking by EdgeRatio (spec Epic 4 done criterion).
 */

import type { Db } from '../db/client.js'

export type RankingRow = {
  poolId: number
  address: string
  day: string
  edgeRatio: number
  sigmaImplied: number
  sigma30d: number
  markout5mBps: number | null
  efficiencyRatio: number | null
  erQ80_90d: number | null
}

export async function weeklyRankingByEdgeRatio(
  db: Db,
  opts?: { asOfDay?: string; limit?: number },
): Promise<RankingRow[]> {
  const limit = opts?.limit ?? 50
  return db.withClient(async (client) => {
    const { rows } = await client.query<{
      pool_id: string
      address: string
      day: Date
      edge_ratio: string
      sigma_implied: string
      sigma_30d: string
      markout_5m_bps: string | null
      efficiency_ratio: string | null
      er_q80_90d: string | null
    }>(
      `WITH latest AS (
         SELECT DISTINCT ON (m.pool_id)
           m.pool_id, m.day, m.edge_ratio, m.sigma_implied, m.sigma_30d,
           m.markout_5m_bps, m.efficiency_ratio, m.er_q80_90d
         FROM pool_metrics_daily m
         WHERE ($1::date IS NULL OR m.day <= $1::date)
         ORDER BY m.pool_id, m.day DESC
       )
       SELECT l.pool_id::text, p.address, l.day,
              l.edge_ratio::text, l.sigma_implied::text, l.sigma_30d::text,
              l.markout_5m_bps::text, l.efficiency_ratio::text, l.er_q80_90d::text
       FROM latest l
       JOIN pools p ON p.id = l.pool_id
       ORDER BY l.edge_ratio DESC
       LIMIT $2`,
      [opts?.asOfDay ?? null, limit],
    )
    return rows.map((r) => ({
      poolId: Number(r.pool_id),
      address: r.address,
      day: r.day.toISOString().slice(0, 10),
      edgeRatio: Number(r.edge_ratio),
      sigmaImplied: Number(r.sigma_implied),
      sigma30d: Number(r.sigma_30d),
      markout5mBps: r.markout_5m_bps != null ? Number(r.markout_5m_bps) : null,
      efficiencyRatio:
        r.efficiency_ratio != null ? Number(r.efficiency_ratio) : null,
      erQ80_90d: r.er_q80_90d != null ? Number(r.er_q80_90d) : null,
    }))
  })
}
