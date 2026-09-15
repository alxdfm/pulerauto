import 'dotenv/config'
import { createDb } from '../db/client.js'
import { runScript } from './run-script.js'

const db = createDb()

await runScript(async () => {
  const days = Number(process.argv[2] ?? '7')
  const { rows } = await db.withClient((c) =>
    c.query<{
      rule_id: string
      dedup_key: string
      dedup_hour: Date
      n: string
    }>(
      `SELECT rule_id::text, dedup_key, dedup_hour, COUNT(*)::text AS n
       FROM alerts
       WHERE ts >= now() - ($1::text || ' days')::interval
       GROUP BY rule_id, dedup_key, dedup_hour
       HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC`,
      [String(days)],
    ),
  )
  const report = {
    windowDays: days,
    duplicateBuckets: rows.length,
    ok: rows.length === 0,
    samples: rows.slice(0, 20),
  }
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}, () => db.close())
