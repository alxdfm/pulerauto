import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  decodeTicksFromAccountData,
  type WhirlpoolTickSnapshot,
} from './fetch-whirlpool-ticks.js'
import { reconstructActiveLiquidity } from '../math/liquidity.js'
import { decodeWhirlpool } from './whirlpool-decode.js'

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/orca-sol-usdc-tick-snapshot.json',
)

describe('slot-consistent tick snapshot fixture', () => {
  it('reconstructs L exactly from fixed + dynamic tick arrays', () => {
    let raw: string
    try {
      raw = readFileSync(fixturePath, 'utf8')
    } catch {
      // Capture with: tsx src/scripts/capture-tick-fixture.ts
      expect.fail(
        `Missing fixture at ${fixturePath}; run capture-tick-fixture.ts`,
      )
    }

    const snapshot = JSON.parse(raw) as WhirlpoolTickSnapshot
    const poolData = Buffer.from(snapshot.poolDataBase64, 'base64')
    const state = decodeWhirlpool(poolData)
    expect(state.liquidity.toString()).toBe(snapshot.liquidity)
    expect(state.tickCurrentIndex).toBe(snapshot.tickCurrentIndex)

    const arrays = snapshot.tickArrays.map((a) =>
      decodeTicksFromAccountData(
        Buffer.from(a.dataBase64, 'base64'),
        snapshot.tickSpacing,
      ),
    )
    const byIndex = new Map<
      number,
      { tickIndex: number; liquidityNet: bigint; liquidityGross: bigint }
    >()
    for (const ticks of arrays) {
      for (const t of ticks) {
        byIndex.set(t.tickIndex, {
          tickIndex: t.tickIndex,
          liquidityNet: t.liquidityNet,
          liquidityGross: t.liquidityGross,
        })
      }
    }
    const ticks = [...byIndex.values()]
    const recon = reconstructActiveLiquidity(ticks, state.tickCurrentIndex)
    expect(recon.sumNet).toBe(0n)
    expect(recon.activeLiquidity).toBe(state.liquidity)
  })
})
