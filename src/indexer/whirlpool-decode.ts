import { PublicKey } from '@solana/web3.js'
import { readU128 } from './buffer-codec.js'

export type WhirlpoolState = {
  tickSpacing: number
  feeRate: number
  protocolFeeRate: number
  liquidity: bigint
  sqrtPrice: bigint
  tickCurrentIndex: number
  tokenMintA: string
  tokenMintB: string
  feeGrowthGlobalA: bigint
  feeGrowthGlobalB: bigint
}

/** Minimum bytes needed to read fields we decode (through fee_growth_global_b). */
const WHIRLPOOL_MIN_LENGTH = 8 + 32 + 1 + 2 + 2 + 2 + 2 + 16 + 16 + 4 + 8 + 8 + 32 + 32 + 16 + 32 + 32 + 16

/** Decode Orca Whirlpool account (8-byte Anchor discriminator + state). */
export function decodeWhirlpool(data: Buffer): WhirlpoolState {
  if (data.length < WHIRLPOOL_MIN_LENGTH) {
    throw new Error(
      `Whirlpool account too short: ${data.length} < ${WHIRLPOOL_MIN_LENGTH}`,
    )
  }

  let o = 8
  o += 32 // whirlpools_config
  o += 1 // bump
  const tickSpacing = data.readUInt16LE(o)
  o += 2
  o += 2 // tick_spacing_seed
  const feeRate = data.readUInt16LE(o)
  o += 2
  const protocolFeeRate = data.readUInt16LE(o)
  o += 2
  const liquidity = readU128(data, o)
  o += 16
  const sqrtPrice = readU128(data, o)
  o += 16
  const tickCurrentIndex = data.readInt32LE(o)
  o += 4
  o += 8 // protocol_fee_owed_a
  o += 8 // protocol_fee_owed_b
  const tokenMintA = new PublicKey(data.subarray(o, o + 32)).toBase58()
  o += 32
  o += 32 // token_vault_a
  const feeGrowthGlobalA = readU128(data, o)
  o += 16
  const tokenMintB = new PublicKey(data.subarray(o, o + 32)).toBase58()
  o += 32
  o += 32 // token_vault_b
  const feeGrowthGlobalB = readU128(data, o)

  return {
    tickSpacing,
    feeRate,
    protocolFeeRate,
    liquidity,
    sqrtPrice,
    tickCurrentIndex,
    tokenMintA,
    tokenMintB,
    feeGrowthGlobalA,
    feeGrowthGlobalB,
  }
}
