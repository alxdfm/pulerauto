/**
 * Compute and upsert pool_metrics_daily for one UTC day (Epic 4 / §17).
 */

import type { Db } from '../db/client.js'
import { edgeRatio } from '../math/edge-ratio.js'
import { markoutBps, markoutLp } from '../math/markout.js'
import {
  efficiencyRatio,
  erQuantile80,
} from '../math/regime.js'
import {
  sigmaImplied,
  volumeAnnualFromDaily,
} from '../math/sigma-implied.js'
import {
  logReturnsFromPrices,
  sigmaAnnualFromLogReturns,
} from '../math/sigma-realized.js'
import { priceFromSqrtPriceX } from '../math/tick-price.js'

export type PoolMetricsDailyRow = {
  poolId: number
  day: string
  volumeUsd: number
  feesLpUsd: number
  tvlUsd: number
  depthV2EquivUsd: number
  sigma30d: number
  sigmaImplied: number
  edgeRatio: number
  efficiencyRatio: number | null
  erQ80_90d: number | null
  markout5mBps: number | null
  markout30mBps: number | null
}

function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dayBoundsUtc(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00.000Z`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

export async function computePoolMetricsDaily(
  db: Db,
  poolId: number,
  day: string,
  opts?: { decimals0?: number; decimals1?: number },
): Promise<PoolMetricsDailyRow | null> {
  const decimals0 = opts?.decimals0 ?? 9
  const decimals1 = opts?.decimals1 ?? 6
  const { start, end } = dayBoundsUtc(day)

  return db.withClient(async (client) => {
    const { rows: poolRows } = await client.query<{
      fee_tier_bps: number
      protocol_fee_share: string
    }>(
      `SELECT p.fee_tier_bps, d.protocol_fee_share::text
       FROM pools p JOIN dexes d ON d.id = p.dex_id
       WHERE p.id = $1`,
      [poolId],
    )
    const pool = poolRows[0]
    if (!pool) return null

    const feeTier = pool.fee_tier_bps / 10_000
    const protocolShare = Number(pool.protocol_fee_share)
    const feeRateLp = feeTier * (1 - protocolShare)
    if (!(feeRateLp > 0)) return null

    // Quote volume (token1) + fees split by input token (amount0>0 ⇒ fee in token0).
    const { rows: aggRows } = await client.query<{
      vol_quote: string
      fee0: string
      fee1: string
    }>(
      `SELECT
         COALESCE(SUM(ABS(amount1)), 0)::text AS vol_quote,
         COALESCE(SUM(CASE WHEN amount0 > 0 THEN fee_amount ELSE 0 END), 0)::text AS fee0,
         COALESCE(SUM(CASE WHEN amount0 <= 0 THEN fee_amount ELSE 0 END), 0)::text AS fee1
       FROM swaps
       WHERE pool_id = $1 AND ts >= $2 AND ts < $3 AND fee_amount IS NOT NULL`,
      [poolId, start, end],
    )
    const volumeUsd = Number(aggRows[0]?.vol_quote ?? 0) / 10 ** decimals1
    if (!(volumeUsd > 0)) return null

    const { rows: stateRows } = await client.query<{
      sqrt_price: string
      liquidity: string
      depth_v2_equiv_usd: string | null
    }>(
      `SELECT sqrt_price::text, liquidity::text, depth_v2_equiv_usd::text
       FROM pool_states
       WHERE pool_id = $1 AND ts >= $2 AND ts < $3
       ORDER BY ts DESC, block_or_slot DESC LIMIT 1`,
      [poolId, start, end],
    )
    const state = stateRows[0]
    if (!state) return null

    const sqrtPrice = BigInt(state.sqrt_price)
    const L = BigInt(state.liquidity)
    const price = priceFromSqrtPriceX(sqrtPrice, 64, decimals0, decimals1)

    let depthV2EquivUsd = 0
    if (state.depth_v2_equiv_usd) {
      depthV2EquivUsd = Number(state.depth_v2_equiv_usd)
    } else {
      const q64 = 1n << 64n
      const token1Raw = (2n * L * sqrtPrice) / q64
      depthV2EquivUsd = Number(token1Raw) / 10 ** decimals1
    }
    if (!(depthV2EquivUsd > 0)) return null

    const fee0 = Number(aggRows[0]?.fee0 ?? 0)
    const fee1 = Number(aggRows[0]?.fee1 ?? 0)
    const feesLpUsd =
      ((fee0 / 10 ** decimals0) * price + fee1 / 10 ** decimals1) *
      (1 - protocolShare)

    const lookbackStart = new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000)
    const { rows: dailyPrices } = await client.query<{
      day: Date
      sqrt_price: string
    }>(
      `SELECT date_trunc('day', ts AT TIME ZONE 'UTC') AS day,
              (ARRAY_AGG(sqrt_price::text ORDER BY ts DESC, block_or_slot DESC))[1] AS sqrt_price
       FROM pool_states
       WHERE pool_id = $1 AND ts >= $2 AND ts < $3
       GROUP BY 1
       ORDER BY 1 ASC`,
      [poolId, lookbackStart, end],
    )
    const prices = dailyPrices.map((r) =>
      priceFromSqrtPriceX(BigInt(r.sqrt_price), 64, decimals0, decimals1),
    )

    let sigma30d = 0.75
    if (prices.length >= 3) {
      const recent = prices.slice(-31)
      const rets = logReturnsFromPrices(recent)
      if (rets.length >= 2) {
        sigma30d = sigmaAnnualFromLogReturns(rets, 365)
      }
    }
    if (!(sigma30d > 0)) return null

    const sigImpl = sigmaImplied({
      feeRateLp,
      volumeAnnualUsd: volumeAnnualFromDaily(volumeUsd),
      depthV2Usd: depthV2EquivUsd,
    })
    const er = edgeRatio(sigImpl, sigma30d)

    let efficiency: number | null = null
    let erQ80: number | null = null
    if (prices.length >= 5) {
      const ers: number[] = []
      const window = 10
      for (let i = window; i <= prices.length; i++) {
        ers.push(efficiencyRatio(prices.slice(i - window, i)))
      }
      if (ers.length > 0) {
        efficiency = ers[ers.length - 1]!
        erQ80 = erQuantile80(ers)
      }
    }

    // One pass: both markout horizons via LATERAL; amount0 already human-scaled in SQL.
    const { rows: markoutRows } = await client.query<{
      amount0_human: string
      sqrt_before: string
      sqrt_5m: string | null
      sqrt_30m: string | null
    }>(
      `SELECT
         (s.amount0::numeric / power(10, $5::int))::text AS amount0_human,
         s.sqrt_price_before::text AS sqrt_before,
         h5.sqrt_price::text AS sqrt_5m,
         h30.sqrt_price::text AS sqrt_30m
       FROM swaps s
       LEFT JOIN LATERAL (
         SELECT ps.sqrt_price
         FROM pool_states ps
         WHERE ps.pool_id = s.pool_id
           AND ps.ts >= s.ts + interval '5 minutes'
         ORDER BY ps.ts ASC
         LIMIT 1
       ) h5 ON TRUE
       LEFT JOIN LATERAL (
         SELECT ps.sqrt_price
         FROM pool_states ps
         WHERE ps.pool_id = s.pool_id
           AND ps.ts >= s.ts + interval '30 minutes'
         ORDER BY ps.ts ASC
         LIMIT 1
       ) h30 ON TRUE
       WHERE s.pool_id = $1 AND s.ts >= $2 AND s.ts < $3
       LIMIT $4`,
      [poolId, start, end, 500, decimals0],
    )

    const samples5 = []
    const samples30 = []
    for (const s of markoutRows) {
      const amount0 = Number(s.amount0_human)
      const priceExec = priceFromSqrtPriceX(
        BigInt(s.sqrt_before),
        64,
        decimals0,
        decimals1,
      )
      if (s.sqrt_5m) {
        samples5.push({
          amount0,
          priceExec,
          priceAfter: priceFromSqrtPriceX(
            BigInt(s.sqrt_5m),
            64,
            decimals0,
            decimals1,
          ),
        })
      }
      if (s.sqrt_30m) {
        samples30.push({
          amount0,
          priceExec,
          priceAfter: priceFromSqrtPriceX(
            BigInt(s.sqrt_30m),
            64,
            decimals0,
            decimals1,
          ),
        })
      }
    }

    const markout5mBps =
      samples5.length > 0 ? markoutBps(markoutLp(samples5), volumeUsd) : null
    const markout30mBps =
      samples30.length > 0 ? markoutBps(markoutLp(samples30), volumeUsd) : null

    return {
      poolId,
      day,
      volumeUsd,
      feesLpUsd,
      tvlUsd: depthV2EquivUsd,
      depthV2EquivUsd,
      sigma30d,
      sigmaImplied: sigImpl,
      edgeRatio: er,
      efficiencyRatio: efficiency,
      erQ80_90d: erQ80,
      markout5mBps,
      markout30mBps,
    }
  })
}

export async function upsertPoolMetricsDaily(
  db: Db,
  row: PoolMetricsDailyRow,
): Promise<void> {
  await db.withClient(async (client) => {
    await client.query(
      `INSERT INTO pool_metrics_daily (
         pool_id, day, volume_usd, fees_lp_usd, tvl_usd, depth_v2_equiv_usd,
         sigma_30d, sigma_implied, edge_ratio,
         efficiency_ratio, er_q80_90d, markout_5m_bps, markout_30m_bps
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
       )
       ON CONFLICT (pool_id, day) DO UPDATE SET
         volume_usd = EXCLUDED.volume_usd,
         fees_lp_usd = EXCLUDED.fees_lp_usd,
         tvl_usd = EXCLUDED.tvl_usd,
         depth_v2_equiv_usd = EXCLUDED.depth_v2_equiv_usd,
         sigma_30d = EXCLUDED.sigma_30d,
         sigma_implied = EXCLUDED.sigma_implied,
         edge_ratio = EXCLUDED.edge_ratio,
         efficiency_ratio = EXCLUDED.efficiency_ratio,
         er_q80_90d = EXCLUDED.er_q80_90d,
         markout_5m_bps = EXCLUDED.markout_5m_bps,
         markout_30m_bps = EXCLUDED.markout_30m_bps`,
      [
        row.poolId,
        row.day,
        row.volumeUsd.toFixed(2),
        row.feesLpUsd.toFixed(2),
        row.tvlUsd.toFixed(2),
        row.depthV2EquivUsd.toFixed(2),
        row.sigma30d.toFixed(6),
        row.sigmaImplied.toFixed(6),
        row.edgeRatio.toFixed(6),
        row.efficiencyRatio,
        row.erQ80_90d,
        row.markout5mBps,
        row.markout30mBps,
      ],
    )
  })
}

export async function analyzePoolMetricsForDay(
  db: Db,
  poolId: number,
  day = utcDayString(new Date()),
): Promise<PoolMetricsDailyRow | null> {
  const row = await computePoolMetricsDaily(db, poolId, day)
  if (!row) return null
  await upsertPoolMetricsDaily(db, row)
  return row
}
