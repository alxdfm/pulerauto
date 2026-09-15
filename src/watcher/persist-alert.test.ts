import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client.js'
import { emitAlert } from './persist-alert.js'
import {
  formatAlertMessage,
  loadTelegramConfig,
  sendTelegramAlert,
} from './telegram.js'

describe('emitAlert dedup', () => {
  it('rejects second insert in same hour for same dedup_key', async () => {
    const db = createDb()
    try {
      const { rows: pos } = await db.withClient((c) =>
        c.query<{ id: string }>(
          `SELECT id::text FROM positions ORDER BY id LIMIT 1`,
        ),
      )
      if (pos.length === 0) return

      const { rows: rules } = await db.withClient((c) =>
        c.query<{ id: string }>(
          `INSERT INTO alert_rules (position_id, kind, cooldown_sec, channels, enabled)
           VALUES ($1, 'range_exit', 0, '{telegram}', TRUE)
           RETURNING id::text`,
          [Number(pos[0]!.id)],
        ),
      )
      const ruleId = Number(rules[0]!.id)
      const ts = new Date('2026-09-15T18:10:00Z')
      const key = `test-dedup-${ruleId}`

      const first = await emitAlert(db, {
        ruleId,
        severity: 'warn',
        dedupKey: key,
        payload: { n: 1 },
        cooldownSec: 0,
        ts,
      })
      expect(first.emitted).toBe(true)

      const second = await emitAlert(db, {
        ruleId,
        severity: 'warn',
        dedupKey: key,
        payload: { n: 2 },
        cooldownSec: 0,
        ts: new Date('2026-09-15T18:40:00Z'),
      })
      expect(second.emitted).toBe(false)
      if (!second.emitted) expect(second.reason).toBe('dedup_hour')
    } finally {
      await db.close()
    }
  })
})

describe('telegram dry-run', () => {
  it('logs when token unset', async () => {
    const cfg = loadTelegramConfig({})
    const result = await sendTelegramAlert(cfg, 'hello')
    expect(result.mode).toBe('dry_run')
    expect(result.ok).toBe(true)
  })

  it('formats message', () => {
    const text = formatAlertMessage({
      kind: 'range_exit',
      severity: 'action',
      dedupKey: 'range_exit|pos:1',
      payload: { positionId: 1 },
    })
    expect(text).toContain('ACTION')
    expect(text).toContain('range_exit')
  })
})
