import 'dotenv/config'
import { createDb } from '../db/client.js'
import { loadLatestOosRun } from '../db/backtest-runs.js'
import { evaluateBacktestGate } from '../analyzer/backtest-report.js'
import { runScript } from './run-script.js'

const db = createDb()

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx < 0) return undefined
  return process.argv[idx + 1]
}

await runScript(async () => {
  const strategyId = Number(argValue('--strategy') ?? '0')
  let sid = strategyId
  if (!sid) {
    const { rows } = await db.withClient((c) =>
      c.query<{ id: string }>(
        `SELECT id::text FROM strategies ORDER BY id LIMIT 1`,
      ),
    )
    if (!rows[0]) throw new Error('No strategy')
    sid = Number(rows[0].id)
  }

  const run = await loadLatestOosRun(db, sid)
  if (!run) {
    console.log(JSON.stringify({ ok: false, detail: 'no OOS BacktestRun' }))
    process.exitCode = 1
    return
  }

  const volatile =
    typeof run.paramsSnapshot.pnlVsHodlVolatileUsd === 'number'
      ? run.paramsSnapshot.pnlVsHodlVolatileUsd
      : 0

  const gate = evaluateBacktestGate({
    pnlVsHodl5050Usd: run.pnlVsHodlUsd ?? 0,
    pnlVsHodlVolatileUsd: volatile,
    pnlVsFullRangeUsd: run.pnlVsFullrangeUsd ?? 0,
    realityCheckPvalue: run.realityCheckPvalue ?? 1,
  })

  const report = {
    runId: run.id,
    feeSource: run.feeSource,
    feeSourceOk: run.feeSource === 'reconstructed_segments',
    ...gate,
    realityCheckPvalue: run.realityCheckPvalue,
    pnlUsd: run.pnlUsd,
    pnlVsHodlUsd: run.pnlVsHodlUsd,
    pnlVsFullrangeUsd: run.pnlVsFullrangeUsd,
  }
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok || !report.feeSourceOk) process.exitCode = 1
}, () => db.close())
