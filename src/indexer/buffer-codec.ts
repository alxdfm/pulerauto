/** Little-endian integer codecs for Solana account layouts. */

export function readU128(buf: Buffer, offset: number): bigint {
  if (offset + 16 > buf.length) {
    throw new Error(
      `readU128: need 16 bytes at ${offset}, buffer length ${buf.length}`,
    )
  }
  let result = 0n
  for (let i = 0; i < 16; i++) {
    result |= BigInt(buf[offset + i]!) << BigInt(8 * i)
  }
  return result
}

export function readI128(buf: Buffer, offset: number): bigint {
  const result = readU128(buf, offset)
  if (result >= 1n << 127n) {
    return result - (1n << 128n)
  }
  return result
}
