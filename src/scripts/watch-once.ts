import 'dotenv/config'
import { createDb } from '../db/client.js'
import { runWatchCycle } from '../watcher/evaluate.js'
import { runScript } from './run-script.js'

const db = createDb()

await runScript(async () => {
  const result = await runWatchCycle(db)
  console.log(JSON.stringify(result, null, 2))
}, () => db.close())
