/**
 * Span-bridge: signature-walk to ≥minDays ago, insert a deep batch.
 * Dense fill continues via swaps:backfill on the main cursor.
 */
import 'dotenv/config'
import { createDb } from '../db/client.js'
import { indexSwapsSpanBridge } from '../indexer/index-swaps.js'
import { checkSwapSpan } from '../db/swap-span.js'
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

  const minDays = Number(argValue('--days') ?? process.argv[2] ?? '30')
  const maxSwaps = Number(argValue('--max') ?? '80')
  const delayMs = Number(argValue('--delay-ms') ?? '120')

  const { rows } = await db.withClient((c) =>
    c.query<{ id: string; address: string }>(
      `SELECT id::text, address FROM pools ORDER BY id LIMIT 1`,
    ),
  )
  if (!rows[0]) throw new Error('No pools seeded')
  const poolId = Number(rows[0].id)

  console.log('span-bridge walk', {
    pool: rows[0].address,
    minDays,
    maxSwaps,
    delayMs,
  })

  const result = await indexSwapsSpanBridge(db, {
    rpcUrl,
    poolId,
    poolAddress: rows[0].address,
    untilSecondsAgo: Math.ceil(minDays * 86400),
    maxSwaps,
    delayMs,
  })
  console.log(result)

  const span = await checkSwapSpan(db, poolId, minDays)
  console.log(span)
  if (!span.ok) process.exitCode = 1
}, () => db.close())
