import type pg from 'pg'
import {
  reconstructActiveLiquidity,
  type TickNet,
} from '../math/liquidity.js'
import type { Db } from './client.js'

export type InvariantCheck = {
  name: string
  ok: boolean
  detail: string
}

export type InvariantReport = {
  poolId: number
  ok: boolean
  checks: InvariantCheck[]
}

type PoolStateRow = { tick: number; liquidity: string }

async function loadLatestPoolState(
  client: pg.PoolClient,
  poolId: number,
): Promise<PoolStateRow | null> {
  const { rows } = await client.query<PoolStateRow>(
    `SELECT tick, liquidity::text
     FROM pool_states
     WHERE pool_id = $1
     ORDER BY ts DESC, block_or_slot DESC
     LIMIT 1`,
    [poolId],
  )
  return rows[0] ?? null
}

async function loadTicksFromCheckpoint(
  client: pg.PoolClient,
  poolId: number,
  cpTs: Date,
): Promise<TickNet[]> {
  const { rows: checkpointTicks } = await client.query<{
    tick_index: number
    liquidity_net: string
    liquidity_gross: string
  }>(
    `SELECT tick_index, liquidity_net::text, liquidity_gross::text
     FROM tick_liquidity_checkpoints
     WHERE pool_id = $1 AND ts = $2`,
    [poolId, cpTs],
  )

  const netMap = new Map<number, { net: bigint; gross: bigint }>()
  for (const row of checkpointTicks) {
    netMap.set(row.tick_index, {
      net: BigInt(row.liquidity_net),
      gross: BigInt(row.liquidity_gross),
    })
  }

  const { rows: events } = await client.query<{
    tick_index: number
    d_liquidity_net: string
    d_liquidity_gross: string
  }>(
    `SELECT tick_index, d_liquidity_net::text, d_liquidity_gross::text
     FROM tick_liquidity_events
     WHERE pool_id = $1 AND ts > $2
     ORDER BY ts ASC, tick_index ASC`,
    [poolId, cpTs],
  )

  for (const ev of events) {
    const prev = netMap.get(ev.tick_index) ?? { net: 0n, gross: 0n }
    netMap.set(ev.tick_index, {
      net: prev.net + BigInt(ev.d_liquidity_net),
      gross: prev.gross + BigInt(ev.d_liquidity_gross),
    })
  }

  return [...netMap.entries()].map(([tickIndex, v]) => ({
    tickIndex,
    liquidityNet: v.net,
    liquidityGross: v.gross,
  }))
}

async function loadTicksFromEventsOnly(
  client: pg.PoolClient,
  poolId: number,
): Promise<TickNet[]> {
  const { rows } = await client.query<{
    tick_index: number
    d_liquidity_net: string
    d_liquidity_gross: string
  }>(
    `SELECT tick_index,
            SUM(d_liquidity_net)::text AS d_liquidity_net,
            SUM(d_liquidity_gross)::text AS d_liquidity_gross
     FROM tick_liquidity_events
     WHERE pool_id = $1
     GROUP BY tick_index`,
    [poolId],
  )
  return rows.map((e) => ({
    tickIndex: e.tick_index,
    liquidityNet: BigInt(e.d_liquidity_net),
    liquidityGross: BigInt(e.d_liquidity_gross),
  }))
}

async function loadTicksForPool(
  client: pg.PoolClient,
  poolId: number,
): Promise<TickNet[]> {
  const { rows: cpRows } = await client.query<{ ts: Date }>(
    `SELECT ts FROM tick_liquidity_checkpoints
     WHERE pool_id = $1
     ORDER BY ts DESC LIMIT 1`,
    [poolId],
  )
  if (cpRows[0]) {
    return loadTicksFromCheckpoint(client, poolId, cpRows[0].ts)
  }
  return loadTicksFromEventsOnly(client, poolId)
}

function liquidityChecks(
  ticks: TickNet[],
  currentTick: number,
  expectedL: bigint,
): InvariantCheck[] {
  const recon = reconstructActiveLiquidity(ticks, currentTick)
  return [
    {
      name: 'sum_liquidity_net_zero',
      ok: recon.sumNet === 0n,
      detail: `sumNet=${recon.sumNet}`,
    },
    {
      name: 'l_active_matches_pool_state',
      ok: recon.activeLiquidity === expectedL,
      detail: `reconstructed=${recon.activeLiquidity} pool_states=${expectedL}`,
    },
    {
      name: 'gross_ge_abs_net',
      ok: recon.grossViolations === 0,
      detail: `violations=${recon.grossViolations}`,
    },
  ]
}

