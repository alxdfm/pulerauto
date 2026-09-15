import type pg from 'pg'
import { reconstructActiveLiquidity, type TickNet } from '../math/liquidity.js'
import { buildSwapSegments } from '../math/swap-segments.js'
import { tickFromSqrtPriceX64 } from '../math/sqrt-price.js'
import type { TradedEvent } from './traded-event.js'

export type PersistSwapResult = {
  inserted: boolean
  segmentCount: number
}

function amountsFromTraded(ev: TradedEvent): {
  amount0: bigint
  amount1: bigint
} {
  if (ev.aToB) {
    return { amount0: ev.inputAmount, amount1: -ev.outputAmount }
  }
  return { amount0: -ev.outputAmount, amount1: ev.inputAmount }
}

async function insertSegmentsBatch(
  client: pg.PoolClient,
  opts: {
    poolId: number
    ts: Date
    signature: string
    eventPath: string
    segments: {
      tickLo: number
      tickHi: number
      liquiditySeg: bigint
      amountInSeg: bigint
      feeSeg: bigint
    }[]
  },
): Promise<void> {
  if (opts.segments.length === 0) return

  const values: unknown[] = []
  const placeholders: string[] = []
  let i = 1
  for (let segIndex = 0; segIndex < opts.segments.length; segIndex++) {
    const s = opts.segments[segIndex]!
    placeholders.push(
      `($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`,
    )
    values.push(
      opts.poolId,
      opts.ts,
      opts.signature,
      opts.eventPath,
      segIndex,
      s.tickLo,
      s.tickHi,
      s.liquiditySeg.toString(),
      s.amountInSeg.toString(),
      s.feeSeg.toString(),
    )
  }

  await client.query(
    `INSERT INTO swap_segments (
       pool_id, ts, tx_ref, event_path, seg_index,
       tick_lo, tick_hi, liquidity_seg, amount_in_seg, fee_seg
     ) VALUES ${placeholders.join(',')}
     ON CONFLICT DO NOTHING`,
    values,
  )
}

async function insertSwapRow(
  client: pg.PoolClient,
  opts: {
    poolId: number
    ts: Date
    slot: number
    signature: string
    eventPath: string
    amount0: bigint
    amount1: bigint
    ev: TradedEvent
    tickBefore: number
    tickAfter: number
    liquidityBefore: bigint
  },
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO swaps (
       pool_id, ts, block_or_slot, tx_ref, event_path, sender,
       amount0, amount1, sqrt_price_before, sqrt_price_after,
       tick_before, tick_after, liquidity_before, fee_amount
     ) VALUES (
       $1,$2,$3,$4,$5,NULL,
       $6,$7,$8,$9,
       $10,$11,$12,$13
     )
     ON CONFLICT DO NOTHING`,
    [
      opts.poolId,
      opts.ts,
      opts.slot,
      opts.signature,
      opts.eventPath,
      opts.amount0.toString(),
      opts.amount1.toString(),
      opts.ev.preSqrtPrice.toString(),
      opts.ev.postSqrtPrice.toString(),
      opts.tickBefore,
      opts.tickAfter,
      opts.liquidityBefore.toString(),
      opts.ev.lpFee.toString(),
    ],
  )
  return (result.rowCount ?? 0) > 0
}

/** Persist one Traded event as swap + segments. Returns whether the swap row was new. */
export async function insertSwapWithSegments(
  client: pg.PoolClient,
  opts: {
    poolId: number
    ts: Date
    slot: number
    signature: string
    eventIndex: number
    ev: TradedEvent
    tickNets: TickNet[]
  },
): Promise<PersistSwapResult> {
  const tickBefore = tickFromSqrtPriceX64(opts.ev.preSqrtPrice)
  const tickAfter = tickFromSqrtPriceX64(opts.ev.postSqrtPrice)
  const liquidityBefore = reconstructActiveLiquidity(
    opts.tickNets,
    tickBefore,
  ).activeLiquidity
  const { amount0, amount1 } = amountsFromTraded(opts.ev)
  const eventPath = `traded:${opts.eventIndex}`

  const inserted = await insertSwapRow(client, {
    poolId: opts.poolId,
    ts: opts.ts,
    slot: opts.slot,
    signature: opts.signature,
    eventPath,
    amount0,
    amount1,
    ev: opts.ev,
    tickBefore,
    tickAfter,
    liquidityBefore,
  })
  if (!inserted) return { inserted: false, segmentCount: 0 }

  const pathLo = Math.min(tickBefore, tickAfter)
  const pathHi = Math.max(tickBefore, tickAfter)
  const segments = buildSwapSegments({
    tickBefore,
    tickAfter,
    sqrtBefore: opts.ev.preSqrtPrice,
    sqrtAfter: opts.ev.postSqrtPrice,
    liquidityBefore,
    amountIn: opts.ev.inputAmount,
    feeAmount: opts.ev.lpFee,
    tickNets: opts.tickNets.filter(
      (t) => t.tickIndex >= pathLo && t.tickIndex <= pathHi,
    ),
    aToB: opts.ev.aToB,
  })

  await insertSegmentsBatch(client, {
    poolId: opts.poolId,
    ts: opts.ts,
    signature: opts.signature,
    eventPath,
    segments,
  })
  return { inserted: true, segmentCount: segments.length }
}
