import 'dotenv/config'
import { Connection, PublicKey } from '@solana/web3.js'
import { createDb } from '../db/client.js'
import {
  indexPositionByMint,
  resolvePositionOpenMeta,
} from '../indexer/index-position.js'
import { derivePositionPda } from '../indexer/position-decode.js'
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
    throw new Error(
      'Usage: positions:index --mint <nft> --wallet <addr> ' +
        '[--entry-price --entry-amount0 --entry-amount1 --entry-value-usd --opened-at --tx-ref]',
    )
  }

  const entryPrice = argValue('--entry-price')
  const entryAmount0 = argValue('--entry-amount0')
  const entryAmount1 = argValue('--entry-amount1')
  const entryValueUsd = argValue('--entry-value-usd')
  const openedAtRaw = argValue('--opened-at')
  let txRef = argValue('--tx-ref')

  let openedAt = openedAtRaw ? new Date(openedAtRaw) : undefined
  if (openedAt && Number.isNaN(openedAt.getTime())) {
    throw new Error(`Invalid --opened-at: ${openedAtRaw}`)
  }
  if (!txRef || !openedAt) {
    const connection = new Connection(rpcUrl, 'confirmed')
    const meta = await resolvePositionOpenMeta(
      connection,
      derivePositionPda(new PublicKey(mint)),
    )
    if (meta) {
      txRef = txRef ?? meta.txRef
      openedAt = openedAt ?? meta.openedAt
    }
  }

  const hasEntry =
    entryPrice !== undefined &&
    entryAmount0 !== undefined &&
    entryAmount1 !== undefined &&
    entryValueUsd !== undefined

  if (hasEntry && (!openedAt || Number.isNaN(openedAt.getTime()) || !txRef)) {
    throw new Error(
      'entry flags require --opened-at and --tx-ref (or resolvable PDA history)',
    )
  }

  const result = await indexPositionByMint(db, {
    rpcUrl,
    walletAddress: wallet,
    positionMint: mint,
    entry: hasEntry
      ? {
          openedAt: openedAt!,
          entryPrice,
          entryAmount0: BigInt(entryAmount0!),
          entryAmount1: BigInt(entryAmount1!),
          entryValueUsd,
          txRef: txRef!,
        }
      : undefined,
  })
  console.log(JSON.stringify(result, null, 2))
}, () => db.close())
