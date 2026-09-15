/**
 * Evaluate range_exit / range_proximity / data_gap rules once.
 * Latch FIRED only after successful emit.
 * DB checkout never spans Telegram / channel HTTP.
 */

import type pg from 'pg'
import type { Db } from '../db/client.js'
import { buildDedupKey } from './dedup.js'
import {
  evaluateBooleanHysteresis,
  type HysteresisDecision,
} from './hysteresis.js'
import {
  emitAlertOnClient,
  loadLatch,
  saveLatch,
  setAlertDeliveryStatus,
  type AlertSeverity,
  type DeliveryStatus,
} from './persist-alert.js'
import {
  formatAlertMessage,
  loadTelegramConfig,
  sendTelegramAlert,
  type SendAlertResult,
} from './telegram.js'

export type WatchCycleResult = {
  rulesChecked: number
  emitted: number
  skipped: number
  heartbeatOk: boolean
}

type RuleRow = {
  id: string
  kind: string
  position_id: string | null
  strategy_id: string | null
  threshold: string | null
  cooldown_sec: number
  channels: string[]
  hysteresis_min_sec: number | null
  tick_lower: number | null
  tick_upper: number | null
  pool_id: string | null
}

type PendingDelivery = {
  alertId: number
  channels: string[]
  kind: string
  severity: AlertSeverity
  dedupKey: string
  payload: Record<string, unknown>
}

function deliveryFromTelegram(result: SendAlertResult): DeliveryStatus {
  if (result.mode === 'dry_run') return 'dry_run'
  return result.ok ? 'delivered' : 'failed'
}

async function dispatchChannels(
  channels: string[],
  kind: string,
  severity: AlertSeverity,
  dedupKey: string,
  payload: Record<string, unknown>,
): Promise<DeliveryStatus> {
  const text = formatAlertMessage({ kind, severity, dedupKey, payload })
  let status: DeliveryStatus = 'dry_run'
  for (const ch of channels) {
    if (ch === 'telegram') {
      const result = await sendTelegramAlert(loadTelegramConfig(), text)
      status = deliveryFromTelegram(result)
      if (!result.ok) {
        console.error('[telegram:failed]', result.detail)
      }
    } else {
      console.log(`[channel:${ch}]`, text)
    }
  }
  return status
}

async function applyBooleanRule(opts: {
  client: pg.PoolClient
  ruleId: number
  conditionTrue: boolean
  now: Date
  minSec: number
  cooldownSec: number
  severity: AlertSeverity
  kind: string
  channels: string[]
  dedupKey: string
  payload: Record<string, unknown>
  pending: PendingDelivery[]
}): Promise<'emitted' | 'skipped'> {
  const latch = await loadLatch(opts.client, opts.ruleId)
  const decision: HysteresisDecision = evaluateBooleanHysteresis({
    conditionTrue: opts.conditionTrue,
    now: opts.now,
    latch,
    minSec: opts.minSec,
  })
  await saveLatch(opts.client, opts.ruleId, decision.nextLatch)

  if (!decision.shouldFire) return 'skipped'

  const result = await emitAlertOnClient(opts.client, {
    ruleId: opts.ruleId,
    severity: opts.severity,
    dedupKey: opts.dedupKey,
    payload: opts.payload,
    cooldownSec: opts.cooldownSec,
    ts: opts.now,
  })
  if (result.emitted && decision.firedLatch) {
    await saveLatch(opts.client, opts.ruleId, decision.firedLatch)
    opts.pending.push({
      alertId: result.alertId,
      channels: opts.channels,
      kind: opts.kind,
      severity: opts.severity,
      dedupKey: opts.dedupKey,
      payload: opts.payload,
    })
    return 'emitted'
  }
  return 'skipped'
}

