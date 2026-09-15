import 'dotenv/config'
import { createDb } from '../db/client.js'
import { runWatchCycle } from './evaluate.js'

const LOOP_MS = Number(process.env.WATCHER_INTERVAL_MS ?? '30000')

async function main(): Promise<void> {
  const db = createDb()
  const once = process.argv.includes('--once')
  try {
    for (;;) {
      const result = await runWatchCycle(db)
      console.log(JSON.stringify({ ts: new Date().toISOString(), ...result }))
      if (once) break
      await new Promise((r) => setTimeout(r, LOOP_MS))
    }
  } finally {
    await db.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
