/**
 * P&L decomposition (spec §13).
 * Rebalance must close the old baseline and open a new position row — callers
 * never carry entry_price across a rebalance.
 */

export type PositionPnlInput = {
  /** Current position mark value (quote/USD presentation). */
  valueNow: number
  /** Frozen entry value at open. */
  valueEntry: number
  feesCollected: number
  feesPending: number
  rewards: number
  gas: number
  swapCosts: number
  /** Funding with sign: received is positive carry (negate paid). */
  funding: number
  /** HODL value of entry amounts at current price. */
  hodlValueNow: number
}

export type PositionPnl = {
  pnlTotal: number
  pnlVsHodl: number
  divergence: number
}

/**
 * PnL_total = (V_atual − V_entrada) + fees_coletadas + fees_pendentes
 *            + rewards − gas − custos_swap ± funding
 * PnL_vs_HODL = PnL_total − (V_hodl(p) − V_entrada)
 */
export function computePositionPnl(input: PositionPnlInput): PositionPnl {
  const divergence = input.valueNow - input.hodlValueNow
  const pnlTotal =
    input.valueNow -
    input.valueEntry +
    input.feesCollected +
    input.feesPending +
    input.rewards -
    input.gas -
    input.swapCosts +
    input.funding
  const pnlVsHodl = pnlTotal - (input.hodlValueNow - input.valueEntry)
  return { pnlTotal, pnlVsHodl, divergence }
}

/**
 * Rebalance accounting: close parent, open child with fresh entry baseline.
 * Returns the child entry fields; does not mutate parent.
 */
export function rebalanceOpenChild(opts: {
  parentPositionId: number
  newEntryPrice: number
  newEntryAmount0: bigint
  newEntryAmount1: bigint
  newEntryValueUsd: number
  newLiquidity: bigint
  tickLower: number
  tickUpper: number
}): {
  parentPositionId: number
  entryPrice: number
  entryAmount0: bigint
  entryAmount1: bigint
  entryValueUsd: number
  liquidity: bigint
  tickLower: number
  tickUpper: number
} {
  return {
    parentPositionId: opts.parentPositionId,
    entryPrice: opts.newEntryPrice,
    entryAmount0: opts.newEntryAmount0,
    entryAmount1: opts.newEntryAmount1,
    entryValueUsd: opts.newEntryValueUsd,
    liquidity: opts.newLiquidity,
    tickLower: opts.tickLower,
    tickUpper: opts.tickUpper,
  }
}
