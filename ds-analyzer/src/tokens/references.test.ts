import { describe, expect, it } from 'vitest'

import { hasUnresolvedReference, isPureAlias, parseReferences } from './references.js'

describe('parseReferences', () => {
  it('parses a plain ref alias', () => {
    expect(parseReferences('{edsRef.palette.pink.pink500}')).toEqual([
      {
        raw: '{edsRef.palette.pink.pink500}',
        tier: 'edsRef',
        path: 'palette.pink.pink500',
        segments: ['palette', 'pink', 'pink500'],
        alpha: null,
      },
    ])
  })

  it('parses a sys alias', () => {
    const [reference] = parseReferences('{edsSys.Background.backAccent}')
    expect(reference?.tier).toBe('edsSys')
    expect(reference?.segments).toEqual(['Background', 'backAccent'])
  })

  it('captures the alpha of an rgba-wrapped reference', () => {
    const [reference] = parseReferences('rgba({edsRef.palette.white},0.06)')
    expect(reference?.alpha).toBe(0.06)
    expect(reference?.path).toBe('palette.white')
  })

  it('tolerates whitespace inside the rgba wrapper', () => {
    const [reference] = parseReferences('rgba( {edsRef.palette.red.red500} , 0.2 )')
    expect(reference?.alpha).toBe(0.2)
  })

  it('finds every reference in a multi-reference value', () => {
    const references = parseReferences(
      '0px 1px 2px 0px {edsRef.palette.a}, 0px 3px 7px 0px rgba({edsRef.palette.b},0.14)',
    )

    expect(references.map((reference) => reference.path)).toEqual(['palette.a', 'palette.b'])
    expect(references.map((reference) => reference.alpha)).toEqual([null, 0.14])
  })

  it('ignores braces that do not name a known tier', () => {
    expect(parseReferences('{unknownTier.foo}')).toEqual([])
    expect(parseReferences('{noDotHere}')).toEqual([])
  })

  it('returns an empty list for literals and non-strings', () => {
    expect(parseReferences('#ff1f78')).toEqual([])
    expect(parseReferences(8)).toEqual([])
    expect(parseReferences(null)).toEqual([])
    expect(parseReferences(undefined)).toEqual([])
  })

  it('is not affected by regex lastIndex state across calls', () => {
    const input = '{edsRef.palette.a}'
    expect(parseReferences(input)).toHaveLength(1)
    expect(parseReferences(input)).toHaveLength(1)
    expect(parseReferences(input)).toHaveLength(1)
  })
})

describe('isPureAlias', () => {
  it('is true only when the value is exactly one reference', () => {
    expect(isPureAlias('{edsRef.palette.a}')).toBe(true)
    expect(isPureAlias('  {edsRef.palette.a}  ')).toBe(true)
    expect(isPureAlias('rgba({edsRef.palette.a},0.1)')).toBe(false)
    expect(isPureAlias('{edsRef.a} {edsRef.b}')).toBe(false)
    expect(isPureAlias('#fff')).toBe(false)
    expect(isPureAlias(8)).toBe(false)
  })
})

describe('hasUnresolvedReference', () => {
  it('detects any remaining reference', () => {
    expect(hasUnresolvedReference('rgba({edsRef.palette.a},0.1)')).toBe(true)
    expect(hasUnresolvedReference('#ff1f78')).toBe(false)
  })
})
