import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { computePositionPnl } from '../math/position-pnl.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('synthetic rebalance P&L fixture', () => {
  it('matches oracle through parent close + child open', () => {
    const raw = JSON.parse(
      readFileSync(
        path.join(root, 'fixtures/synthetic-rebalance-pnl.json'),
        'utf8',
      ),
    ) as {
      parent: Record<string, number>
      child: Record<string, number>
      expected: Record<string, number>
    }

    const parent = computePositionPnl({
      valueNow: raw.parent.valueAtClose,
      valueEntry: raw.parent.entryValueUsd,
      feesCollected: raw.parent.feesCollected,
      feesPending: raw.parent.feesPending,
      rewards: raw.parent.rewards,
      gas: raw.parent.gas,
      swapCosts: raw.parent.swapCosts,
      funding: raw.parent.funding,
      hodlValueNow: raw.parent.hodlAtClose,
    })
    expect(parent.pnlTotal).toBeCloseTo(raw.expected.parentPnlTotal, 8)
    expect(parent.pnlVsHodl).toBeCloseTo(raw.expected.parentPnlVsHodl, 8)

    const child = computePositionPnl({
      valueNow: raw.child.valueNow,
      valueEntry: raw.child.entryValueUsd,
      feesCollected: raw.child.feesCollected,
      feesPending: raw.child.feesPending,
      rewards: raw.child.rewards,
      gas: raw.child.gas,
      swapCosts: raw.child.swapCosts,
      funding: raw.child.funding,
      hodlValueNow: raw.child.hodlNow,
    })
    expect(child.pnlTotal).toBeCloseTo(raw.expected.childPnlTotal, 8)
    expect(child.pnlVsHodl).toBeCloseTo(raw.expected.childPnlVsHodl, 8)
  })
})
