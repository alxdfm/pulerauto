import { describe, expect, it } from 'vitest'
import {
  decodeDynamicTickArray,
  DYNAMIC_TICK_ARRAY_DISCRIMINATOR,
  DYNAMIC_TICK_ARRAY_MIN_LEN,
} from './dynamic-tick-array.js'

function buildEmptyDynamicArray(startTickIndex: number): Buffer {
  const buf = Buffer.alloc(DYNAMIC_TICK_ARRAY_MIN_LEN)
  DYNAMIC_TICK_ARRAY_DISCRIMINATOR.copy(buf, 0)
  buf.writeInt32LE(startTickIndex, 8)
  // whirlpool + bitmap left zero; 88 Uninitialized tags already zero-filled
  return buf
}

describe('decodeDynamicTickArray', () => {
  it('decodes empty (all Uninitialized) array', () => {
    const data = buildEmptyDynamicArray(-352)
    const ticks = decodeDynamicTickArray(data, 4)
    expect(ticks).toEqual([])
  })

  it('decodes a single Initialized tick mid-array', () => {
    // Header 60 + 10 Uninitialized (10) + Initialized (113) + 77 Uninitialized
    const header = 60
    const slot = 10
    const before = slot
    const after = 88 - slot - 1
    const len = header + before + 113 + after
    const buf = Buffer.alloc(len)
    DYNAMIC_TICK_ARRAY_DISCRIMINATOR.copy(buf, 0)
    buf.writeInt32LE(0, 8)
    let o = header + before
    buf[o] = 1
    o += 1
    const net = 123456789n
    const gross = 123456789n
    for (let i = 0; i < 16; i++) {
      buf[o + i] = Number((net >> BigInt(8 * i)) & 0xffn)
    }
    o += 16
    for (let i = 0; i < 16; i++) {
      buf[o + i] = Number((gross >> BigInt(8 * i)) & 0xffn)
    }
    // feeGrowthOutsideA/B left zero; rewards zero

    const ticks = decodeDynamicTickArray(buf, 4)
    expect(ticks).toHaveLength(1)
    expect(ticks[0]!.tickIndex).toBe(slot * 4)
    expect(ticks[0]!.liquidityNet).toBe(net)
    expect(ticks[0]!.liquidityGross).toBe(gross)
    expect(ticks[0]!.feeGrowthOutsideA).toBe(0n)
    expect(ticks[0]!.feeGrowthOutsideB).toBe(0n)
  })
})
