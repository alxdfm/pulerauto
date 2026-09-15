import { Connection, PublicKey } from '@solana/web3.js'
import {
  decodeTickArray,
  deriveTickArrayPda,
  tickArrayStartIndex,
  TICK_ARRAY_SIZE,
  WHIRLPOOL_PROGRAM_ID,
} from '../indexer/tick-array.js'
import { reconstructActiveLiquidity } from '../math/liquidity.js'
import { decodeWhirlpool } from '../indexer/whirlpool-decode.js'
import { runScript } from './run-script.js'

await runScript(async () => {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
  const poolAddr = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'
  const connection = new Connection(rpc, 'confirmed')
  const pool = new PublicKey(poolAddr)

  const info = await connection.getAccountInfo(pool)
  if (!info) throw new Error('no pool')
  const state = decodeWhirlpool(info.data as Buffer)
  console.log('L', state.liquidity.toString(), 'tick', state.tickCurrentIndex)

  const start = tickArrayStartIndex(state.tickCurrentIndex, state.tickSpacing)
  const samplePda = deriveTickArrayPda(pool, start)
  const sample = await connection.getAccountInfo(samplePda)
  console.log('tick array size', sample?.data.length)

  if (!sample) throw new Error('no sample tick array')

  let datas: { start: number; data: Buffer }[] = []
  try {
    const accounts = await connection.getProgramAccounts(WHIRLPOOL_PROGRAM_ID, {
      filters: [
        { dataSize: sample.data.length },
        {
          memcmp: {
            offset: sample.data.length - 32,
            bytes: pool.toBase58(),
          },
        },
      ],
    })
    console.log('gPA arrays', accounts.length)
    for (const a of accounts) {
      const startTick = a.account.data.readInt32LE(8)
      datas.push({ start: startTick, data: a.account.data as Buffer })
    }
  } catch (e) {
    console.error('gPA failed', (e as Error).message)
    const span = state.tickSpacing * TICK_ARRAY_SIZE
    for (let n = -40; n <= 40; n++) {
      const s = start + n * span
      const pda = deriveTickArrayPda(pool, s)
      const ai = await connection.getAccountInfo(pda)
      if (ai) datas.push({ start: s, data: ai.data as Buffer })
    }
    console.log('neighbor arrays', datas.length)
  }

  const ticks = datas.flatMap((d) =>
    decodeTickArray(d.data, d.start, state.tickSpacing),
  )
  const recon = reconstructActiveLiquidity(
    ticks.map((t) => ({
      tickIndex: t.tickIndex,
      liquidityNet: t.liquidityNet,
      liquidityGross: t.liquidityGross,
    })),
    state.tickCurrentIndex,
  )
  console.log({
    tickCount: ticks.length,
    sumNet: recon.sumNet.toString(),
    reconstructed: recon.activeLiquidity.toString(),
    expected: state.liquidity.toString(),
    matches: recon.activeLiquidity === state.liquidity,
  })
})
