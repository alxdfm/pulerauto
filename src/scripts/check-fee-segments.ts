import 'dotenv/config'
import { createDb } from '../db/client.js'
import { checkFeeSegInvariant } from '../db/invariants.js'
import { runScript } from './run-script.js'

const db = createDb()

await runScript(async () => {
  const days = Number(process.argv[2] ?? '30')
  const { rows } = await db.withClient((c) =>
    c.query<{ id: string }>(`SELECT id::text FROM pools ORDER BY id LIMIT 1`),
  )
  if (rows.length === 0) throw new Error('No pools seeded')
  const poolId = Number(rows[0]!.id)
  const check = await checkFeeSegInvariant(db, poolId, days)
  console.log(JSON.stringify(check, null, 2))
  if (!check.ok) process.exitCode = 1
}, () => db.close())
