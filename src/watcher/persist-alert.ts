/**
 * Persist alerts with dedup (cooldown + unique hourly index).
 */

import type pg from 'pg'
import type { Db } from '../db/client.js'
import { canEmitAlert } from './dedup.js'
import type { LatchState } from './hysteresis.js'

export type AlertSeverity = 'info' | 'warn' | 'action' | 'critical'

export type EmitAlertInput = {
  ruleId: number
  severity: AlertSeverity
  dedupKey: string
  payload: Record<string, unknown>
  cooldownSec: number
  ts?: Date
}

export type EmitAlertResult =
  | { emitted: true; alertId: number }
  | { emitted: false; reason: 'cooldown' | 'dedup_hour' }

export async function loadLatch(
  client: pg.PoolClient,
  ruleId: number,
): Promise<LatchState> {
  const { rows } = await client.query<{
    active: boolean
    since_at: Date | null
  }>(
    `SELECT active, since_at FROM alert_rule_latches WHERE rule_id = $1`,
    [ruleId],
  )
  const row = rows[0]
  if (!row) return { active: false, sinceAt: null }
  return { active: row.active, sinceAt: row.since_at }
}

export async function saveLatch(
  client: pg.PoolClient,
  ruleId: number,
  latch: LatchState,
): Promise<void> {
  await client.query(
    `INSERT INTO alert_rule_latches (rule_id, active, since_at, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (rule_id) DO UPDATE SET
       active = EXCLUDED.active,
       since_at = EXCLUDED.since_at,
       updated_at = now()`,
    [ruleId, latch.active, latch.sinceAt],
  )
}

export async function lastAlertAt(
  client: pg.PoolClient,
  ruleId: number,
  dedupKey: string,
): Promise<Date | null> {
  const { rows } = await client.query<{ ts: Date }>(
    `SELECT ts FROM alerts
     WHERE rule_id = $1 AND dedup_key = $2
     ORDER BY ts DESC LIMIT 1`,
    [ruleId, dedupKey],
  )
  return rows[0]?.ts ?? null
}

export function utcHourBucket(ts: Date): Date {
  return new Date(
    Date.UTC(
      ts.getUTCFullYear(),
      ts.getUTCMonth(),
      ts.getUTCDate(),
      ts.getUTCHours(),
      0,
      0,
      0,
    ),
  )
}

export async function emitAlert(
  db: Db,
  input: EmitAlertInput,
): Promise<EmitAlertResult> {
  const ts = input.ts ?? new Date()
  const dedupHour = utcHourBucket(ts)
  return db.withClient(async (client) => {
    const last = await lastAlertAt(client, input.ruleId, input.dedupKey)
    if (
      !canEmitAlert({
        lastAlertAt: last,
        now: ts,
        cooldownSec: input.cooldownSec,
      })
    ) {
      return { emitted: false, reason: 'cooldown' }
    }

    try {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO alerts (rule_id, ts, dedup_hour, severity, dedup_key, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id::text`,
        [
          input.ruleId,
          ts,
          dedupHour,
          input.severity,
          input.dedupKey,
          JSON.stringify(input.payload),
        ],
      )
      return { emitted: true, alertId: Number(rows[0]!.id) }
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : ''
      if (code === '23505') {
        return { emitted: false, reason: 'dedup_hour' }
      }
      throw err
    }
  })
}

export async function beatHeartbeat(
  db: Db,
  name: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await db.withClient(async (client) => {
    await client.query(
      `INSERT INTO watcher_heartbeats (name, last_beat_at, detail)
       VALUES ($1, now(), $2::jsonb)
       ON CONFLICT (name) DO UPDATE SET
         last_beat_at = now(),
         detail = EXCLUDED.detail`,
      [name, JSON.stringify(detail)],
    )
  })
}

export async function heartbeatAgeSec(
  db: Db,
  name: string,
  now = new Date(),
): Promise<number | null> {
  return db.withClient(async (client) => {
    const { rows } = await client.query<{ last_beat_at: Date }>(
      `SELECT last_beat_at FROM watcher_heartbeats WHERE name = $1`,
      [name],
    )
    const beat = rows[0]?.last_beat_at
    if (!beat) return null
    return (now.getTime() - beat.getTime()) / 1000
  })
}
