import { Connection, PublicKey } from '@solana/web3.js'
import { reconstructActiveLiquidity } from '../math/liquidity.js'
import {
  decodeDynamicTickArray,
  isDynamicTickArrayAccount,
} from './dynamic-tick-array.js'
import {
  decodeTickArray,
  deriveTickArrayPda,
  tickArrayStartIndex,
  TICK_ARRAY_ACCOUNT_SIZE,
  TICK_ARRAY_SIZE,
  WHIRLPOOL_PROGRAM_ID,
  type DecodedTick,
} from './tick-array.js'
import { decodeWhirlpool, type WhirlpoolState } from './whirlpool-decode.js'

const FIXED_TICK_ARRAY_DISCRIMINATOR = Buffer.from([
  0x45, 0x61, 0xbd, 0xbe, 0x6e, 0x07, 0x42, 0xbb,
])

export type TickArrayAccountSnapshot = {
  pubkey: string
  dataBase64: string
}

export type WhirlpoolTickSnapshot = {
  poolAddress: string
  slot: number
  tickSpacing: number
  tickCurrentIndex: number
  liquidity: string
  poolDataBase64: string
  tickArrays: TickArrayAccountSnapshot[]
}

function isLikelyGpaRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /getProgramAccounts|rejected|403|429|Forbidden|Indexed requests|too large|method not available/i.test(
    msg,
  )
}

function isFixedTickArrayAccount(data: Buffer): boolean {
  return (
    data.length === TICK_ARRAY_ACCOUNT_SIZE &&
    data.subarray(0, 8).equals(FIXED_TICK_ARRAY_DISCRIMINATOR)
  )
}

export function decodeTicksFromAccountData(
  data: Buffer,
  tickSpacing: number,
): DecodedTick[] {
  if (isDynamicTickArrayAccount(data)) {
    return decodeDynamicTickArray(data, tickSpacing)
  }
  if (isFixedTickArrayAccount(data)) {
    return decodeTickArray(data, data.readInt32LE(8), tickSpacing)
  }
  throw new Error(`Unknown tick array account (len=${data.length})`)
}

function mergeTicks(arrays: DecodedTick[][]): DecodedTick[] {
  const byIndex = new Map<number, DecodedTick>()
  for (const ticks of arrays) {
    for (const t of ticks) {
      const prev = byIndex.get(t.tickIndex)
      if (
        prev &&
        (prev.liquidityNet !== t.liquidityNet ||
          prev.liquidityGross !== t.liquidityGross)
      ) {
        throw new Error(`Conflicting tick data at index ${t.tickIndex}`)
      }
      byIndex.set(t.tickIndex, t)
    }
  }
  return [...byIndex.values()].sort((a, b) => a.tickIndex - b.tickIndex)
}

function rebuildFromArrays(
  poolData: Buffer,
  arrays: { pubkey: PublicKey; data: Buffer }[],
  poolAddress: string,
  slot: number,
): {
  snapshot: WhirlpoolTickSnapshot
  state: WhirlpoolState
  ticks: DecodedTick[]
  matches: boolean
} {
  const state = decodeWhirlpool(poolData)
  const decodedArrays: DecodedTick[][] = []
  const tickArrays: TickArrayAccountSnapshot[] = []
  for (const a of arrays) {
    decodedArrays.push(decodeTicksFromAccountData(a.data, state.tickSpacing))
    tickArrays.push({
      pubkey: a.pubkey.toBase58(),
      dataBase64: a.data.toString('base64'),
    })
  }
  const ticks = mergeTicks(decodedArrays)
  const recon = reconstructActiveLiquidity(
    ticks.map((t) => ({
      tickIndex: t.tickIndex,
      liquidityNet: t.liquidityNet,
      liquidityGross: t.liquidityGross,
    })),
    state.tickCurrentIndex,
  )
  return {
    state,
    ticks,
    matches: recon.sumNet === 0n && recon.activeLiquidity === state.liquidity,
    snapshot: {
      poolAddress,
      slot,
      tickSpacing: state.tickSpacing,
      tickCurrentIndex: state.tickCurrentIndex,
      liquidity: state.liquidity.toString(),
      poolDataBase64: poolData.toString('base64'),
      tickArrays,
    },
  }
}

