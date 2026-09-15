import { describe, expect, it } from 'vitest'
import {
  allocateFeeSegments,
  assertFeeSegmentsReconcile,
  captureYourFees,
  feeRateLp,
  feeSegFromVolume,
  rangesIntersect,
} from './fee-capture.js'

describe('fee capture (spec §5)', () => {
  it('fee_rate_LP strips protocol share', () => {
    expect(feeRateLp(0.0004, 0.1)).toBeCloseTo(0.00036, 12)
  })

  it('feeSegFromVolume applies fee_rate_LP to amount', () => {
    expect(feeSegFromVolume(1_000_000n, 0.0004)).toBe(400n)
  })

  it('allocateFeeSegments sums exactly to fee_amount', () => {
    const amounts = [100n, 250n, 150n]
    const feeAmount = 17n
    const fees = allocateFeeSegments(amounts, feeAmount)
    expect(fees.reduce((a, b) => a + b, 0n)).toBe(feeAmount)
    assertFeeSegmentsReconcile(
      fees.map((feeSeg) => ({ feeSeg })),
      feeAmount,
    )
  })

  it('captureYourFees only counts intersecting segments', () => {
    const yourL = 50n
    const segments = [
      {
        tickLo: -100,
        tickHi: 0,
        liquiditySeg: 100n,
        amountInSeg: 1000n,
        feeSeg: 10n,
      },
      {
        tickLo: 0,
        tickHi: 100,
        liquiditySeg: 200n,
        amountInSeg: 2000n,
        feeSeg: 20n,
      },
      {
        tickLo: 200,
        tickHi: 300,
        liquiditySeg: 100n,
        amountInSeg: 500n,
        feeSeg: 5n,
      },
    ]
    const fees = captureYourFees({
      yourLiquidity: yourL,
      segments,
      rangeTickLower: -50,
      rangeTickUpper: 50,
    })
    expect(fees).toBe(10n)
  })

  it('rangesIntersect is half-open style', () => {
    expect(rangesIntersect(0, 10, 10, 20)).toBe(false)
    expect(rangesIntersect(0, 10, 9, 20)).toBe(true)
  })
})
