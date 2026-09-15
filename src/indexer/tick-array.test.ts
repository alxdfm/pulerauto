import { describe, expect, it } from 'vitest'
import { tickArrayStartIndex, TICK_ARRAY_SIZE } from './tick-array.js'

describe('tickArrayStartIndex', () => {
  it('aligns to tickSpacing * 88', () => {
    const spacing = 4
    const span = spacing * TICK_ARRAY_SIZE
    expect(tickArrayStartIndex(0, spacing)).toBe(0)
    expect(tickArrayStartIndex(10, spacing)).toBe(0)
    expect(tickArrayStartIndex(span, spacing)).toBe(span)
    expect(tickArrayStartIndex(-1, spacing)).toBe(-span)
  })
})
