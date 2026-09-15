import { fetchWhirlpoolTickSnapshot } from '../indexer/fetch-whirlpool-ticks.js'
import { reconstructActiveLiquidity } from '../math/liquidity.js'
import { runScript } from './run-script.js'

await runScript(async () => {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
  const poolAddr = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'

  const { snapshot, state, ticks } = await fetchWhirlpoolTickSnapshot({
    rpcUrl: rpc,
    poolAddress: poolAddr,
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
    L: state.liquidity.toString(),
    tick: state.tickCurrentIndex,
    tickCount: ticks.length,
    sumNet: recon.sumNet.toString(),
    reconstructed: recon.activeLiquidity.toString(),
    expected: state.liquidity.toString(),
    matches: recon.activeLiquidity === state.liquidity,
  })
})
