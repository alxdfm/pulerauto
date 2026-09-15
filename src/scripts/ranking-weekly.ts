import 'dotenv/config'
import { createDb } from '../db/client.js'
import { weeklyRankingByEdgeRatio } from '../analyzer/weekly-ranking.js'
import { runScript } from './run-script.js'

const db = createDb()

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx < 0) return undefined
  return process.argv[idx + 1]
}

await runScript(async () => {
  const ranking = await weeklyRankingByEdgeRatio(db, {
    asOfDay: argValue('--day'),
    limit: Number(argValue('--limit') ?? '50'),
  })
  console.log(JSON.stringify(ranking, null, 2))
}, () => db.close())
