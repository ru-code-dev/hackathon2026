import { describe, expect, it } from 'vitest'

import { colorRoleOf, cssPropertyFromStyleKey, dimensionScaleOf, styleCategoryOf } from './properties.js'

describe('colorRoleOf', () => {
  it('maps paint properties to the tier group that names them', () => {
    expect(colorRoleOf('background')).toBe('background')
    expect(colorRoleOf('background-color')).toBe('background')
    expect(colorRoleOf('color')).toBe('foreground')
    expect(colorRoleOf('stroke')).toBe('foreground')
    expect(colorRoleOf('border-color')).toBe('border')
    expect(colorRoleOf('border-bottom')).toBe('border')
    expect(colorRoleOf('outline-color')).toBe('border')
  })

  it('leaves shadows roleless, because no tier group owns them', () => {
    expect(colorRoleOf('box-shadow')).toBeNull()
    expect(colorRoleOf('text-shadow')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(colorRoleOf('Background-Color')).toBe('background')
  })
})

describe('dimensionScaleOf', () => {
  it('routes each property to the scale that governs it', () => {
    expect(dimensionScaleOf('border-radius')).toEqual({ scale: 'borderRadiusPx' })
    expect(dimensionScaleOf('border-top-left-radius')).toEqual({ scale: 'borderRadiusPx' })
    expect(dimensionScaleOf('font-size')).toEqual({ scale: 'fontSizePx' })
    expect(dimensionScaleOf('line-height')).toEqual({ scale: 'lineHeightPx' })
    expect(dimensionScaleOf('border-bottom')).toEqual({ scale: 'borderWidthPx' })
    expect(dimensionScaleOf('outline-width')).toEqual({ scale: 'borderWidthPx' })
  })

  it('marks spacing as scaleless: the kit publishes no spacing scale', () => {
    expect(dimensionScaleOf('padding')).toEqual({ scale: null })
    expect(dimensionScaleOf('padding-left')).toEqual({ scale: null })
    expect(dimensionScaleOf('gap')).toEqual({ scale: null })
    expect(dimensionScaleOf('column-gap')).toEqual({ scale: null })
  })

  it('excludes layout properties, for which no token could ever be suggested', () => {
    expect(dimensionScaleOf('width')).toBeNull()
    expect(dimensionScaleOf('min-width')).toBeNull()
    expect(dimensionScaleOf('height')).toBeNull()
    expect(dimensionScaleOf('margin')).toBeNull()
    expect(dimensionScaleOf('margin-bottom')).toBeNull()
    expect(dimensionScaleOf('top')).toBeNull()
    expect(dimensionScaleOf('inset')).toBeNull()
    expect(dimensionScaleOf('z-index')).toBeNull()
  })

  it('does not confuse a radius with a width', () => {
    expect(dimensionScaleOf('border-radius')?.scale).toBe('borderRadiusPx')
    expect(dimensionScaleOf('border-width')?.scale).toBe('borderWidthPx')
  })
})

describe('styleCategoryOf', () => {
  it('treats positioning in the parent layout as the caller’s business', () => {
    for (const property of ['margin', 'margin-top', 'width', 'flex', 'grid-column', 'position', 'order', 'display']) {
      expect(styleCategoryOf(property)).toBe('layout')
    }
  })

  it('treats repainting as a design-system concern', () => {
    for (const property of ['background', 'color', 'border-radius', 'box-shadow', 'font-family', 'line-height']) {
      expect(styleCategoryOf(property)).toBe('repaint')
    }
  })

  it('treats internal spacing as a hint that the wrong size was chosen', () => {
    expect(styleCategoryOf('padding')).toBe('size')
    expect(styleCategoryOf('height')).toBe('size')
  })
})

describe('cssPropertyFromStyleKey', () => {
  it('converts camelCase', () => {
    expect(cssPropertyFromStyleKey('fontSize')).toBe('font-size')
    expect(cssPropertyFromStyleKey('borderBottomLeftRadius')).toBe('border-bottom-left-radius')
  })

  it('keeps vendor prefixes leading', () => {
    expect(cssPropertyFromStyleKey('WebkitTextFillColor')).toBe('-webkit-text-fill-color')
    expect(cssPropertyFromStyleKey('msFlexAlign')).toBe('-ms-flex-align')
  })

  it('passes custom properties through untouched', () => {
    expect(cssPropertyFromStyleKey('--brand-color')).toBe('--brand-color')
  })
})
