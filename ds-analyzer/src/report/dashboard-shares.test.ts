import { describe, expect, it } from 'vitest'

import { allocateShares, breakdownShares } from '../../dashboard/src/lib/shares.js'

/**
 * The summary strip advertises shares of one denominator. A user who sums the visible
 * percentages must land on exactly 100 — independent rounding gave 99/101 totals and was
 * read as broken arithmetic. Largest-remainder allocation is pinned here.
 */

describe('allocateShares', () => {
  it('sums to exactly 100 even when independent rounding would not', () => {
    // demo-app numbers: 42/55 → 76.36, 8/55 → 14.55 — plain Math.round drifts.
    const shares = allocateShares({ kit: 42, tokens: 0, mixed: 1, hardcode: 8, unstyled: 3, foreign: 1 })
    expect(Object.values(shares).reduce((sum, share) => sum + share, 0)).toBe(100)
    expect(shares).toEqual({ kit: 76, tokens: 0, mixed: 2, hardcode: 15, unstyled: 5, foreign: 2 })
  })

  it('keeps every share within one point of its exact value', () => {
    const counts = { a: 1, b: 1, c: 1 }
    const shares = allocateShares(counts)
    expect(Object.values(shares).reduce((sum, share) => sum + share, 0)).toBe(100)
    for (const share of Object.values(shares)) {
      expect(Math.abs(share - 100 / 3)).toBeLessThanOrEqual(1)
    }
  })

  it('returns zeros for an empty project instead of dividing by zero', () => {
    expect(allocateShares({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 })
  })

  it('never turns a real zero into a positive share', () => {
    const shares = allocateShares({ big: 199, zero: 0, small: 1 })
    expect(shares.zero).toBe(0)
    expect(Object.values(shares).reduce((sum, share) => sum + share, 0)).toBe(100)
  })

  it('is deterministic on ties', () => {
    const first = allocateShares({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 })
    const second = allocateShares({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 })
    expect(first).toEqual(second)
  })
})

describe('breakdownShares', () => {
  it('produces a ledger that names every bucket of the denominator', () => {
    const result = breakdownShares({
      total: 55,
      kit: 42,
      kitClean: 29,
      customTokens: 0,
      customMixed: 1,
      customHardcode: 8,
      customUnstyled: 3,
      foreign: 1,
    })
    expect(
      result.kit +
        result.customTokens +
        result.customMixed +
        result.customHardcode +
        result.customUnstyled +
        result.foreign,
    ).toBe(100)
    expect(result.ledger).toContain('Все 55 компонентов = 100%')
    expect(result.ledger).toContain('из ДС — 42 (76%)')
    expect(result.ledger).toContain('на хардкоде — 8 (15%)')
    expect(result.ledger).toContain('без стилей — 3 (5%)')
    expect(result.ledger).toContain('внешние — 1 (2%)')
  })
})
