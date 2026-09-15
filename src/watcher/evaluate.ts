/**
 * Evaluate range_exit / range_proximity / data_gap rules once.
 */

import type { Db } from '../db/client.js'
import { buildDedupKey } from './dedup.js'
import { evaluateBooleanHysteresis } from './hysteresis.js'
import {
  beatHeartbeat,
  emitAlert,
  loadLatch,
  saveLatch,
  type AlertSeverity,
} from './persist-alert.js'
import {
  formatAlertMessage,
  loadTelegramConfig,
  sendTelegramAlert,
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

async function loadEnabledRules(db: Db): Promise<RuleRow[]> {
  return db.withClient(async (client) => {
    const { rows } = await client.query<RuleRow>(
      `SELECT r.id::text, r.kind, r.position_id::text, r.strategy_id::text,
              r.threshold::text, r.cooldown_sec, r.channels,
              s.hysteresis_min_sec,
              p.tick_lower, p.tick_upper, p.pool_id::text
       FROM alert_rules r
       LEFT JOIN positions p ON p.id = r.position_id
       LEFT JOIN strategies s ON s.id = COALESCE(r.strategy_id, p.strategy_id)
       WHERE r.enabled = TRUE`,
    )
    return rows
  })
}

async function latestInRange(
  db: Db,
  positionId: number,
): Promise<{ inRange: boolean; price: number; ts: Date } | null> {
  return db.withClient(async (client) => {
    const { rows } = await client.query<{
      in_range: boolean
      price: string
      ts: Date
    }>(
      `SELECT in_range, price::text, ts FROM position_snapshots
       WHERE position_id = $1
       ORDER BY ts DESC LIMIT 1`,
      [positionId],
    )
    const row = rows[0]
    if (!row) return null
    return {
      inRange: row.in_range,
      price: Number(row.price),
      ts: row.ts,
    }
  })
}

async function latestPoolTick(
  db: Db,
  poolId: number,
): Promise<{ tick: number; ts: Date } | null> {
  return db.withClient(async (client) => {
    const { rows } = await client.query<{ tick: number; ts: Date }>(
      `SELECT tick, ts FROM pool_states
       WHERE pool_id = $1
       ORDER BY ts DESC, block_or_slot DESC LIMIT 1`,
      [poolId],
    )
    return rows[0] ?? null
  })
}

async function dispatchChannels(
  channels: string[],
  kind: string,
  severity: AlertSeverity,
  dedupKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const text = formatAlertMessage({ kind, severity, dedupKey, payload })
  for (const ch of channels) {
    if (ch === 'telegram') {
      await sendTelegramAlert(loadTelegramConfig(), text)
    } else {
      console.log(`[channel:${ch}]`, text)
    }
  }
}

export async function runWatchCycle(
  db: Db,
  opts?: { now?: Date; dataGapSec?: number },
): Promise<WatchCycleResult> {
  const now = opts?.now ?? new Date()
  const dataGapSec = opts?.dataGapSec ?? 600
  const rules = await loadEnabledRules(db)
  let emitted = 0
  let skipped = 0

  for (const rule of rules) {
    const ruleId = Number(rule.id)
    const minSec = rule.hysteresis_min_sec ?? 60
    const cooldownSec = rule.cooldown_sec

    if (rule.kind === 'range_exit' && rule.position_id) {
      const positionId = Number(rule.position_id)
      const snap = await latestInRange(db, positionId)
      const outOfRange = snap ? !snap.inRange : false

      const decision = await db.withClient(async (client) => {
        const latch = await loadLatch(client, ruleId)
        const d = evaluateBooleanHysteresis({
          conditionTrue: outOfRange,
          now,
          latch,
          minSec,
        })
        await saveLatch(client, ruleId, d.nextLatch)
        return d
      })

      if (!decision.shouldFire) {
        skipped += 1
        continue
      }

      const dedupKey = buildDedupKey({
        kind: 'range_exit',
        positionId,
      })
      const payload = {
        positionId,
        inRange: snap?.inRange ?? null,
        price: snap?.price ?? null,
        snapshotTs: snap?.ts?.toISOString() ?? null,
      }
      const result = await emitAlert(db, {
        ruleId,
        severity: 'action',
        dedupKey,
        payload,
        cooldownSec,
        ts: now,
      })
      if (result.emitted) {
        emitted += 1
        await dispatchChannels(
          rule.channels,
          rule.kind,
          'action',
          dedupKey,
          payload,
        )
      } else {
        skipped += 1
      }
      continue
    }

    if (rule.kind === 'range_proximity' && rule.position_id && rule.tick_lower != null) {
      const positionId = Number(rule.position_id)
      const poolId = rule.pool_id ? Number(rule.pool_id) : null
      if (poolId == null) {
        skipped += 1
        continue
      }
      const state = await latestPoolTick(db, poolId)
      const thresholdTicks = Number(rule.threshold ?? 10)
      const near =
        state != null &&
        (Math.abs(state.tick - rule.tick_lower!) <= thresholdTicks ||
          Math.abs(state.tick - rule.tick_upper!) <= thresholdTicks)

      const decision = await db.withClient(async (client) => {
        const latch = await loadLatch(client, ruleId)
        const d = evaluateBooleanHysteresis({
          conditionTrue: near,
          now,
          latch,
          minSec,
        })
        await saveLatch(client, ruleId, d.nextLatch)
        return d
      })

      if (!decision.shouldFire) {
        skipped += 1
        continue
      }

      const dedupKey = buildDedupKey({
        kind: 'range_proximity',
        positionId,
      })
      const payload = {
        positionId,
        tick: state?.tick ?? null,
        tickLower: rule.tick_lower,
        tickUpper: rule.tick_upper,
        thresholdTicks,
      }
      const result = await emitAlert(db, {
        ruleId,
        severity: 'warn',
        dedupKey,
        payload,
        cooldownSec,
        ts: now,
      })
      if (result.emitted) {
        emitted += 1
        await dispatchChannels(
          rule.channels,
          rule.kind,
          'warn',
          dedupKey,
          payload,
        )
      } else {
        skipped += 1
      }
      continue
    }

    if (rule.kind === 'data_gap' && rule.strategy_id) {
      const { rows } = await db.withClient((c) =>
        c.query<{ pool_id: string | null }>(
          `SELECT pool_id::text FROM strategies WHERE id = $1`,
          [Number(rule.strategy_id)],
        ),
      )
      const poolId = rows[0]?.pool_id ? Number(rows[0].pool_id) : null
      if (poolId == null) {
        skipped += 1
        continue
      }
      const state = await latestPoolTick(db, poolId)
      const stale =
        state == null ||
        (now.getTime() - state.ts.getTime()) / 1000 > dataGapSec

      const decision = await db.withClient(async (client) => {
        const latch = await loadLatch(client, ruleId)
        const d = evaluateBooleanHysteresis({
          conditionTrue: stale,
          now,
          latch,
          minSec: Math.min(minSec, 30),
        })
        await saveLatch(client, ruleId, d.nextLatch)
        return d
      })

      if (!decision.shouldFire) {
        skipped += 1
        continue
      }

      const dedupKey = buildDedupKey({
        kind: 'data_gap',
        strategyId: Number(rule.strategy_id),
        extra: `pool:${poolId}`,
      })
      const payload = {
        poolId,
        lastPoolStateTs: state?.ts?.toISOString() ?? null,
        dataGapSec,
      }
      const result = await emitAlert(db, {
        ruleId,
        severity: 'critical',
        dedupKey,
        payload,
        cooldownSec,
        ts: now,
      })
      if (result.emitted) {
        emitted += 1
        await dispatchChannels(
          rule.channels,
          rule.kind,
          'critical',
          dedupKey,
          payload,
        )
      } else {
        skipped += 1
      }
    }
  }

  await beatHeartbeat(db, 'watcher', {
    rulesChecked: rules.length,
    emitted,
    skipped,
    at: now.toISOString(),
  })

  return {
    rulesChecked: rules.length,
    emitted,
    skipped,
    heartbeatOk: true,
  }
}
