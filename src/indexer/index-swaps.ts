import { Connection, PublicKey } from '@solana/web3.js'
import type { Db } from '../db/client.js'
import { insertSwapWithSegments } from './persist-swap.js'
import { getTransactionsJsonBatch, sleep, type TxJson } from './rpc-tx.js'
import { parseTradedFromLogs } from './traded-event.js'
import { loadTickNetsAsOf } from './tick-nets.js'

export type SwapIndexResult = {
  signaturesScanned: number
  swapsInserted: number
  segmentsInserted: number
  oldestBlockTime: number | null
  newestBlockTime: number | null
}

type SigInfo = {
  signature: string
  slot: number
  blockTime?: number | null
  err: unknown
}

function toSigInfo(sig: {
  signature: string
  slot: number
  blockTime?: number | null
  err: unknown
}): SigInfo {
  return {
    signature: sig.signature,
    slot: sig.slot,
    blockTime: sig.blockTime,
    err: sig.err,
  }
}

async function saveCursor(
  db: Db,
  cursorName: string,
  poolId: number,
  signature: string,
  slot: number,
): Promise<void> {
  await db.withClient(async (client) => {
    await client.query(
      `INSERT INTO indexer_cursors (name, pool_id, cursor_signature, cursor_slot, updated_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (name) DO UPDATE SET
         cursor_signature = EXCLUDED.cursor_signature,
         cursor_slot = EXCLUDED.cursor_slot,
         updated_at = now()`,
      [cursorName, poolId, signature, slot],
    )
  })
}

function updateTimeBounds(
  sigInfo: SigInfo,
  bounds: { oldest: number | null; newest: number | null },
): void {
  if (sigInfo.blockTime === null || sigInfo.blockTime === undefined) return
  bounds.oldest =
    bounds.oldest === null
      ? sigInfo.blockTime
      : Math.min(bounds.oldest, sigInfo.blockTime)
  bounds.newest =
    bounds.newest === null
      ? sigInfo.blockTime
      : Math.max(bounds.newest, sigInfo.blockTime)
}

async function persistTradedTx(
  db: Db,
  opts: {
    poolId: number
    poolAddress: string
    sigInfo: SigInfo
    tx: TxJson
  },
): Promise<{ swaps: number; segments: number }> {
  const events = parseTradedFromLogs(
    opts.tx.meta?.logMessages ?? [],
    opts.poolAddress,
  )
  if (events.length === 0) return { swaps: 0, segments: 0 }

  const ts = new Date(
    (opts.sigInfo.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
  )

  let swaps = 0
  let segments = 0
  await db.withClient(async (client) => {
    await client.query('BEGIN')
    try {
      const tickNets = await loadTickNetsAsOf(client, opts.poolId, ts)
      for (let ei = 0; ei < events.length; ei++) {
        const result = await insertSwapWithSegments(client, {
          poolId: opts.poolId,
          ts,
          slot: opts.tx.slot,
          signature: opts.sigInfo.signature,
          eventIndex: ei,
          ev: events[ei]!,
          tickNets,
        })
        if (result.inserted) {
          swaps += 1
          segments += result.segmentCount
        }
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  })
  return { swaps, segments }
}

async function loadCursor(
  db: Db,
  cursorName: string,
): Promise<string | undefined> {
  return db.withClient(async (c) => {
    const { rows } = await c.query<{ cursor_signature: string | null }>(
      `SELECT cursor_signature FROM indexer_cursors WHERE name = $1`,
      [cursorName],
    )
    return rows[0]?.cursor_signature ?? undefined
  })
}

export async function indexSwapsBackfill(
  db: Db,
  opts: {
    rpcUrl: string
    poolId: number
    poolAddress: string
    maxSwaps?: number
    untilSecondsAgo?: number
    delayMs?: number
    batchSize?: number
    cursorName?: string
  },
): Promise<SwapIndexResult> {
  const connection = new Connection(opts.rpcUrl, 'confirmed')
  const poolKey = new PublicKey(opts.poolAddress)
  const delayMs = opts.delayMs ?? 1200
  const batchSize = opts.batchSize ?? 1
  const maxSwaps = opts.maxSwaps ?? 0
  const untilTs =
    opts.untilSecondsAgo !== undefined
      ? Math.floor(Date.now() / 1000) - opts.untilSecondsAgo
      : 0
  const cursorName = opts.cursorName ?? `swaps:${opts.poolId}`

  let before = await loadCursor(db, cursorName)
  let signaturesScanned = 0
  let swapsInserted = 0
  let segmentsInserted = 0
  const bounds = { oldest: null as number | null, newest: null as number | null }

  pageLoop: for (;;) {
    await sleep(delayMs)
    const sigs = await connection.getSignaturesForAddress(poolKey, {
      limit: 200,
      before,
    })
    if (sigs.length === 0) break

    const okSigs: SigInfo[] = []
    for (const sig of sigs) {
      const sigInfo = toSigInfo(sig)
      signaturesScanned += 1
      before = sigInfo.signature
      updateTimeBounds(sigInfo, bounds)
      if (untilTs > 0 && sigInfo.blockTime != null && sigInfo.blockTime < untilTs) {
        await saveCursor(
          db,
          cursorName,
          opts.poolId,
          sigInfo.signature,
          sigInfo.slot,
        )
        break pageLoop
      }
      if (!sigInfo.err) okSigs.push(sigInfo)
    }

    for (let i = 0; i < okSigs.length; i += batchSize) {
      const chunk = okSigs.slice(i, i + batchSize)
      await sleep(delayMs)
      const txs = await getTransactionsJsonBatch(
        connection,
        chunk.map((s) => s.signature),
      )

      for (let j = 0; j < chunk.length; j++) {
        const sigInfo = chunk[j]!
        const tx = txs[j]
        if (!tx?.meta || tx.meta.err) continue

        const persisted = await persistTradedTx(db, {
          poolId: opts.poolId,
          poolAddress: opts.poolAddress,
          sigInfo,
          tx,
        })
        swapsInserted += persisted.swaps
        segmentsInserted += persisted.segments

        if (maxSwaps > 0 && swapsInserted >= maxSwaps) {
          await saveCursor(
            db,
            cursorName,
            opts.poolId,
            sigInfo.signature,
            tx.slot,
          )
          break pageLoop
        }
      }
    }

    const last = sigs[sigs.length - 1]!
    await saveCursor(db, cursorName, opts.poolId, last.signature, last.slot)
  }

  return {
    signaturesScanned,
    swapsInserted,
    segmentsInserted,
    oldestBlockTime: bounds.oldest,
    newestBlockTime: bounds.newest,
  }
}
