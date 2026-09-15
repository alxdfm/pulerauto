import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchWhirlpoolTickSnapshot } from '../indexer/fetch-whirlpool-ticks.js'
import { reconstructActiveLiquidity } from '../math/liquidity.js'
import { runScript } from './run-script.js'

const POOL =
  process.env.ORCA_SOL_USDC_POOL ??
  'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'

const here = path.dirname(fileURLToPath(import.meta.url))
const defaultOut = path.resolve(
  here,
  '../../fixtures/orca-sol-usdc-tick-snapshot.json',
)

await runScript(async () => {
  const rpcUrl = process.env.SOLANA_RPC_URL
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL required')

  const outPath = process.argv[2] ?? defaultOut
  const { snapshot, state, ticks } = await fetchWhirlpoolTickSnapshot({
    rpcUrl,
    poolAddress: POOL,
  })

  const recon = reconstructActiveLiquidity(
    ticks.map((t) => ({
      tickIndex: t.tickIndex,
      liquidityNet: t.liquidityNet,
      liquidityGross: t.liquidityGross,
    })),
    state.tickCurrentIndex,
  )

  console.log({
    slot: snapshot.slot,
    arrays: snapshot.tickArrays.length,
    tickCount: ticks.length,
    sumNet: recon.sumNet.toString(),
    reconstructed: recon.activeLiquidity.toString(),
    expected: state.liquidity.toString(),
    matches: recon.activeLiquidity === state.liquidity,
  })

  if (recon.sumNet !== 0n || recon.activeLiquidity !== state.liquidity) {
    throw new Error('Refusing to write fixture: L reconstruction mismatch')
  }

  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(snapshot)}\n`, 'utf8')
  console.log('wrote', outPath)
})
