import { describe, expect, it } from 'vitest'

import { categoryOfKind, classifyTokenValue } from './classify.js'

describe('classifyTokenValue', () => {
  it('classifies from the path before the value shape', () => {
    // 400 is a bare number; only the path distinguishes a weight from a length.
    expect(classifyTokenValue(['fontWeights', 'regular'], 400, 400)).toBe('fontWeight')
    expect(classifyTokenValue(['borderRadius', 'none'], 0, 0)).toBe('dimension')
  })

  it('resolves the kit ref groups', () => {
    expect(classifyTokenValue(['palette', 'pink', 'pink500'], '#ff1f78', '#ff1f78')).toBe('color')
    expect(classifyTokenValue(['fontSize', 'm'], '16px', '16px')).toBe('fontSize')
    expect(classifyTokenValue(['lineHeights', 'lh20'], '20px', '20px')).toBe('lineHeight')
    expect(classifyTokenValue(['letterSpacing', 'none'], '0', '0')).toBe('letterSpacing')
    expect(classifyTokenValue(['fontFamilies', 'text'], 'SB Sans Text, sans-serif', 'SB Sans Text, sans-serif')).toBe(
      'fontFamily',
    )
  })

  it('prefers the more specific rule when several path words match', () => {
    // `bodyTypographyFontSize` contains both "font" and "size" — fontSize must win over a
    // generic typography classification.
    expect(classifyTokenValue(['card', 'bodyTypographyFontSize'], '16px', '16px')).toBe('fontSize')
  })

  it('classifies elevation and shadow paths as shadows', () => {
    expect(classifyTokenValue(['Elevation', 'elevation1'], '0px 1px 4px 0px #000', '0px 1px 4px 0px #000')).toBe(
      'shadow',
    )
    expect(classifyTokenValue(['card', 'colorShadowFocus'], 'none', 'none')).toBe('shadow')
  })

  it('falls back to value shape when the path carries no signal', () => {
    expect(classifyTokenValue(['a'], '96%', '96%')).toBe('dimension')
    expect(classifyTokenValue(['Switch', 'shadow-on'], '0px 0px 4px 0px #016f00b5', '0px 0px 4px 0px #016f00b5')).toBe(
      'shadow',
    )
    expect(classifyTokenValue(['textCase', 'none'], 'none', 'none')).toBe('keyword')
  })

  it('uses the resolved value when the authored value is still a template', () => {
    expect(classifyTokenValue(['someKey'], '{edsRef.palette.a}', '#ff1f78')).toBe('color')
  })

  it('returns unknown when only an unresolved template is available', () => {
    expect(classifyTokenValue(['someKey'], '{edsRef.palette.a}', '{edsRef.palette.a}')).toBe('unknown')
  })

  it('returns unknown for values it cannot represent', () => {
    expect(classifyTokenValue(['someKey'], null, null)).toBe('unknown')
    expect(classifyTokenValue(['someKey'], true, true)).toBe('unknown')
  })

  it('treats a bare number with no path signal as a dimension', () => {
    expect(classifyTokenValue(['someKey'], 12, 12)).toBe('dimension')
  })
})

describe('categoryOfKind', () => {
  it('groups kinds into the artifact-level categories', () => {
    expect(categoryOfKind('color')).toBe('color')
    expect(categoryOfKind('shadow')).toBe('shadow')
    expect(categoryOfKind('dimension')).toBe('dimension')
    expect(categoryOfKind('fontSize')).toBe('typography')
    expect(categoryOfKind('fontWeight')).toBe('typography')
    expect(categoryOfKind('keyword')).toBe('other')
    expect(categoryOfKind('unknown')).toBe('other')
  })
})
