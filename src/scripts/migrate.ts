import 'dotenv/config'
import { createDb } from '../db/client.js'
import { migrate } from '../db/migrate.js'
import { runScript } from './run-script.js'

const db = createDb()

await runScript(async () => {
  const applied = await migrate(db)
  console.log(
    applied.length === 0
      ? 'Migrations up to date'
      : `Applied: ${applied.join(', ')}`,
  )
}, () => db.close())
