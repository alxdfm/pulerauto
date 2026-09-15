/**
 * Validate markout sign against known fixture (spec §7).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { markoutBps, markoutLp } from '../math/markout.js'
import { runScript } from './run-script.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

await runScript(async () => {
  const fixturePath = path.join(root, 'fixtures/markout-sign-cases.json')
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    cases: Array<{
      name: string
      samples: Array<{
        amount0: number
        priceExec: number
        priceAfter: number
      }>
      volume: number
      expectSign: 'positive' | 'negative' | 'zero'
      expectBpsApprox?: number
    }>
  }

  let failed = 0
  for (const c of fixture.cases) {
    const m = markoutLp(c.samples)
    const bps = markoutBps(m, c.volume)
    const sign =
      m > 0 ? 'positive' : m < 0 ? 'negative' : 'zero'
    const ok = sign === c.expectSign
    if (!ok) failed += 1
    console.log({
      name: c.name,
      markoutLp: m,
      markoutBps: bps,
      expectSign: c.expectSign,
      ok,
    })
    if (
      c.expectBpsApprox !== undefined &&
      Math.abs(bps - c.expectBpsApprox) > 0.01
    ) {
      failed += 1
    }
  }
  if (failed > 0) process.exitCode = 1
})
