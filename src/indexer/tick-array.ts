import { Connection, PublicKey } from '@solana/web3.js'
import { readI128, readU128 } from './buffer-codec.js'

export const WHIRLPOOL_PROGRAM_ID = new PublicKey(
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
)

export const TICK_ARRAY_SIZE = 88
export const TICK_ARRAY_ACCOUNT_SIZE = 9988

/** Tick struct size in Whirlpool packed layout. */
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

function isLikelyGpaRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /getProgramAccounts|rejected|403|429|too large|method not available/i.test(
    msg,
  )
}

async function fetchTickArraysViaGpa(
  connection: Connection,
  whirlpool: PublicKey,
  tickSpacing: number,
): Promise<DecodedTick[]> {
  const accounts = await connection.getProgramAccounts(WHIRLPOOL_PROGRAM_ID, {
    filters: [
      { dataSize: TICK_ARRAY_ACCOUNT_SIZE },
      {
        memcmp: {
          offset: TICK_ARRAY_ACCOUNT_SIZE - 32,
          bytes: whirlpool.toBase58(),
        },
      },
    ],
  })

  const out: DecodedTick[] = []
  for (const a of accounts) {
    const data = a.account.data as Buffer
    const startTick = data.readInt32LE(8)
    out.push(...decodeTickArray(data, startTick, tickSpacing))
  }
  return out
}

async function fetchTickArraysViaNeighbors(
  connection: Connection,
  whirlpool: PublicKey,
  currentTick: number,
  tickSpacing: number,
  neighbors: number,
): Promise<DecodedTick[]> {
  const center = tickArrayStartIndex(currentTick, tickSpacing)
  const span = tickSpacing * TICK_ARRAY_SIZE
  const starts: number[] = []
  for (let n = -neighbors; n <= neighbors; n++) {
    starts.push(center + n * span)
  }
  const pdas = starts.map((s) => deriveTickArrayPda(whirlpool, s))
  const infos = await connection.getMultipleAccountsInfo(pdas, 'confirmed')
  const out: DecodedTick[] = []
  for (let i = 0; i < infos.length; i++) {
    const info = infos[i]
    if (!info) continue
    out.push(
      ...decodeTickArray(info.data as Buffer, starts[i]!, tickSpacing),
    )
  }
  return out
}

/**
 * Fetch tick arrays for a whirlpool.
 * Prefers getProgramAccounts (all arrays); falls back to neighbor PDAs only when gPA is rejected.
 */
export async function fetchWhirlpoolTicks(opts: {
  rpcUrl: string
  poolAddress: string
  currentTick: number
  tickSpacing: number
  neighbors?: number
}): Promise<DecodedTick[]> {
  const connection = new Connection(opts.rpcUrl, 'confirmed')
  const whirlpool = new PublicKey(opts.poolAddress)

  try {
    return await fetchTickArraysViaGpa(
      connection,
      whirlpool,
      opts.tickSpacing,
    )
  } catch (err) {
    if (!isLikelyGpaRejection(err)) {
      throw err
    }
    console.warn(
      'getProgramAccounts unavailable; falling back to neighbor tick arrays',
      err instanceof Error ? err.message : err,
    )
    return fetchTickArraysViaNeighbors(
      connection,
      whirlpool,
      opts.currentTick,
      opts.tickSpacing,
      opts.neighbors ?? 20,
    )
  }
}
