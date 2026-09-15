/**
 * Manual decode of Orca Whirlpool Position account (no SDK).
 * Layout: programs/whirlpool/src/state/position.rs — Position::LEN = 216.
 * Discriminator: sha256("account:Position")[0..8] = aabc8fe47a40f7d0
 */

import { PublicKey } from '@solana/web3.js'
import { readU128, readU64 } from './buffer-codec.js'
import { WHIRLPOOL_PROGRAM_ID } from './tick-array.js'

/** echo -n account:Position | sha256sum | cut -c 1-16 → aabc8fe47a40f7d0 */
export const POSITION_DISCRIMINATOR = Buffer.from([
  0xaa, 0xbc, 0x8f, 0xe4, 0x7a, 0x40, 0xf7, 0xd0,
])

export const POSITION_ACCOUNT_LEN = 216

export type PositionRewardInfo = {
  growthInsideCheckpoint: bigint
  amountOwed: bigint
}

export type DecodedPosition = {
  whirlpool: string
  positionMint: string
  liquidity: bigint
  tickLowerIndex: number
  tickUpperIndex: number
  feeGrowthCheckpointA: bigint
  feeOwedA: bigint
  feeGrowthCheckpointB: bigint
  feeOwedB: bigint
  rewardInfos: PositionRewardInfo[]
}

export function derivePositionPda(positionMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), positionMint.toBuffer()],
    WHIRLPOOL_PROGRAM_ID,
  )
  return pda
}

export function decodePosition(data: Buffer): DecodedPosition {
  if (data.length < POSITION_ACCOUNT_LEN) {
    throw new Error(
      `Position account too short: ${data.length} < ${POSITION_ACCOUNT_LEN}`,
    )
  }
  if (!data.subarray(0, 8).equals(POSITION_DISCRIMINATOR)) {
    throw new Error('Position discriminator mismatch')
  }

  let o = 8
  const whirlpool = new PublicKey(data.subarray(o, o + 32)).toBase58()
  o += 32
  const positionMint = new PublicKey(data.subarray(o, o + 32)).toBase58()
  o += 32
  const liquidity = readU128(data, o)
  o += 16
  const tickLowerIndex = data.readInt32LE(o)
  o += 4
  const tickUpperIndex = data.readInt32LE(o)
  o += 4
  const feeGrowthCheckpointA = readU128(data, o)
  o += 16
  const feeOwedA = readU64(data, o)
  o += 8
  const feeGrowthCheckpointB = readU128(data, o)
  o += 16
  const feeOwedB = readU64(data, o)
  o += 8

  const rewardInfos: PositionRewardInfo[] = []
  for (let i = 0; i < 3; i++) {
    const growthInsideCheckpoint = readU128(data, o)
    o += 16
    const amountOwed = readU64(data, o)
    o += 8
    rewardInfos.push({ growthInsideCheckpoint, amountOwed })
  }

  return {
    whirlpool,
    positionMint,
    liquidity,
    tickLowerIndex,
    tickUpperIndex,
    feeGrowthCheckpointA,
    feeOwedA,
    feeGrowthCheckpointB,
    feeOwedB,
    rewardInfos,
  }
}
