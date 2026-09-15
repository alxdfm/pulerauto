import { describe, expect, it } from 'vitest'
import { amountsFromLiquidity, amount0Delta, amount1Delta, Q64 } from './position-amounts.js'
import {
  computePositionPnl,
  rebalanceOpenChild,
} from './position-pnl.js'
import {
  feeGrowthInside,
  pendingFeesFromGrowth,
  wrappingSubU128,
  U128_MOD,
} from './fee-growth-inside.js'
import {
  divergenceQuote,
  hodlValueQuote,
  isInRange,
  positionValueQuote,
} from './position-value.js'
import { widthFactor } from './primitives.js'
import { sqrtPriceX64AtTick } from './sqrt-price.js'

describe('position amounts (spec §2)', () => {
  it('in-range amounts match L·Δsqrt formulas', () => {
    const L = 1_000_000n
    const sqrtLower = sqrtPriceX64AtTick(-100)
    const sqrtUpper = sqrtPriceX64AtTick(100)
    const sqrtMid = sqrtPriceX64AtTick(0)
    const { amount0, amount1 } = amountsFromLiquidity(
      L,
      sqrtMid,
      sqrtLower,
      sqrtUpper,
    )
    expect(amount0).toBe(amount0Delta(sqrtMid, sqrtUpper, L))
    expect(amount1).toBe(amount1Delta(sqrtLower, sqrtMid, L))
    expect(amount0).toBeGreaterThan(0n)
    expect(amount1).toBeGreaterThan(0n)
  })

  it('below range is all token0', () => {
    const L = 500_000n
    const sqrtLower = sqrtPriceX64AtTick(100)
    const sqrtUpper = sqrtPriceX64AtTick(200)
    const sqrtCurrent = sqrtPriceX64AtTick(0)
    const { amount0, amount1 } = amountsFromLiquidity(
      L,
      sqrtCurrent,
      sqrtLower,
      sqrtUpper,
    )
    expect(amount1).toBe(0n)
    expect(amount0).toBe(amount0Delta(sqrtLower, sqrtUpper, L))
  })

  it('above range is all token1', () => {
    const L = 500_000n
    const sqrtLower = sqrtPriceX64AtTick(-200)
    const sqrtUpper = sqrtPriceX64AtTick(-100)
    const sqrtCurrent = sqrtPriceX64AtTick(0)
    const { amount0, amount1 } = amountsFromLiquidity(
      L,
      sqrtCurrent,
      sqrtLower,
      sqrtUpper,
    )
    expect(amount0).toBe(0n)
    expect(amount1).toBe(amount1Delta(sqrtLower, sqrtUpper, L))
  })

  it('Q64 constant is 2^64', () => {
    expect(Q64).toBe(2n ** 64n)
  })
})

describe('position value (spec §2)', () => {
  it('V(p) = L·W(p) in range', () => {
    const L = 1000
    const p = 150
    const r = 1.1
    const pa = p / r
    const pb = p * r
    expect(positionValueQuote(L, p, pa, pb)).toBeCloseTo(
      L * widthFactor(p, pa, pb),
      8,
    )
    expect(isInRange(p, pa, pb)).toBe(true)
  })

  it('divergence vs HODL', () => {
    const value = 100
    const hodl = hodlValueQuote(1, 50, 60) // 60 + 50 = 110
    expect(hodl).toBe(110)
    expect(divergenceQuote(value, hodl)).toBe(-10)
  })
})

describe('feeGrowthInside + pending (spec §5)', () => {
  it('wrappingSub wraps under zero', () => {
    expect(wrappingSubU128(1n, 2n)).toBe(U128_MOD - 1n)
  })

  it('pending fees use fee_growth_shift (Orca 64)', () => {
    const L = 1n << 64n
    const { fees0, fees1 } = pendingFeesFromGrowth({
      liquidity: L,
      feeGrowthInside0Now: 10n,
      feeGrowthInside1Now: 20n,
      feeGrowthInside0Last: 0n,
      feeGrowthInside1Last: 0n,
      feeGrowthShift: 64,
    })
    expect(fees0).toBe(10n)
    expect(fees1).toBe(20n)
  })

  it('feeGrowthInside when price inside range', () => {
    const inside = feeGrowthInside({
      feeGrowthGlobal0: 1000n,
      feeGrowthGlobal1: 2000n,
      tickLower: -10,
      tickUpper: 10,
      currentTick: 0,
      lower: { feeGrowthOutside0: 100n, feeGrowthOutside1: 200n },
      upper: { feeGrowthOutside0: 50n, feeGrowthOutside1: 80n },
    })
    // below = outside_lower, above = outside_upper
    expect(inside.feeGrowthInside0).toBe(1000n - 100n - 50n)
    expect(inside.feeGrowthInside1).toBe(2000n - 200n - 80n)
  })
})

describe('position P&L (spec §13)', () => {
  it('decomposes pnl_total and pnl_vs_hodl', () => {
    const pnl = computePositionPnl({
      valueNow: 110,
      valueEntry: 100,
      feesCollected: 2,
      feesPending: 1,
      rewards: 0,
      gas: 0.5,
      swapCosts: 0.5,
      funding: 0,
      hodlValueNow: 105,
    })
    // (110-100) + 2 + 1 - 0.5 - 0.5 = 12
    expect(pnl.pnlTotal).toBeCloseTo(12, 8)
    // 12 - (105-100) = 7
    expect(pnl.pnlVsHodl).toBeCloseTo(7, 8)
    expect(pnl.divergence).toBeCloseTo(5, 8)
  })

  it('rebalance opens child with fresh entry (no parent entry carry)', () => {
    const child = rebalanceOpenChild({
      parentPositionId: 1,
      newEntryPrice: 160,
      newEntryAmount0: 10n,
      newEntryAmount1: 20n,
      newEntryValueUsd: 1620,
      newLiquidity: 999n,
      tickLower: -20,
      tickUpper: 20,
    })
    expect(child.parentPositionId).toBe(1)
    expect(child.entryPrice).toBe(160)
    expect(child.entryAmount0).toBe(10n)
    expect(child.liquidity).toBe(999n)
  })
})
