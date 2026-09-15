import { PublicKey } from '@solana/web3.js'
import { readI128, readU128 } from './buffer-codec.js'

export const WHIRLPOOL_PROGRAM_ID = new PublicKey(
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
)

export const TICK_ARRAY_SIZE = 88
export const TICK_ARRAY_ACCOUNT_SIZE = 9988

/** Tick struct size in Whirlpool packed FixedTickArray layout. */
const TICK_SIZE = 113

export type DecodedTick = {
  tickIndex: number
  initialized: boolean
  liquidityNet: bigint
  liquidityGross: bigint
}

export function tickArrayStartIndex(
  tick: number,
  tickSpacing: number,
): number {
  const ticksInArray = tickSpacing * TICK_ARRAY_SIZE
  return Math.floor(tick / ticksInArray) * ticksInArray
}

export function deriveTickArrayPda(
  whirlpool: PublicKey,
  startTickIndex: number,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('tick_array'),
      whirlpool.toBuffer(),
      Buffer.from(String(startTickIndex)),
    ],
    WHIRLPOOL_PROGRAM_ID,
  )
  return pda
}

export function decodeTickArray(
  data: Buffer,
  startTickIndex: number,
  tickSpacing: number,
): DecodedTick[] {
  if (data.length < TICK_ARRAY_ACCOUNT_SIZE) {
    throw new Error(
      `TickArray too short: ${data.length} < ${TICK_ARRAY_ACCOUNT_SIZE}`,
    )
  }

  let o = 8 + 4
  const ticks: DecodedTick[] = []
  for (let i = 0; i < TICK_ARRAY_SIZE; i++) {
    const initialized = data[o] !== 0
    o += 1
    const liquidityNet = readI128(data, o)
    o += 16
    const liquidityGross = readU128(data, o)
    o += 16
    o += 16 + 16 + 48 // fee growth + rewards
    const consumed = 1 + 16 + 16 + 16 + 16 + 48
    if (consumed < TICK_SIZE) o += TICK_SIZE - consumed

    const tickIndex = startTickIndex + i * tickSpacing
    if (initialized) {
      ticks.push({
        tickIndex,
        initialized,
        liquidityNet,
        liquidityGross,
      })
    }
  }
  return ticks
}
