import { describe, expect, it } from 'vitest'
import { computePositionSnapshot } from './position-snapshot.js'
import { sqrtPriceX64AtTick } from '../math/sqrt-price.js'

describe('computePositionSnapshot', () => {
  it('marks in-range and computes HODL divergence', () => {
    const tickLower = -100
    const tickUpper = 100
    const currentTick = 0
    const L = 1_000_000_000n
    const snap = computePositionSnapshot({
      positionId: 1,
      tickLower,
      tickUpper,
      liquidity: L,
      entryPrice: 1,
      entryAmount0: 0.5,
      entryAmount1: 0.5,
      entryValueUsd: 1,
      feesCollectedUsd: 0.01,
      costsUsd: 0,
      rewardsUsd: 0,
      fundingUsd: 0,
      price: 1,
      decimals0: 9,
      decimals1: 6,
      sqrtPrice: sqrtPriceX64AtTick(currentTick),
      currentTick,
    })
    expect(snap.inRange).toBe(true)
    expect(snap.valueUsd).toBeGreaterThan(0)
    expect(snap.pnlVsHodlUsd).toBeDefined()
  })

  it('out of range below lower tick', () => {
    const snap = computePositionSnapshot({
      positionId: 2,
      tickLower: 100,
      tickUpper: 200,
      liquidity: 1_000_000n,
      entryPrice: 1.01,
      entryAmount0: 1,
      entryAmount1: 0,
      entryValueUsd: 1.01,
      feesCollectedUsd: 0,
      costsUsd: 0,
      rewardsUsd: 0,
      fundingUsd: 0,
      price: 1,
      decimals0: 9,
      decimals1: 6,
      sqrtPrice: sqrtPriceX64AtTick(0),
      currentTick: 0,
    })
    expect(snap.inRange).toBe(false)
    expect(snap.deltaToken0).toBeGreaterThan(0)
  })
})
