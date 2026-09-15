import { describe, expect, it } from 'vitest'
import { depthV2 } from './depth-v2.js'
import { edgeRatio } from './edge-ratio.js'
import { markoutBps, markoutLp } from './markout.js'
import {
  efficiencyRatio,
  erQuantile80,
  isTrendingRegime,
} from './regime.js'
import {
  sigmaImplied,
  volumeAnnualFromDaily,
} from './sigma-implied.js'

describe('Epic 4 signal math', () => {
  it('matches §4 SigmaImplied / EdgeRatio example', () => {
    const feeRateLp = 0.0016
    const volDaily = 40e6
    const d2 = 120e6
    const volAnnual = volumeAnnualFromDaily(volDaily)
    expect(volAnnual).toBeCloseTo(14.6e9, -6)
    const sigImpl = sigmaImplied({
      feeRateLp,
      volumeAnnualUsd: volAnnual,
      depthV2Usd: d2,
    })
    expect(sigImpl).toBeCloseTo(1.2479, 3)
    expect(edgeRatio(sigImpl, 0.75)).toBeCloseTo(1.66, 2)
  })

  it('D2 = 2 L sqrt(p)', () => {
    expect(depthV2(100, 4)).toBe(400)
  })

  it('markout sign: pool receives token0 then price up → LP gains', () => {
    const toxic = markoutLp([
      { amount0: -1, priceExec: 100, priceAfter: 101 },
    ])
    const friendly = markoutLp([
      { amount0: 1, priceExec: 100, priceAfter: 101 },
    ])
    expect(friendly).toBeGreaterThan(0)
    expect(toxic).toBeLessThan(0)
    expect(markoutBps(friendly, 1000)).toBeCloseTo(10, 5)
  })

  it('Kaufman ER and q80 regime', () => {
    const trending = efficiencyRatio([1, 1.1, 1.2, 1.3, 1.4])
    const choppy = efficiencyRatio([1, 1.2, 1.0, 1.2, 1.0])
    expect(trending).toBeGreaterThan(choppy)
    const q80 = erQuantile80([0.1, 0.2, 0.3, 0.4, 0.5])
    expect(q80).toBeCloseTo(0.42, 5)
    expect(isTrendingRegime(0.5, q80)).toBe(true)
    expect(isTrendingRegime(0.2, q80)).toBe(false)
  })
})
