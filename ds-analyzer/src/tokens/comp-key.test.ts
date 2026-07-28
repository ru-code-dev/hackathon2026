import { describe, expect, it } from 'vitest'

import { parseCompTokenKey } from './comp-key.js'

describe('parseCompTokenKey', () => {
  it('decomposes a root-level colour token with a state', () => {
    expect(parseCompTokenKey('colorBackgroundContainedPrimaryHover')).toMatchObject({
      slot: null,
      category: 'color',
      modifiers: ['background', 'contained', 'primary'],
      state: 'hover',
      view: 'contained',
      size: null,
    })
  })

  it('extracts a multi-word slot prefix', () => {
    expect(parseCompTokenKey('closeButtonShapeBorderRadiusTopLeft')).toMatchObject({
      slot: 'closeButton',
      category: 'shape',
      modifiers: ['border', 'radius', 'top', 'left'],
      state: null,
    })
  })

  it('extracts a single-word slot prefix', () => {
    expect(parseCompTokenKey('bodyTypographyFontSize')).toMatchObject({
      slot: 'body',
      category: 'typography',
      modifiers: ['font', 'size'],
    })
  })

  it('recognises a size modifier', () => {
    expect(parseCompTokenKey('inputShapeBorderRadiusTopLeftMd')).toMatchObject({
      slot: 'input',
      category: 'shape',
      size: 'md',
    })
  })

  it('peels a stacked trailing state run and reports it as one state', () => {
    expect(parseCompTokenKey('colorBackgroundSelectableCheckedHover')).toMatchObject({
      category: 'color',
      modifiers: ['background', 'selectable'],
      state: 'checkedHover',
    })
  })

  it('handles a category-first key with no slot and no state', () => {
    expect(parseCompTokenKey('widthBorder')).toMatchObject({
      slot: null,
      category: 'width',
      modifiers: ['border'],
      state: null,
    })
  })

  it('reports a null category for keys outside the convention', () => {
    const facets = parseCompTokenKey('elevationShadow')
    expect(facets.category).toBe('elevation')

    const unmatched = parseCompTokenKey('backwardCompatibilityMode')
    expect(unmatched.category).toBeNull()
    expect(unmatched.slot).toBeNull()
    expect(unmatched.modifiers).toEqual(['backward', 'compatibility', 'mode'])
  })

  it('always preserves the raw key and its word split', () => {
    const facets = parseCompTokenKey('colorTextGhostErrorDisabled')
    expect(facets.raw).toBe('colorTextGhostErrorDisabled')
    expect(facets.words).toEqual(['color', 'text', 'ghost', 'error', 'disabled'])
  })

  it('handles digits in keys', () => {
    expect(parseCompTokenKey('colorBackgroundBase1').words).toEqual(['color', 'background', 'base', '1'])
  })
})
