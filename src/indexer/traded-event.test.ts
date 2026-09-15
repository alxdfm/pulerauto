import { describe, expect, it } from 'vitest'
import {
  decodeTradedEvent,
  parseTradedFromLogs,
  TRADED_EVENT_DISCRIMINATOR,
} from './traded-event.js'
import { readU128 } from './buffer-codec.js'

function writeU128(buf: Buffer, offset: number, value: bigint): void {
  for (let i = 0; i < 16; i++) {
    buf[offset + i] = Number((value >> BigInt(8 * i)) & 0xffn)
  }
}

describe('traded-event', () => {
  it('decodes a synthetic Traded payload', () => {
    const buf = Buffer.alloc(121)
    TRADED_EVENT_DISCRIMINATOR.copy(buf, 0)
    // whirlpool left zero
    buf[40] = 1 // a_to_b
    writeU128(buf, 41, 1000n)
    writeU128(buf, 57, 900n)
    buf.writeBigUInt64LE(50n, 73)
    buf.writeBigUInt64LE(40n, 81)
    buf.writeBigUInt64LE(0n, 89)
    buf.writeBigUInt64LE(0n, 97)
    buf.writeBigUInt64LE(7n, 105)
    buf.writeBigUInt64LE(1n, 113)

    const ev = decodeTradedEvent(buf)
    expect(ev.aToB).toBe(true)
    expect(ev.preSqrtPrice).toBe(1000n)
    expect(ev.postSqrtPrice).toBe(900n)
    expect(ev.inputAmount).toBe(50n)
    expect(ev.outputAmount).toBe(40n)
    expect(ev.lpFee).toBe(7n)
    expect(ev.protocolFee).toBe(1n)
    expect(readU128(buf, 41)).toBe(1000n)
  })

  it('parses Program data logs for matching pool', () => {
    const pool = '11111111111111111111111111111111'
    const buf = Buffer.alloc(121)
    TRADED_EVENT_DISCRIMINATOR.copy(buf, 0)
    // PublicKey default 1s - actually 32 zero bytes = Identity
    const logs = [
      'Program log: Instruction: Swap',
      `Program data: ${buf.toString('base64')}`,
    ]
    const events = parseTradedFromLogs(logs, pool)
    // whirlpool zeros decode to 11111111111111111111111111111111
    expect(events.length).toBe(1)
    expect(events[0]!.whirlpool).toBe(pool)
  })
})
