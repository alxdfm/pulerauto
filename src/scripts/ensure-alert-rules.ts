/**
 * Ensure pilot Strategy + alert_rules for soak (range / data_gap / edge / markout).
 */
import 'dotenv/config'
import { createDb } from '../db/client.js'
import { runScript } from './run-script.js'

const db = createDb()

await runScript(async () => {
  const report = await db.withClient(async (client) => {
    const { rows: pools } = await client.query<{ id: string }>(
      `SELECT id::text FROM pools ORDER BY id LIMIT 1`,
    )
    if (pools.length === 0) throw new Error('No pools seeded')
    const poolId = Number(pools[0]!.id)

    const { rows: positions } = await client.query<{ id: string }>(
      `SELECT id::text FROM positions WHERE pool_id = $1 ORDER BY id LIMIT 1`,
      [poolId],
    )
    if (positions.length === 0) throw new Error('No positions for pool')
    const positionId = Number(positions[0]!.id)

    let strategyId: number
    const { rows: existing } = await client.query<{ id: string }>(
      `SELECT id::text FROM strategies WHERE name = $1 LIMIT 1`,
      ['pilot-orca-sol-usdc'],
    )
    if (existing[0]) {
      strategyId = Number(existing[0].id)
    } else {
      const { rows: created } = await client.query<{ id: string }>(
        `INSERT INTO strategies (
           name, pool_id, mode, range_width_pct, rebalance_trigger,
           hysteresis_band_pct, hysteresis_min_sec,
           max_position_usd, max_daily_loss_usd
         ) VALUES (
           $1, $2, 'advisory', 10, 0.5,
           0.25, 60,
           10000, 500
         ) RETURNING id::text`,
        ['pilot-orca-sol-usdc', poolId],
      )
      strategyId = Number(created[0]!.id)
    }

    await client.query(
      `UPDATE positions SET strategy_id = $1
       WHERE id = $2 AND strategy_id IS NULL`,
      [strategyId, positionId],
    )

    // Keep a single enabled range_exit for the pilot position.
    await client.query(
      `UPDATE alert_rules SET enabled = FALSE
       WHERE kind = 'range_exit' AND position_id = $1`,
      [positionId],
    )

    const kinds: {
      kind: string
      positionId: number | null
      strategyId: number | null
      threshold: number | null
    }[] = [
      {
        kind: 'range_exit',
        positionId,
        strategyId: null,
        threshold: null,
      },
      {
        kind: 'range_proximity',
        positionId,
        strategyId: null,
        threshold: 10,
      },
      {
        kind: 'data_gap',
        positionId: null,
        strategyId,
        threshold: null,
      },
      {
        kind: 'edge_decay',
        positionId: null,
        strategyId,
        threshold: 1.3,
      },
      {
        kind: 'markout_negative',
        positionId: null,
        strategyId,
        threshold: 0,
      },
    ]

    const upserted: string[] = []
    for (const k of kinds) {
      const { rows: found } = await client.query<{ id: string }>(
        `SELECT id::text FROM alert_rules
         WHERE kind = $1
           AND COALESCE(position_id, 0) = COALESCE($2::bigint, 0)
           AND COALESCE(strategy_id, 0) = COALESCE($3::bigint, 0)
         ORDER BY id
         LIMIT 1`,
        [k.kind, k.positionId, k.strategyId],
      )
      if (found[0]) {
        await client.query(
          `UPDATE alert_rules
           SET enabled = TRUE, threshold = $2, cooldown_sec = 900,
               channels = '{telegram}'
           WHERE id = $1`,
          [Number(found[0].id), k.threshold],
        )
        upserted.push(`${k.kind}:${found[0].id}`)
      } else {
        const { rows: ins } = await client.query<{ id: string }>(
          `INSERT INTO alert_rules (
             position_id, strategy_id, kind, threshold, cooldown_sec,
             channels, enabled
           ) VALUES ($1,$2,$3,$4,900,'{telegram}',TRUE)
           RETURNING id::text`,
          [k.positionId, k.strategyId, k.kind, k.threshold],
        )
        upserted.push(`${k.kind}:${ins[0]!.id}`)
      }
    }

    const { rows: enabled } = await client.query(
      `SELECT id::text, kind, enabled, position_id::text, strategy_id::text,
              threshold::text
       FROM alert_rules WHERE enabled = TRUE ORDER BY id`,
    )
    return { strategyId, positionId, poolId, upserted, enabled }
  })

  console.log(JSON.stringify(report, null, 2))
}, () => db.close())
