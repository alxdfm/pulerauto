/**
 * Discover Whirlpool Position accounts for the pilot pool (memcmp whirlpool @ offset 8).
 * Writes a small fixture with mint + ticks + L for offline replay.
 */

import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Connection, PublicKey } from '@solana/web3.js'
import {
  decodePosition,
} from '../indexer/position-decode.js'
import { runScript } from './run-script.js'

const POOL =
  process.env.ORCA_SOL_USDC_POOL ??
  'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'

await runScript(async () => {
  const rpcUrl = process.env.SOLANA_RPC_URL
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL required')
  const connection = new Connection(rpcUrl, 'confirmed')
  const poolKey = new PublicKey(POOL)

  const accounts = await connection.getProgramAccounts(
    new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
    {
      commitment: 'confirmed',
      filters: [
        { dataSize: 216 },
        { memcmp: { offset: 8, bytes: poolKey.toBase58() } },
      ],
    },
  )

  const open = []
  for (const { pubkey, account } of accounts) {
    const pos = decodePosition(account.data as Buffer)
    if (pos.liquidity === 0n) continue
    open.push({
      positionAddress: pubkey.toBase58(),
      positionMint: pos.positionMint,
      tickLower: pos.tickLowerIndex,
      tickUpper: pos.tickUpperIndex,
      liquidity: pos.liquidity.toString(),
      feeOwedA: pos.feeOwedA.toString(),
      feeOwedB: pos.feeOwedB.toString(),
    })
    if (open.length >= 5) break
  }

  const out = {
    pool: POOL,
    capturedAt: new Date().toISOString(),
    countScanned: accounts.length,
    openPositions: open,
  }
  const dest = path.resolve('fixtures/orca-sol-usdc-positions.json')
  writeFileSync(dest, JSON.stringify(out, null, 2))
  console.log(JSON.stringify({ wrote: dest, open: open.length, scanned: accounts.length }, null, 2))
})
