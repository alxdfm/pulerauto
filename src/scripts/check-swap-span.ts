import 'dotenv/config'
import { createDb } from '../db/client.js'
import { checkSwapSpan } from '../db/swap-span.js'
import { runScript } from './run-script.js'

const db = createDb()

await runScript(async () => {
  const minDays = Number(process.argv[2] ?? '30')
  const { rows } = await db.withClient((c) =>
    c.query<{ id: string }>(`SELECT id::text FROM pools ORDER BY id LIMIT 1`),
  )
  if (rows.length === 0) throw new Error('No pools seeded')
  const poolId = Number(rows[0]!.id)
  const report = await checkSwapSpan(db, poolId, minDays)
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}, () => db.close())