async function fetchViaGpa(
  connection: Connection,
  whirlpool: PublicKey,
  poolAddress: string,
): Promise<{
  snapshot: WhirlpoolTickSnapshot
  state: WhirlpoolState
  ticks: DecodedTick[]
  matches: boolean
}> {
  const [poolResult, fixed, dynamicCandidates] = await Promise.all([
    connection.getAccountInfoAndContext(whirlpool, 'confirmed'),
    connection.getProgramAccounts(WHIRLPOOL_PROGRAM_ID, {
      filters: [
        { dataSize: TICK_ARRAY_ACCOUNT_SIZE },
        {
          memcmp: {
            offset: TICK_ARRAY_ACCOUNT_SIZE - 32,
            bytes: whirlpool.toBase58(),
          },
        },
      ],
    }),
    connection.getProgramAccounts(WHIRLPOOL_PROGRAM_ID, {
      filters: [{ memcmp: { offset: 12, bytes: whirlpool.toBase58() } }],
    }),
  ])

  if (!poolResult.value) {
    throw new Error(`Whirlpool account not found: ${poolAddress}`)
  }

  const arrays: { pubkey: PublicKey; data: Buffer }[] = []
  for (const a of fixed) {
    const data = a.account.data as Buffer
    if (isFixedTickArrayAccount(data)) {
      arrays.push({ pubkey: a.pubkey, data })
    }
  }
  for (const a of dynamicCandidates) {
    const data = a.account.data as Buffer
    if (isDynamicTickArrayAccount(data)) {
      arrays.push({ pubkey: a.pubkey, data })
    }
  }

  return rebuildFromArrays(
    poolResult.value.data as Buffer,
    arrays,
    poolAddress,
    poolResult.context.slot,
  )
}

async function fetchViaNeighbors(
  connection: Connection,
  whirlpool: PublicKey,
  poolAddress: string,
  neighbors: number,
): Promise<{
  snapshot: WhirlpoolTickSnapshot
  state: WhirlpoolState
  ticks: DecodedTick[]
  matches: boolean
}> {
  const poolResult = await connection.getAccountInfoAndContext(
    whirlpool,
    'confirmed',
  )
  if (!poolResult.value) {
    throw new Error(`Whirlpool account not found: ${poolAddress}`)
  }
  const state = decodeWhirlpool(poolResult.value.data as Buffer)
  const center = tickArrayStartIndex(state.tickCurrentIndex, state.tickSpacing)
  const span = state.tickSpacing * TICK_ARRAY_SIZE
  const pdas: PublicKey[] = []
  for (let n = -neighbors; n <= neighbors; n++) {
    pdas.push(deriveTickArrayPda(whirlpool, center + n * span))
  }
  const infos = await connection.getMultipleAccountsInfo(pdas, 'confirmed')
  const arrays: { pubkey: PublicKey; data: Buffer }[] = []
  for (let i = 0; i < infos.length; i++) {
    const info = infos[i]
    if (!info) continue
    const data = info.data as Buffer
    if (isFixedTickArrayAccount(data) || isDynamicTickArrayAccount(data)) {
      arrays.push({ pubkey: pdas[i]!, data })
    }
  }
  return rebuildFromArrays(
    poolResult.value.data as Buffer,
    arrays,
    poolAddress,
    poolResult.context.slot,
  )
}

/**
 * Fetch pool + fixed/dynamic tick arrays.
 * Retries until reconstructed L matches pool liquidity (slot-consistency gate).
 */
export async function fetchWhirlpoolTickSnapshot(opts: {
  rpcUrl: string
  poolAddress: string
  neighbors?: number
  maxSlotRetries?: number
}): Promise<{
  snapshot: WhirlpoolTickSnapshot
  state: WhirlpoolState
  ticks: DecodedTick[]
}> {
  const connection = new Connection(opts.rpcUrl, 'confirmed')
  const whirlpool = new PublicKey(opts.poolAddress)
  const maxRetries = opts.maxSlotRetries ?? 8

  let useNeighbors = false
  let lastError: unknown

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = useNeighbors
        ? await fetchViaNeighbors(
            connection,
            whirlpool,
            opts.poolAddress,
            opts.neighbors ?? 40,
          )
        : await fetchViaGpa(connection, whirlpool, opts.poolAddress)

      if (result.matches) {
        return {
          snapshot: result.snapshot,
          state: result.state,
          ticks: result.ticks,
        }
      }
      lastError = new Error(
        `L reconstruction mismatch (attempt ${attempt + 1}/${maxRetries})`,
      )
    } catch (err) {
      if (!useNeighbors && isLikelyGpaRejection(err)) {
        console.warn(
          'getProgramAccounts unavailable; falling back to neighbor tick arrays',
          err instanceof Error ? err.message : err,
        )
        useNeighbors = true
        lastError = err
        continue
      }
      lastError = err
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to fetch consistent whirlpool tick snapshot')
}

/** Convenience: ticks only (live indexer path). */
export async function fetchWhirlpoolTicks(opts: {
  rpcUrl: string
  poolAddress: string
  neighbors?: number
}): Promise<DecodedTick[]> {
  const { ticks } = await fetchWhirlpoolTickSnapshot({
    rpcUrl: opts.rpcUrl,
    poolAddress: opts.poolAddress,
    neighbors: opts.neighbors,
  })
  return ticks
}
