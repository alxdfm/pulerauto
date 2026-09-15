import 'dotenv/config'
import { createDb } from '../db/client.js'
import { checkPoolInvariants } from '../db/invariants.js'
import {
  indexPoolSnapshot,
  writeOnChainTickCheckpoint,
} from '../indexer/index-pool.js'
import { runScript } from '../scripts/run-script.js'

const db = createDb()

await runScript(async () => {
  const rpcUrl = process.env.SOLANA_RPC_URL
  if (!rpcUrl) {
    throw new Error('SOLANA_RPC_URL required')
  }

  const { rows } = await db.withClient(async (client) => {
    return client.query<{ id: string; address: string; tick_spacing: number }>(
      `SELECT id::text, address, tick_spacing FROM pools ORDER BY id LIMIT 1`,
    )
  })

  if (rows.length === 0) {
    throw new Error('No pools seeded — run db:seed')
  }

  const pool = rows[0]!
  const poolId = Number(pool.id)

  console.log(`Indexing pool ${pool.address} ...`)
  const snap = await indexPoolSnapshot(db, {
    rpcUrl,
    poolId,
    poolAddress: pool.address,
  })
  console.log({
    slot: snap.slot,
    tick: snap.tick,
    liquidity: snap.liquidity.toString(),
    tickSpacing: snap.tickSpacing,
    feeRate: snap.feeRate,
    mintA: snap.tokenMintA,
    mintB: snap.tokenMintB,
  })

  const tickResult = await writeOnChainTickCheckpoint(db, {
    rpcUrl,
    poolId,
    poolAddress: pool.address,
    currentTick: snap.tick,
    tickSpacing: snap.tickSpacing || pool.tick_spacing || 4,
    expectedLiquidity: snap.liquidity,
  })
  console.log('tick checkpoint:', {
    tickCount: tickResult.tickCount,
    reconstructed: tickResult.reconstructed.toString(),
    matches: tickResult.matches,
  })

  const report = await checkPoolInvariants(db, poolId)
  console.log(JSON.stringify(report, null, 2))
  if (!tickResult.matches) {
    console.warn(
      'WARN: on-chain L reconstruction does not match exactly yet (known gap).',
    )
  }
  if (tickResult.tickCount === 0) process.exitCode = 1
}, () => db.close())
