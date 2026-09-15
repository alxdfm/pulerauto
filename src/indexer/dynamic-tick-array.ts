import { readI128, readU128 } from './buffer-codec.js'
import type { DecodedTick } from './tick-array.js'
import { TICK_ARRAY_SIZE } from './tick-array.js'

/** Anchor discriminator for account:DynamicTickArray */
export const DYNAMIC_TICK_ARRAY_DISCRIMINATOR = Buffer.from([
  17, 216, 246, 142, 225, 199, 218, 56,
])

export const DYNAMIC_TICK_ARRAY_MIN_LEN = 148
export const DYNAMIC_TICK_ARRAY_MAX_LEN = 10004

/** Header: disc(8) + start_tick_index(4) + whirlpool(32) + tick_bitmap(16) */
const DYNAMIC_HEADER_LEN = 8 + 4 + 32 + 16

/**
 * Decode a variable-length DynamicTickArray.
 * Each of 88 slots is Borsh enum: Uninitialized (1 byte) or Initialized+data (113).
 */
export function decodeDynamicTickArray(
  data: Buffer,
  tickSpacing: number,
): DecodedTick[] {
  if (
    data.length < DYNAMIC_TICK_ARRAY_MIN_LEN ||
    data.length > DYNAMIC_TICK_ARRAY_MAX_LEN
  ) {
    throw new Error(
      `DynamicTickArray length ${data.length} outside [${DYNAMIC_TICK_ARRAY_MIN_LEN}, ${DYNAMIC_TICK_ARRAY_MAX_LEN}]`,
    )
  }
  if (!data.subarray(0, 8).equals(DYNAMIC_TICK_ARRAY_DISCRIMINATOR)) {
    throw new Error('DynamicTickArray discriminator mismatch')
  }

  const startTickIndex = data.readInt32LE(8)
  let o = DYNAMIC_HEADER_LEN
  const ticks: DecodedTick[] = []

  for (let i = 0; i < TICK_ARRAY_SIZE; i++) {
    if (o >= data.length) {
      throw new Error(
        `DynamicTickArray truncated at tick slot ${i}, offset ${o}`,
      )
    }
    const tag = data[o]!
    o += 1
    if (tag === 0) {
      continue
    }
    if (tag !== 1) {
      throw new Error(`Unknown DynamicTick tag ${tag} at slot ${i}`)
    }
    if (o + 112 > data.length) {
      throw new Error(`DynamicTick Initialized truncated at slot ${i}`)
    }
    const liquidityNet = readI128(data, o)
    o += 16
    const liquidityGross = readU128(data, o)
    o += 16
    o += 16 + 16 + 48 // fee growth + rewards
    ticks.push({
      tickIndex: startTickIndex + i * tickSpacing,
      initialized: true,
      liquidityNet,
      liquidityGross,
    })
  }

  if (o !== data.length) {
    throw new Error(
      `DynamicTickArray trailing bytes: consumed ${o}, length ${data.length}`,
    )
  }

  return ticks
}

export function isDynamicTickArrayAccount(data: Buffer): boolean {
  return (
    data.length >= 8 &&
    data.subarray(0, 8).equals(DYNAMIC_TICK_ARRAY_DISCRIMINATOR)
  )
}
