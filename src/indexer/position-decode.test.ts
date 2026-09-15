import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import {
  decodePosition,
  derivePositionPda,
  POSITION_ACCOUNT_LEN,
  POSITION_DISCRIMINATOR,
} from './position-decode.js'
import { WHIRLPOOL_PROGRAM_ID } from './tick-array.js'

function writeU128LE(buf: Buffer, offset: number, value: bigint): void {
  for (let i = 0; i < 16; i++) {
    buf[offset + i] = Number((value >> BigInt(8 * i)) & 0xffn)
  }
}

describe('decodePosition', () => {
  it('round-trips a synthetic Position account', () => {
    const whirlpool = PublicKey.unique()
    const mint = PublicKey.unique()
    const buf = Buffer.alloc(POSITION_ACCOUNT_LEN)
    POSITION_DISCRIMINATOR.copy(buf, 0)
    let o = 8
    whirlpool.toBuffer().copy(buf, o)
    o += 32
    mint.toBuffer().copy(buf, o)
    o += 32
    writeU128LE(buf, o, 0x11223344556677889900aabbccddeeffn)
    o += 16
    buf.writeInt32LE(-100, o)
    o += 4
    buf.writeInt32LE(200, o)
    o += 4
    writeU128LE(buf, o, 111n)
    o += 16
    buf.writeBigUInt64LE(7n, o)
    o += 8
    writeU128LE(buf, o, 222n)
    o += 16
    buf.writeBigUInt64LE(9n, o)

    const pos = decodePosition(buf)
    expect(pos.whirlpool).toBe(whirlpool.toBase58())
    expect(pos.positionMint).toBe(mint.toBase58())
    expect(pos.liquidity).toBe(0x11223344556677889900aabbccddeeffn)
    expect(pos.tickLowerIndex).toBe(-100)
    expect(pos.tickUpperIndex).toBe(200)
    expect(pos.feeGrowthCheckpointA).toBe(111n)
    expect(pos.feeOwedA).toBe(7n)
    expect(pos.feeGrowthCheckpointB).toBe(222n)
    expect(pos.feeOwedB).toBe(9n)
    expect(pos.rewardInfos).toHaveLength(3)
  })

  it('rejects wrong discriminator', () => {
    const buf = Buffer.alloc(POSITION_ACCOUNT_LEN)
    expect(() => decodePosition(buf)).toThrow(/discriminator/)
  })

  it('derivePositionPda uses position seed', () => {
    const mint = PublicKey.unique()
    const pda = derivePositionPda(mint)
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), mint.toBuffer()],
      WHIRLPOOL_PROGRAM_ID,
    )
    expect(pda.equals(expected)).toBe(true)
  })
})
