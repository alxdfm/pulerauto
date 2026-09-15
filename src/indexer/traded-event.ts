import { PublicKey } from '@solana/web3.js'
import { readU128 } from './buffer-codec.js'

/** Anchor event discriminator for Traded */
export const TRADED_EVENT_DISCRIMINATOR = Buffer.from([
  225, 202, 73, 175, 147, 43, 160, 150,
])

export type TradedEvent = {
  whirlpool: string
  aToB: boolean
  preSqrtPrice: bigint
  postSqrtPrice: bigint
  inputAmount: bigint
  outputAmount: bigint
  inputTransferFee: bigint
  outputTransferFee: bigint
  lpFee: bigint
  protocolFee: bigint
}

export function decodeTradedEvent(data: Buffer): TradedEvent {
  if (data.length < 121) {
    throw new Error(`Traded event too short: ${data.length}`)
  }
  if (!data.subarray(0, 8).equals(TRADED_EVENT_DISCRIMINATOR)) {
    throw new Error('Traded discriminator mismatch')
  }
  let o = 8
  const whirlpool = new PublicKey(data.subarray(o, o + 32)).toBase58()
  o += 32
  const aToB = data[o]! !== 0
  o += 1
  const preSqrtPrice = readU128(data, o)
  o += 16
  const postSqrtPrice = readU128(data, o)
  o += 16
  const inputAmount = data.readBigUInt64LE(o)
  o += 8
  const outputAmount = data.readBigUInt64LE(o)
  o += 8
  const inputTransferFee = data.readBigUInt64LE(o)
  o += 8
  const outputTransferFee = data.readBigUInt64LE(o)
  o += 8
  const lpFee = data.readBigUInt64LE(o)
  o += 8
  const protocolFee = data.readBigUInt64LE(o)
  return {
    whirlpool,
    aToB,
    preSqrtPrice,
    postSqrtPrice,
    inputAmount,
    outputAmount,
    inputTransferFee,
    outputTransferFee,
    lpFee,
    protocolFee,
  }
}

/** Parse Traded events for a pool from transaction log messages. */
export function parseTradedFromLogs(
  logs: string[],
  poolAddress: string,
): TradedEvent[] {
  const out: TradedEvent[] = []
  for (const line of logs) {
    if (!line.startsWith('Program data: ')) continue
    const b64 = line.slice('Program data: '.length)
    let buf: Buffer
    try {
      buf = Buffer.from(b64, 'base64')
    } catch {
      continue
    }
    if (
      buf.length < 8 ||
      !buf.subarray(0, 8).equals(TRADED_EVENT_DISCRIMINATOR)
    ) {
      continue
    }
    try {
      const ev = decodeTradedEvent(buf)
      if (ev.whirlpool === poolAddress) out.push(ev)
    } catch {
      // skip malformed
    }
  }
  return out
}