async function feeGrowthCheck(
  client: pg.PoolClient,
  poolId: number,
): Promise<InvariantCheck> {
  const { rows } = await client.query<{
    small_drop: boolean
  }>(
    `WITH ordered AS (
       SELECT fee_growth_global0, fee_growth_global1,
              LAG(fee_growth_global0) OVER (ORDER BY block_or_slot, ts) AS prev0,
              LAG(fee_growth_global1) OVER (ORDER BY block_or_slot, ts) AS prev1
       FROM pool_states WHERE pool_id = $1
     )
     SELECT EXISTS (
       SELECT 1 FROM ordered
       WHERE prev0 IS NOT NULL
         AND fee_growth_global0 < prev0
         AND (prev0 - fee_growth_global0) < (power(10::numeric, 70))
     ) OR EXISTS (
       SELECT 1 FROM ordered
       WHERE prev1 IS NOT NULL
         AND fee_growth_global1 < prev1
         AND (prev1 - fee_growth_global1) < (power(10::numeric, 70))
     ) AS small_drop`,
    [poolId],
  )

  const smallDrop = Boolean(rows[0]?.small_drop)
  return {
    name: 'fee_growth_monotonic_or_wrap',
    // Small non-monotonic drop without full-wrap magnitude is a hard fail.
    // Large drops are treated as wrap (ok).
    ok: !smallDrop,
    detail: smallDrop
      ? 'small non-monotonic fee_growth drop (not a full wrap)'
      : 'no small non-monotonic drop detected',
  }
}

async function feeSegReconcileCheck(
  client: pg.PoolClient,
  poolId: number,
  windowDays: number,
): Promise<InvariantCheck> {
  const { rows } = await client.query<{
    swap_count: string
    bad_count: string
  }>(
    `WITH windowed AS (
       SELECT s.pool_id, s.ts, s.tx_ref, s.event_path, s.fee_amount
       FROM swaps s
       WHERE s.pool_id = $1
         AND s.ts >= now() - ($2::text || ' days')::interval
         AND s.fee_amount IS NOT NULL
     ),
     summed AS (
       SELECT w.pool_id, w.ts, w.tx_ref, w.event_path, w.fee_amount,
              COALESCE(SUM(seg.fee_seg), 0) AS fee_seg_sum
       FROM windowed w
       LEFT JOIN swap_segments seg
         ON seg.pool_id = w.pool_id
        AND seg.ts = w.ts
        AND seg.tx_ref = w.tx_ref
        AND seg.event_path = w.event_path
       GROUP BY w.pool_id, w.ts, w.tx_ref, w.event_path, w.fee_amount
     )
     SELECT
       COUNT(*)::text AS swap_count,
       COUNT(*) FILTER (WHERE fee_seg_sum <> fee_amount)::text AS bad_count
     FROM summed`,
    [poolId, String(windowDays)],
  )

  const swapCount = Number(rows[0]?.swap_count ?? 0)
  const badCount = Number(rows[0]?.bad_count ?? 0)
  const ok = swapCount > 0 && badCount === 0
  return {
    name: 'sum_fee_seg_equals_fee_amount',
    ok,
    detail:
      swapCount === 0
        ? `no swaps in last ${windowDays}d`
        : `swaps=${swapCount} mismatched=${badCount} window=${windowDays}d`,
  }
}

export async function checkPoolInvariants(
  db: Db,
  poolId: number,
  opts?: { feeSegWindowDays?: number },
): Promise<InvariantReport> {
  return db.withClient(async (client) => {
    const state = await loadLatestPoolState(client, poolId)
    if (!state) {
      return {
        poolId,
        ok: false,
        checks: [
          {
            name: 'pool_states_present',
            ok: false,
            detail: 'no pool_states rows',
          },
        ],
      }
    }

    const ticks = await loadTicksForPool(client, poolId)
    const checks = [
      ...liquidityChecks(ticks, state.tick, BigInt(state.liquidity)),
      await feeGrowthCheck(client, poolId),
    ]
    if (opts?.feeSegWindowDays !== undefined) {
      checks.push(
        await feeSegReconcileCheck(client, poolId, opts.feeSegWindowDays),
      )
    }
    return { poolId, ok: checks.every((c) => c.ok), checks }
  })
}

/** Spec §15 invariant 5 over a rolling window (Epic 1 gate). */
export async function checkFeeSegInvariant(
  db: Db,
  poolId: number,
  windowDays = 30,
): Promise<InvariantCheck> {
  return db.withClient((client) =>
    feeSegReconcileCheck(client, poolId, windowDays),
  )
}
