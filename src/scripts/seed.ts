import 'dotenv/config'
import { createDb } from '../db/client.js'
import { migrate } from '../db/migrate.js'
import { runScript } from './run-script.js'

const db = createDb()

await runScript(async () => {
  await migrate(db)
  await db.withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT p.id, p.address, d.name AS dex, t0.symbol AS token0, t1.symbol AS token1
       FROM pools p
       JOIN dexes d ON d.id = p.dex_id
       JOIN tokens t0 ON t0.id = p.token0_id
       JOIN tokens t1 ON t1.id = p.token1_id`,
    )
    console.log('Pools:', rows)
  })
}, () => db.close())
