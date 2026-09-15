import 'dotenv/config'
import { Connection } from '@solana/web3.js'
import { createDb } from '../db/client.js'
import { checkFeeSegInvariant } from '../db/invariants.js'
import { insertSwapWithSegments } from '../indexer/persist-swap.js'
import { getTransactionJson } from '../indexer/rpc-tx.js'
import { loadTickNetsAsOf } from '../indexer/tick-nets.js'
import { parseTradedFromLogs } from '../indexer/traded-event.js'
import { runScript } from './run-script.js'

const db = createDb()

await runScript(async () => {
  const rpcUrl = process.env.SOLANA_RPC_URL
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL required')
  const signature = process.argv[2]
  if (!signature) throw new Error('usage: index-one-swap.ts <signature>')

  const { rows } = await db.withClient((c) =>
    c.query<{ id: string; address: string }>(
      `SELECT id::text, address FROM pools ORDER BY id LIMIT 1`,
    ),
  )
  const pool = rows[0]!
  const poolId = Number(pool.id)

  const connection = new Connection(rpcUrl, 'confirmed')
  const tx = await getTransactionJson(connection, signature)
  if (!tx?.meta || tx.meta.err) throw new Error('tx missing or failed')
  const events = parseTradedFromLogs(tx.meta.logMessages ?? [], pool.address)
  if (events.length === 0) throw new Error('no Traded events')

  const ts = new Date((tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000)

  await db.withClient(async (client) => {
    const tickNets = await loadTickNetsAsOf(client, poolId, ts)
    for (let i = 0; i < events.length; i++) {
      const result = await insertSwapWithSegments(client, {
        poolId,
        ts,
        slot: tx.slot,
        signature,
        eventIndex: i,
        ev: events[i]!,
        tickNets,
      })
      console.log({ eventPath: `traded:${i}`, ...result })
    }
  })

  const check = await checkFeeSegInvariant(db, poolId, 30)
  console.log(check)
  if (!check.ok) process.exitCode = 1
}, () => db.close())
