import 'dotenv/config'
import { createDb } from '../db/client.js'
import { analyzePositionFromDb } from '../analyzer/position-snapshot.js'
import { runScript } from './run-script.js'

const db = createDb()

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx < 0) return undefined
  return process.argv[idx + 1]
}

await runScript(async () => {
  const positionId = Number(argValue('--position') ?? '0')
  if (!positionId) throw new Error('Usage: positions:snapshot --position <id>')

  const snap = await analyzePositionFromDb(db, positionId, {
    decimals0: 9,
    decimals1: 6,
  })
  if (!snap) {
    console.error('position or pool_states missing')
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify(snap, null, 2))
}, () => db.close())
