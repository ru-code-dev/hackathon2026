import { describe, expect, it } from 'vitest'

import type { TokenDto } from '../domain/tokens.js'

import { parseDimension } from './dimension.js'
import { buildScales } from './scales.js'

const dimensionToken = (
  id: string,
  tier: TokenDto['tier'],
  value: string | number,
  kind: TokenDto['kind'],
): TokenDto => {
  const path = id.split('.').slice(1)
  return {
    id,
    tier,
    path,
    pathString: path.join('.'),
    key: path.at(-1) ?? '',
    kind,
    category: 'dimension',
    authored: { light: value, dark: value },
    resolved: { light: value, dark: value },
    themeDependent: false,
    references: { light: [], dark: [] },
    color: null,
    dimension: { light: parseDimension(value), dark: parseDimension(value) },
    cssVariable: null,
    component: null,
    facets: null,
    anomalies: [],
  }
}

const valueToken = (id: string, tier: TokenDto['tier'], value: string | number, kind: TokenDto['kind']): TokenDto => ({
  ...dimensionToken(id, tier, value, kind),
  category: 'typography',
  dimension: null,
})

describe('buildScales', () => {
  it('derives each scale from its ref group', () => {
    const scales = buildScales([
      dimensionToken('ref.borderRadius.l', 'ref', 8, 'dimension'),
      dimensionToken('ref.borderRadius.m', 'ref', 4, 'dimension'),
      dimensionToken('ref.borderWidth.2', 'ref', 2, 'dimension'),
      dimensionToken('ref.fontSize.m', 'ref', '16px', 'fontSize'),
      dimensionToken('ref.lineHeights.lh20', 'ref', '20px', 'lineHeight'),
      valueToken('ref.fontWeights.regular', 'ref', 400, 'fontWeight'),
      valueToken('ref.fontFamilies.text', 'ref', 'SB Sans Text', 'fontFamily'),
      valueToken('ref.letterSpacing.none', 'ref', '0', 'letterSpacing'),
    ])

    expect(scales.borderRadiusPx).toEqual([4, 8])
    expect(scales.borderWidthPx).toEqual([2])
    expect(scales.fontSizePx).toEqual([16])
    expect(scales.lineHeightPx).toEqual([20])
    expect(scales.fontWeights).toEqual([400])
    expect(scales.fontFamilies).toEqual(['SB Sans Text'])
    expect(scales.letterSpacing).toEqual(['0'])
  })

  it('ignores sys and comp tiers, which only alias primitives', () => {
    const scales = buildScales([
      dimensionToken('ref.borderRadius.m', 'ref', 4, 'dimension'),
      dimensionToken('comp.button.shapeBorderRadiusTopLeft', 'comp', 6, 'dimension'),
      dimensionToken('sys.borderWidth.normal', 'sys', 3, 'dimension'),
    ])

    expect(scales.borderRadiusPx).toEqual([4])
    expect(scales.borderWidthPx).toEqual([])
  })

  it('collects every pixel value across all tiers into allDimensionPx', () => {
    const scales = buildScales([
      dimensionToken('ref.borderRadius.m', 'ref', 4, 'dimension'),
      dimensionToken('comp.button.height', 'comp', '32px', 'dimension'),
      valueToken('ref.fontWeights.semibold', 'ref', 600, 'fontWeight'),
    ])

    // 600 must not leak in: font weights carry no dimension.
    expect(scales.allDimensionPx).toEqual([4, 32])
  })

  it('sorts numerically, not lexicographically, and de-duplicates', () => {
    const scales = buildScales([
      dimensionToken('ref.fontSize.a', 'ref', '10px', 'fontSize'),
      dimensionToken('ref.fontSize.b', 'ref', '9px', 'fontSize'),
      dimensionToken('ref.fontSize.c', 'ref', '10px', 'fontSize'),
    ])

    expect(scales.fontSizePx).toEqual([9, 10])
  })

  it('returns empty scales for no tokens', () => {
    const scales = buildScales([])

    expect(scales.borderRadiusPx).toEqual([])
    expect(scales.fontFamilies).toEqual([])
    expect(scales.allDimensionPx).toEqual([])
  })
})
