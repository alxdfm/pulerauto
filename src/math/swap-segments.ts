/**
 * Decompose a swap into tick-interval segments (spec §5 / errata #4).
 * amount_in_seg weights by |Δsqrt| along the path; fees via allocateFeeSegments.
 */

import { allocateFeeSegments, type SwapSegment } from './fee-capture.js'
import { sqrtPriceX64AtTick } from './sqrt-price.js'

export type TickNetForPath = {
  tickIndex: number
  liquidityNet: bigint
}

export type BuildSwapSegmentsInput = {
  tickBefore: number
  tickAfter: number
  sqrtBefore: bigint
  sqrtAfter: bigint
  liquidityBefore: bigint
  amountIn: bigint
  feeAmount: bigint
  tickNets: TickNetForPath[]
  aToB: boolean
}

type RawSeg = {
  tickLo: number
  tickHi: number
  liquiditySeg: bigint
  sqrtStart: bigint
  sqrtEnd: bigint
}

function absDelta(a: bigint, b: bigint): bigint {
  return a >= b ? a - b : b - a
}

function crossedTicks(
  tickNets: TickNetForPath[],
  tickBefore: number,
  tickAfter: number,
): number[] {
  const byTick = new Map(tickNets.map((t) => [t.tickIndex, t.liquidityNet]))
  const lo = Math.min(tickBefore, tickAfter)
  const hi = Math.max(tickBefore, tickAfter)
  return [...byTick.keys()]
    .filter((t) => t > lo && t <= hi)
    .sort((a, b) => a - b)
}

function walkAToB(
  crossed: number[],
  byTick: Map<number, bigint>,
  input: BuildSwapSegmentsInput,
): RawSeg[] {
  const raw: RawSeg[] = []
  let L = input.liquidityBefore
  let cursorTick = input.tickBefore
  let cursorSqrt = input.sqrtBefore
  for (const tick of [...crossed].sort((a, b) => b - a)) {
    const boundarySqrt = sqrtPriceX64AtTick(tick)
    raw.push({
      tickLo: tick,
      tickHi: cursorTick + 1,
      liquiditySeg: L,
      sqrtStart: cursorSqrt,
      sqrtEnd: boundarySqrt,
    })
    L = L - (byTick.get(tick) ?? 0n)
    cursorTick = tick - 1
    cursorSqrt = boundarySqrt
  }
  raw.push({
    tickLo: input.tickAfter,
    tickHi: cursorTick + 1,
    liquiditySeg: L,
    sqrtStart: cursorSqrt,
    sqrtEnd: input.sqrtAfter,
  })
  return raw
}

function walkBToA(
  crossed: number[],
  byTick: Map<number, bigint>,
  input: BuildSwapSegmentsInput,
): RawSeg[] {
  const raw: RawSeg[] = []
  let L = input.liquidityBefore
  let cursorTick = input.tickBefore
  let cursorSqrt = input.sqrtBefore
  for (const tick of crossed) {
    const boundarySqrt = sqrtPriceX64AtTick(tick)
    raw.push({
      tickLo: cursorTick,
      tickHi: tick,
      liquiditySeg: L,
      sqrtStart: cursorSqrt,
      sqrtEnd: boundarySqrt,
    })
    L = L + (byTick.get(tick) ?? 0n)
    cursorTick = tick
    cursorSqrt = boundarySqrt
  }
  raw.push({
    tickLo: cursorTick,
    tickHi: input.tickAfter + 1,
    liquiditySeg: L,
    sqrtStart: cursorSqrt,
    sqrtEnd: input.sqrtAfter,
  })
  return raw
}

function allocateAmounts(
  raw: RawSeg[],
  amountIn: bigint,
): bigint[] {
  const weights = raw.map((s) => absDelta(s.sqrtEnd, s.sqrtStart))
  const weightSum = weights.reduce((a, b) => a + b, 0n)
  const amountInSegs: bigint[] = []
  let allocated = 0n
  for (let i = 0; i < raw.length; i++) {
    if (i === raw.length - 1) {
      amountInSegs.push(amountIn - allocated)
    } else if (weightSum === 0n) {
      amountInSegs.push(0n)
    } else {
      const part = (amountIn * weights[i]!) / weightSum
      amountInSegs.push(part)
      allocated += part
    }
  }
  return amountInSegs
}

export function buildSwapSegments(
  input: BuildSwapSegmentsInput,
): SwapSegment[] {
  if (input.tickBefore === input.tickAfter || input.sqrtBefore === input.sqrtAfter) {
    const fees = allocateFeeSegments([input.amountIn], input.feeAmount)
    return [
      {
        tickLo: Math.min(input.tickBefore, input.tickAfter),
        tickHi: Math.max(input.tickBefore, input.tickAfter) + 1,
        liquiditySeg: input.liquidityBefore,
        amountInSeg: input.amountIn,
        feeSeg: fees[0]!,
      },
    ]
  }

  const byTick = new Map(
    input.tickNets.map((t) => [t.tickIndex, t.liquidityNet]),
  )
  const crossed = crossedTicks(
    input.tickNets,
    input.tickBefore,
    input.tickAfter,
  )
  const raw = input.aToB
    ? walkAToB(crossed, byTick, input)
    : walkBToA(crossed, byTick, input)
  const amountInSegs = allocateAmounts(raw, input.amountIn)
  const fees = allocateFeeSegments(amountInSegs, input.feeAmount)

  return raw.map((s, i) => ({
    tickLo: Math.min(s.tickLo, s.tickHi),
    tickHi: Math.max(s.tickLo, s.tickHi),
    liquiditySeg: s.liquiditySeg < 0n ? 0n : s.liquiditySeg,
    amountInSeg: amountInSegs[i]!,
    feeSeg: fees[i]!,
  }))
}
