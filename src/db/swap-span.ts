/**
 * Calendar span of indexed swaps for Epic 1 soak gate.
 */

import type { Db } from './client.js'

export type SwapSpanReport = {
  poolId: number
  swapCount: number
  minTs: string | null
  maxTs: string | null
  spanDays: number
  spanOk: boolean
  feeSegOk: boolean
  feeSegDetail: string
  ok: boolean
}

export async function checkSwapSpan(
  db: Db,
  poolId: number,
  minSpanDays = 30,
): Promise<SwapSpanReport> {
  return db.withClient(async (client) => {
    const { rows: spanRows } = await client.query<{
      swap_count: string
      min_ts: Date | null
      max_ts: Date | null
    }>(
      `SELECT COUNT(*)::text AS swap_count,
              MIN(ts) AS min_ts,
              MAX(ts) AS max_ts
       FROM swaps WHERE pool_id = $1`,
      [poolId],
    )
    const swapCount = Number(spanRows[0]?.swap_count ?? 0)
    const minTs = spanRows[0]?.min_ts ?? null
    const maxTs = spanRows[0]?.max_ts ?? null
    const spanDays =
      minTs && maxTs
        ? (maxTs.getTime() - minTs.getTime()) / (1000 * 60 * 60 * 24)
        : 0

    const { rows: feeRows } = await client.query<{
      bad_count: string
    }>(
      `WITH summed AS (
         SELECT s.fee_amount,
                COALESCE(SUM(seg.fee_seg), 0) AS fee_seg_sum
         FROM swaps s
         LEFT JOIN swap_segments seg
           ON seg.pool_id = s.pool_id
          AND seg.ts = s.ts
          AND seg.tx_ref = s.tx_ref
          AND seg.event_path = s.event_path
         WHERE s.pool_id = $1 AND s.fee_amount IS NOT NULL
         GROUP BY s.pool_id, s.ts, s.tx_ref, s.event_path, s.fee_amount
       )
       SELECT COUNT(*) FILTER (WHERE fee_seg_sum <> fee_amount)::text AS bad_count
       FROM summed`,
      [poolId],
    )
    const badCount = Number(feeRows[0]?.bad_count ?? 0)
    const feeSegOk = swapCount > 0 && badCount === 0
    const spanOk = spanDays >= minSpanDays
    return {
      poolId,
      swapCount,
      minTs: minTs?.toISOString() ?? null,
      maxTs: maxTs?.toISOString() ?? null,
      spanDays: Number(spanDays.toFixed(4)),
      spanOk,
      feeSegOk,
      feeSegDetail:
        swapCount === 0
          ? 'no swaps'
          : `swaps=${swapCount} mismatched=${badCount}`,
      ok: spanOk && feeSegOk,
    }
  })
}
