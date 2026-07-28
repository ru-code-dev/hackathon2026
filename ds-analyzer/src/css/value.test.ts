import { describe, expect, it } from 'vitest'

import { extractValueLiterals, isSoleCustomPropertyReference, splitFontFamilies } from './value.js'

const kinds = (value: string, options?: { allowNamedColors?: boolean }) =>
  extractValueLiterals(value, options).map((literal) =>
    literal.kind === 'var' ? `var:${literal.name}` : `${literal.kind}:${literal.raw}`,
  )

describe('extractValueLiterals', () => {
  it('splits a shorthand into its independent decisions', () => {
    expect(kinds('1px solid #2969e3')).toEqual(['dimension:1px', 'color:#2969e3'])
  })

  it('reports every length in a multi-value shorthand', () => {
    expect(kinds('11px 13px')).toEqual(['dimension:11px', 'dimension:13px'])
  })

  it('records offsets so a column can be derived', () => {
    const literals = extractValueLiterals('1px solid #2969e3')

    expect(literals.map((literal) => literal.offset)).toEqual([0, 10])
  })

  it('captures functional colour notations whole', () => {
    expect(kinds('rgba(0, 0, 0, 0.5)')).toEqual(['color:rgba(0, 0, 0, 0.5)'])
    expect(kinds('oklch(0.65 0.25 6)')).toEqual(['color:oklch(0.65 0.25 6)'])
  })

  it('does not treat a custom property as a literal', () => {
    expect(kinds('var(--sds-eng-Border-borderAccent)')).toEqual(['var:--sds-eng-Border-borderAccent'])
  })

  it('ignores a fallback inside var(): a fallback is not the authored value', () => {
    expect(kinds('var(--brand, #ff1f78)')).toEqual(['var:--brand'])
  })

  it('reports the width in a border shorthand alongside a custom property', () => {
    expect(kinds('2px solid var(--sds-eng-palette-electric-electric700)')).toEqual([
      'dimension:2px',
      'var:--sds-eng-palette-electric-electric700',
    ])
  })

  it('skips url() contents, where data URIs look like hex colours', () => {
    expect(kinds('url(data:image/svg+xml;base64,#ff1f78) no-repeat')).toEqual([])
  })

  it('ignores bare numbers, which in CSS are line-heights and flex factors', () => {
    expect(kinds('1.5')).toEqual([])
    expect(kinds('0 0 0 2px #ff2078')).toEqual(['dimension:2px', 'color:#ff2078'])
  })

  it('reads named colours when the property gives the context', () => {
    expect(kinds('gold')).toEqual(['color:gold'])
  })

  it('never reads named colours out of TypeScript strings', () => {
    expect(kinds('gold', { allowNamedColors: false })).toEqual([])
  })

  it('leaves keywords that express no decision alone', () => {
    expect(kinds('transparent')).toEqual([])
    expect(kinds('none')).toEqual([])
    expect(kinds('currentColor')).toEqual([])
    expect(kinds('inherit')).toEqual([])
  })

  it('accepts short hex inside CSS', () => {
    expect(kinds('#fff')).toEqual(['color:#fff'])
  })

  it('survives an unbalanced parenthesis without claiming anything', () => {
    expect(() => extractValueLiterals('rgba(0, 0, 0')).not.toThrow()
  })

  it('skips comments', () => {
    expect(kinds('/* #ff1f78 */ 8px')).toEqual(['dimension:8px'])
  })
})

describe('splitFontFamilies', () => {
  it('unquotes and trims each family', () => {
    expect(splitFontFamilies('"SB Sans Text", Inter, sans-serif')).toEqual(['SB Sans Text', 'Inter', 'sans-serif'])
  })

  it('drops empty entries from a trailing comma', () => {
    expect(splitFontFamilies('Inter, ')).toEqual(['Inter'])
  })
})

describe('isSoleCustomPropertyReference', () => {
  it('accepts a bare reference', () => {
    expect(isSoleCustomPropertyReference('var(--sds-eng-Background-backBase)')).toBe(true)
  })

  it('rejects a reference embedded in a shorthand', () => {
    expect(isSoleCustomPropertyReference('2px solid var(--x)')).toBe(false)
  })
})
