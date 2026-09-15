import { describe, expect, it } from 'vitest'
import { assertFeeSegmentsReconcile } from './fee-capture.js'
import { buildSwapSegments } from './swap-segments.js'
import { sqrtPriceX64AtTick, tickFromSqrtPriceX64 } from './sqrt-price.js'

describe('sqrt-price tick round-trip (mid-range)', () => {
  it('round-trips near SOL/USDC ticks', () => {
    for (const tick of [-23080, -23000, -100, 0, 100]) {
      const sqrt = sqrtPriceX64AtTick(tick)
      expect(tickFromSqrtPriceX64(sqrt)).toBe(tick)
    }
  })
})

describe('buildSwapSegments', () => {
  it('single-tick swap: one segment, fee reconciles', () => {
    const fee = 1000n
    const amountIn = 1_000_000n
    const segs = buildSwapSegments({
      tickBefore: -100,
      tickAfter: -100,
      sqrtBefore: sqrtPriceX64AtTick(-100),
      sqrtAfter: sqrtPriceX64AtTick(-100) - 10n,
      liquidityBefore: 50_000n,
      amountIn,
      feeAmount: fee,
      tickNets: [],
      aToB: true,
    })
    expect(segs).toHaveLength(1)
    expect(segs[0]!.amountInSeg).toBe(amountIn)
    expect(segs[0]!.liquiditySeg).toBe(50_000n)
    assertFeeSegmentsReconcile(segs, fee)
  })

  it('multi-tick a_to_b: fees sum to parent', () => {
    const tickBefore = 20
    const tickAfter = 0
    const fee = 999n
    const amountIn = 10_000n
    const segs = buildSwapSegments({
      tickBefore,
      tickAfter,
      sqrtBefore: sqrtPriceX64AtTick(tickBefore),
      sqrtAfter: sqrtPriceX64AtTick(tickAfter),
      liquidityBefore: 1_000_000n,
      amountIn,
      feeAmount: fee,
      tickNets: [
        { tickIndex: 10, liquidityNet: -200_000n },
        { tickIndex: 0, liquidityNet: -800_000n },
      ],
      aToB: true,
    })
    expect(segs.length).toBeGreaterThan(1)
    assertFeeSegmentsReconcile(segs, fee)
    expect(segs.reduce((a, s) => a + s.amountInSeg, 0n)).toBe(amountIn)
  })

  it('multi-tick b_to_a: fees sum to parent', () => {
    const fee = 50n
    const amountIn = 5000n
    const segs = buildSwapSegments({
      tickBefore: 0,
      tickAfter: 20,
      sqrtBefore: sqrtPriceX64AtTick(0),
      sqrtAfter: sqrtPriceX64AtTick(20),
      liquidityBefore: 800_000n,
      amountIn,
      feeAmount: fee,
      tickNets: [{ tickIndex: 10, liquidityNet: 200_000n }],
      aToB: false,
    })
    expect(segs.length).toBeGreaterThan(1)
    assertFeeSegmentsReconcile(segs, fee)
  })
})
