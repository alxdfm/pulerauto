import type pg from 'pg'
import type { TickNet } from '../math/liquidity.js'

async function findCheckpointTsAtOrBefore(
  client: pg.PoolClient,
  poolId: number,
  asOf: Date,
): Promise<Date | null> {
  const { rows } = await client.query<{ ts: Date }>(
    `SELECT ts FROM tick_liquidity_checkpoints
     WHERE pool_id = $1 AND ts <= $2
     ORDER BY ts DESC
     LIMIT 1`,
    [poolId, asOf],
  )
  if (rows[0]) return rows[0].ts

  const { rows: fallback } = await client.query<{ ts: Date }>(
    `SELECT ts FROM tick_liquidity_checkpoints
     WHERE pool_id = $1
     ORDER BY ts ASC
     LIMIT 1`,
    [poolId],
  )
  return fallback[0]?.ts ?? null
}

async function loadCheckpointTicks(
  client: pg.PoolClient,
  poolId: number,
  cpTs: Date,
): Promise<Map<number, { net: bigint; gross: bigint }>> {
  const { rows } = await client.query<{
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
  for (const row of rows) {
    netMap.set(row.tick_index, {
      net: BigInt(row.liquidity_net),
      gross: BigInt(row.liquidity_gross),
    })
  }
  return netMap
}

/**
 * Tick nets as of `asOf`: checkpoint at/before that time + events up to asOf.
 * Falls back to earliest checkpoint when none precedes asOf (pre-indexer swaps).
 */
export async function loadTickNetsAsOf(
  client: pg.PoolClient,
  poolId: number,
  asOf: Date,
): Promise<TickNet[]> {
  const cpTs = await findCheckpointTsAtOrBefore(client, poolId, asOf)
  if (!cpTs) {
    throw new Error('No tick checkpoint — run pool indexer first')
  }

  const netMap = await loadCheckpointTicks(client, poolId, cpTs)
  const { rows: events } = await client.query<{
    tick_index: number
    d_liquidity_net: string
    d_liquidity_gross: string
  }>(
    `SELECT tick_index, d_liquidity_net::text, d_liquidity_gross::text
     FROM tick_liquidity_events
     WHERE pool_id = $1 AND ts > $2 AND ts <= $3
     ORDER BY ts ASC, tick_index ASC`,
    [poolId, cpTs, asOf],
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
