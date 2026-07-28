import { describe, expect, it } from 'vitest'

import { isDimensionLiteral, parseDimension, toPixelScale } from './dimension.js'

describe('parseDimension', () => {
  it('treats a bare number as a pixel count, matching the kit borderRadius convention', () => {
    expect(parseDimension(8)).toEqual({ value: 8, unit: 'none', px: 8 })
    expect(parseDimension(0)).toEqual({ value: 0, unit: 'none', px: 0 })
  })

  it('parses px strings', () => {
    expect(parseDimension('20px')).toEqual({ value: 20, unit: 'px', px: 20 })
  })

  it('parses unitless numeric strings as pixels', () => {
    expect(parseDimension('0')).toEqual({ value: 0, unit: 'none', px: 0 })
  })

  it('resolves rem and em against the configured root size', () => {
    expect(parseDimension('1.5rem')).toEqual({ value: 1.5, unit: 'rem', px: 24 })
    expect(parseDimension('2em', 10)).toEqual({ value: 2, unit: 'em', px: 20 })
  })

  it('leaves context-dependent units without a pixel projection', () => {
    expect(parseDimension('96%')).toEqual({ value: 96, unit: '%', px: null })
    expect(parseDimension('50vh')).toEqual({ value: 50, unit: 'vh', px: null })
    expect(parseDimension('3ch')).toEqual({ value: 3, unit: 'ch', px: null })
  })

  it('handles negative and fractional values', () => {
    expect(parseDimension('-2px')).toEqual({ value: -2, unit: 'px', px: -2 })
    expect(parseDimension('.5rem')).toEqual({ value: 0.5, unit: 'rem', px: 8 })
  })

  it('is case-insensitive about units', () => {
    expect(parseDimension('12PX')?.unit).toBe('px')
  })

  it('rejects non-scalar and non-dimension input', () => {
    for (const input of ['', 'auto', 'none', '8px 4px', 'calc(8px + 2px)', '#fff', 'bold']) {
      expect(parseDimension(input), input).toBeNull()
    }
  })

  it('rejects non-finite numbers', () => {
    expect(parseDimension(Number.NaN)).toBeNull()
    expect(parseDimension(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('isDimensionLiteral', () => {
  it('agrees with parseDimension', () => {
    expect(isDimensionLiteral('4px')).toBe(true)
    expect(isDimensionLiteral('#fff')).toBe(false)
  })
})

describe('toPixelScale', () => {
  it('sorts, de-duplicates and drops values without a pixel projection', () => {
    const scale = toPixelScale([
      { value: 8, unit: 'px', px: 8 },
      { value: 2, unit: 'px', px: 2 },
      { value: 8, unit: 'none', px: 8 },
      { value: 50, unit: '%', px: null },
    ])

    expect(scale).toEqual([2, 8])
  })

  it('returns an empty scale for no input', () => {
    expect(toPixelScale([])).toEqual([])
  })
})