export async function runWatchCycle(
  db: Db,
  opts?: { now?: Date; dataGapSec?: number },
): Promise<WatchCycleResult> {
  const now = opts?.now ?? new Date()
  const dataGapSec = opts?.dataGapSec ?? 600
  const pending: PendingDelivery[] = []

  const cycle = await db.withClient(async (client) => {
    const { rows: rules } = await client.query<RuleRow>(
      `SELECT r.id::text, r.kind, r.position_id::text, r.strategy_id::text,
              r.threshold::text, r.cooldown_sec, r.channels,
              s.hysteresis_min_sec,
              p.tick_lower, p.tick_upper, p.pool_id::text
       FROM alert_rules r
       LEFT JOIN positions p ON p.id = r.position_id
       LEFT JOIN strategies s ON s.id = COALESCE(r.strategy_id, p.strategy_id)
       WHERE r.enabled = TRUE`,
    )

    let emitted = 0
    let skipped = 0

    for (const rule of rules) {
      const ruleId = Number(rule.id)
      const minSec = rule.hysteresis_min_sec ?? 60
      const cooldownSec = rule.cooldown_sec

      if (rule.kind === 'range_exit' && rule.position_id) {
        const positionId = Number(rule.position_id)
        const { rows: snapRows } = await client.query<{
          in_range: boolean
          price: string
          ts: Date
        }>(
          `SELECT in_range, price::text, ts FROM position_snapshots
           WHERE position_id = $1 ORDER BY ts DESC LIMIT 1`,
          [positionId],
        )
        const snap = snapRows[0]
        const status = await applyBooleanRule({
          client,
          ruleId,
          conditionTrue: snap ? !snap.in_range : false,
          now,
          minSec,
          cooldownSec,
          severity: 'action',
          kind: rule.kind,
          channels: rule.channels,
          dedupKey: buildDedupKey({ kind: 'range_exit', positionId }),
          payload: {
            positionId,
            inRange: snap?.in_range ?? null,
            price: snap ? Number(snap.price) : null,
            snapshotTs: snap?.ts?.toISOString() ?? null,
          },
          pending,
        })
        if (status === 'emitted') emitted += 1
        else skipped += 1
        continue
      }

      if (
        rule.kind === 'range_proximity' &&
        rule.position_id &&
        rule.tick_lower != null
      ) {
        const positionId = Number(rule.position_id)
        const poolId = rule.pool_id ? Number(rule.pool_id) : null
        if (poolId == null) {
          skipped += 1
          continue
        }
        const { rows: stateRows } = await client.query<{
          tick: number
          ts: Date
        }>(
          `SELECT tick, ts FROM pool_states
           WHERE pool_id = $1
           ORDER BY ts DESC, block_or_slot DESC LIMIT 1`,
          [poolId],
        )
        const state = stateRows[0]
        const thresholdTicks = Number(rule.threshold ?? 10)
        const near =
          state != null &&
          (Math.abs(state.tick - rule.tick_lower!) <= thresholdTicks ||
            Math.abs(state.tick - rule.tick_upper!) <= thresholdTicks)

        const status = await applyBooleanRule({
          client,
          ruleId,
          conditionTrue: near,
          now,
          minSec,
          cooldownSec,
          severity: 'warn',
          kind: rule.kind,
          channels: rule.channels,
          dedupKey: buildDedupKey({ kind: 'range_proximity', positionId }),
          payload: {
            positionId,
            tick: state?.tick ?? null,
            tickLower: rule.tick_lower,
            tickUpper: rule.tick_upper,
            thresholdTicks,
          },
          pending,
        })
        if (status === 'emitted') emitted += 1
        else skipped += 1
        continue
      }

      if (rule.kind === 'data_gap' && rule.strategy_id) {
        const { rows } = await client.query<{ pool_id: string | null }>(
          `SELECT pool_id::text FROM strategies WHERE id = $1`,
          [Number(rule.strategy_id)],
        )
        const poolId = rows[0]?.pool_id ? Number(rows[0].pool_id) : null
        if (poolId == null) {
          skipped += 1
          continue
        }
        const { rows: stateRows } = await client.query<{
          tick: number
          ts: Date
        }>(
          `SELECT tick, ts FROM pool_states
           WHERE pool_id = $1
           ORDER BY ts DESC, block_or_slot DESC LIMIT 1`,
          [poolId],
        )
        const state = stateRows[0]
        const stale =
          state == null ||
          (now.getTime() - state.ts.getTime()) / 1000 > dataGapSec

        const status = await applyBooleanRule({
          client,
          ruleId,
          conditionTrue: stale,
          now,
          minSec: Math.min(minSec, 30),
          cooldownSec,
          severity: 'critical',
          kind: rule.kind,
          channels: rule.channels,
          dedupKey: buildDedupKey({
            kind: 'data_gap',
            strategyId: Number(rule.strategy_id),
            extra: `pool:${poolId}`,
          }),
          payload: {
            poolId,
            lastPoolStateTs: state?.ts?.toISOString() ?? null,
            dataGapSec,
          },
          pending,
        })
        if (status === 'emitted') emitted += 1
        else skipped += 1
      }
    }

    await client.query(
      `INSERT INTO watcher_heartbeats (name, last_beat_at, detail)
       VALUES ($1, now(), $2::jsonb)
       ON CONFLICT (name) DO UPDATE SET
         last_beat_at = now(),
         detail = EXCLUDED.detail`,
      [
        'watcher',
        JSON.stringify({
          rulesChecked: rules.length,
          emitted,
          skipped,
          at: now.toISOString(),
        }),
      ],
    )

    return {
      rulesChecked: rules.length,
      emitted,
      skipped,
      heartbeatOk: true,
    }
  })

  // Channel I/O after releasing the pool client.
  for (const p of pending) {
    const delivery = await dispatchChannels(
      p.channels,
      p.kind,
      p.severity,
      p.dedupKey,
      p.payload,
    )
    await setAlertDeliveryStatus(db, p.alertId, delivery)
  }

  return cycle
}
