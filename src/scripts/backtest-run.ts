import 'dotenv/config'
import { createDb } from '../db/client.js'
import { runWalkForwardBacktest } from '../analyzer/backtest-run.js'
import { runScript } from './run-script.js'

const db = createDb()

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx < 0) return undefined
  return process.argv[idx + 1]
}

await runScript(async () => {
  const strategyId = Number(argValue('--strategy') ?? '0')
  const poolId = Number(argValue('--pool') ?? '1')
  const trainDays = Number(argValue('--train-days') ?? '7')
  const testDays = Number(argValue('--test-days') ?? '3')
  const nTrials = Number(argValue('--n-trials') ?? '1')
  const daysBack = Number(argValue('--days') ?? '14')

  let sid = strategyId
  if (!sid) {
    const { rows } = await db.withClient((c) =>
      c.query<{ id: string }>(
        `SELECT id::text FROM strategies WHERE pool_id = $1 ORDER BY id LIMIT 1`,
        [poolId],
      ),
    )
    if (!rows[0]) throw new Error('No strategy — run alerts:ensure-rules first')
    sid = Number(rows[0].id)
  }

  const windowEnd = new Date()
  const windowStart = new Date(
    windowEnd.getTime() - daysBack * 86_400_000,
  )

  const result = await runWalkForwardBacktest(db, {
    strategyId: sid,
    poolId,
    windowStart,
    windowEnd,
    trainDays,
    testDays,
    nTrials,
  })
  console.log(JSON.stringify(result, null, 2))
  if (result.foldRunIds.length === 0) {
    console.error(
      result.detail ??
        'No BacktestRun produced (need WalkForward folds + pool_states)',
    )
    process.exitCode = 1
  }
}, () => db.close())
