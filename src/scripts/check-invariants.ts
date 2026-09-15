import 'dotenv/config'
import { createDb } from '../db/client.js'
import { checkPoolInvariants } from '../db/invariants.js'
import { runScript } from './run-script.js'

const db = createDb()

await runScript(async () => {
  const poolIdArg = process.argv[2]
  let poolIds: number[] = []

  if (poolIdArg) {
    poolIds = [Number(poolIdArg)]
  } else {
    await db.withClient(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        'SELECT id::text FROM pools ORDER BY id',
      )
      poolIds = rows.map((r) => Number(r.id))
    })
  }

  let failed = false
  for (const id of poolIds) {
    const report = await checkPoolInvariants(db, id)
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) failed = true
  }
  if (failed) process.exitCode = 1
}, () => db.close())
