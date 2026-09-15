import { describe, expect, it } from 'vitest'
import { readI128, readU128, readU64 } from './buffer-codec.js'

describe('buffer-codec', () => {
  it('readU128 round-trips small values', () => {
    const buf = Buffer.alloc(16)
    buf.writeBigUInt64LE(42n, 0)
    buf.writeBigUInt64LE(0n, 8)
    expect(readU128(buf, 0)).toBe(42n)
  })

  it('readI128 handles negatives', () => {
    const buf = Buffer.alloc(16)
    // -1 as i128 = all 0xff
    buf.fill(0xff)
    expect(readI128(buf, 0)).toBe(-1n)
  })

  it('readU64 little-endian', () => {
    const buf = Buffer.alloc(8)
    buf.writeBigUInt64LE(99n, 0)
    expect(readU64(buf, 0)).toBe(99n)
  })

  it('throws when buffer too short', () => {
    expect(() => readU128(Buffer.alloc(8), 0)).toThrow(/need 16 bytes/)
  })
})
