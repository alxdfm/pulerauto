import 'dotenv/config'
import { createDb } from '../db/client.js'
import { analyzePoolMetricsForDay } from '../analyzer/pool-metrics-daily.js'
import { runScript } from './run-script.js'

const db = createDb()

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx < 0) return undefined
  return process.argv[idx + 1]
}

await runScript(async () => {
  const day =
    argValue('--day') ?? new Date().toISOString().slice(0, 10)
  const { rows } = await db.withClient((c) =>
    c.query<{ id: string }>(`SELECT id::text FROM pools ORDER BY id`),
  )
  const results = []
  for (const row of rows) {
    const metrics = await analyzePoolMetricsForDay(db, Number(row.id), day)
    results.push(metrics)
  }
  console.log(JSON.stringify(results, null, 2))
}, () => db.close())
