import 'dotenv/config'
import { createDb } from '../db/client.js'
import { computePositionPnl } from '../math/position-pnl.js'
import { runScript } from './run-script.js'

const db = createDb()

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx < 0) return undefined
  return process.argv[idx + 1]
}

await runScript(async () => {
  const positionId = Number(argValue('--position') ?? '0')
  if (!positionId) throw new Error('Usage: pnl:check --position <id>')

  const { rows } = await db.withClient((c) =>
    c.query<{
      value_usd: string
      hodl_value_usd: string
      fees_earned_usd: string
      fees_pending_usd: string
      rewards_usd: string
      costs_usd: string
      funding_usd: string
      pnl_vs_hodl_usd: string
      entry_value_usd: string
    }>(
      `SELECT s.value_usd::text, s.hodl_value_usd::text, s.fees_earned_usd::text,
              s.fees_pending_usd::text, s.rewards_usd::text, s.costs_usd::text,
              s.funding_usd::text, s.pnl_vs_hodl_usd::text,
              p.entry_value_usd::text
       FROM position_snapshots s
       JOIN positions p ON p.id = s.position_id
       WHERE s.position_id = $1
       ORDER BY s.ts DESC LIMIT 1`,
      [positionId],
    ),
  )
  if (rows.length === 0) {
    console.error('no snapshot')
    process.exitCode = 1
    return
  }
  const s = rows[0]!
  const recomputed = computePositionPnl({
    valueNow: Number(s.value_usd),
    valueEntry: Number(s.entry_value_usd),
    feesCollected: Number(s.fees_earned_usd),
    feesPending: Number(s.fees_pending_usd),
    rewards: Number(s.rewards_usd),
    gas: 0,
    swapCosts: Number(s.costs_usd),
    funding: Number(s.funding_usd),
    hodlValueNow: Number(s.hodl_value_usd),
  })
  const stored = Number(s.pnl_vs_hodl_usd)
  const delta = Math.abs(recomputed.pnlVsHodl - stored)
  const ok = delta < 0.005
  console.log(
    JSON.stringify(
      { ok, stored, recomputed: recomputed.pnlVsHodl, deltaCents: delta * 100 },
      null,
      2,
    ),
  )
  if (!ok) process.exitCode = 1
}, () => db.close())
