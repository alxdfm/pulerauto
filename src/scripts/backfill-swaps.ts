import 'dotenv/config'
import { createDb } from '../db/client.js'
import { indexSwapsBackfill } from '../indexer/index-swaps.js'
import { checkFeeSegInvariant } from '../db/invariants.js'
import { runScript } from './run-script.js'

const db = createDb()

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx < 0) return undefined
  return process.argv[idx + 1]
}

await runScript(async () => {
  const rpcUrl = process.env.SOLANA_RPC_URL
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL required')

  const maxSwaps = Number(argValue('--max') ?? '200')
  const untilHours = Number(argValue('--hours') ?? '0')
  const delayMs = Number(argValue('--delay-ms') ?? '400')

  const { rows } = await db.withClient((c) =>
    c.query<{ id: string; address: string }>(
      `SELECT id::text, address FROM pools ORDER BY id LIMIT 1`,
    ),
  )
  if (rows.length === 0) throw new Error('No pools seeded')
  const pool = rows[0]!
  const poolId = Number(pool.id)

  console.log('backfill swaps', {
    pool: pool.address,
    maxSwaps,
    untilHours,
    delayMs,
  })

  const result = await indexSwapsBackfill(db, {
    rpcUrl,
    poolId,
    poolAddress: pool.address,
    maxSwaps: maxSwaps > 0 ? maxSwaps : undefined,
    untilSecondsAgo: untilHours > 0 ? untilHours * 3600 : undefined,
    delayMs,
  })
  console.log(result)

  const feeCheck = await checkFeeSegInvariant(db, poolId, 30)
  console.log(feeCheck)
  if (!feeCheck.ok) process.exitCode = 1
}, () => db.close())
