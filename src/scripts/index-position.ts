import 'dotenv/config'
import { createDb } from '../db/client.js'
import { indexPositionByMint } from '../indexer/index-position.js'
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
  const mint = argValue('--mint')
  const wallet = argValue('--wallet')
  if (!mint || !wallet) {
    throw new Error('Usage: positions:index --mint <nft> --wallet <addr>')
  }

  const { rows } = await db.withClient((c) =>
    c.query<{ id: string; chain_id: number }>(
      `SELECT p.id::text, d.chain_id
       FROM pools p JOIN dexes d ON d.id = p.dex_id
       ORDER BY p.id LIMIT 1`,
    ),
  )
  if (rows.length === 0) throw new Error('No pools seeded')
  const pool = rows[0]!

  const result = await indexPositionByMint(db, {
    rpcUrl,
    poolId: Number(pool.id),
    chainId: pool.chain_id,
    walletAddress: wallet,
    positionMint: mint,
    decimals0: 9,
    decimals1: 6,
  })
  console.log(JSON.stringify(result, null, 2))
}, () => db.close())
