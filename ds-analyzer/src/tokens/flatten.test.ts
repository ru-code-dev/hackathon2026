import { describe, expect, it } from 'vitest'

import type { PlainRecord } from '../shared/object.js'

import { flattenSlice, flattenSlices, type TokenSourceSlice } from './flatten.js'

const slice = (overrides: Partial<TokenSourceSlice> & Pick<TokenSourceSlice, 'authored' | 'resolved'>) =>
  ({
    tier: 'ref',
    label: 'test',
    emitsCssVariables: true,
    ...overrides,
  }) satisfies TokenSourceSlice

const sameInBothModes = (value: PlainRecord) => ({ light: value, dark: value })

describe('flattenSlice', () => {
  it('produces one row per leaf with a stable id and path', () => {
    const tokens = flattenSlice(
      slice({
        authored: sameInBothModes({ palette: { pink: { pink500: '#ff1f78' } } }),
        resolved: sameInBothModes({ palette: { pink: { pink500: '#ff1f78' } } }),
      }),
    )

    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({
      id: 'ref.palette.pink.pink500',
      path: ['palette', 'pink', 'pink500'],
      pathString: 'palette.pink.pink500',
      key: 'pink500',
      kind: 'color',
      category: 'color',
      cssVariable: '--sds-eng-palette-pink-pink500',
      themeDependent: false,
      anomalies: [],
    })
  })

  it('keeps authored and resolved values separately, per mode', () => {
    const [token] = flattenSlice(
      slice({
        tier: 'sys',
        authored: {
          light: { Foreground: { forePrimary: '{edsRef.palette.gray.gray900}' } },
          dark: { Foreground: { forePrimary: '{edsRef.palette.gray.gray100}' } },
        },
        resolved: {
          light: { Foreground: { forePrimary: '#0a0a0a' } },
          dark: { Foreground: { forePrimary: '#f5f5f5' } },
        },
      }),
    )

    expect(token?.authored).toEqual({
      light: '{edsRef.palette.gray.gray900}',
      dark: '{edsRef.palette.gray.gray100}',
    })
    expect(token?.resolved).toEqual({ light: '#0a0a0a', dark: '#f5f5f5' })
    expect(token?.themeDependent).toBe(true)
    expect(token?.references.light[0]?.path).toBe('palette.gray.gray900')
    expect(token?.references.dark[0]?.path).toBe('palette.gray.gray100')
  })

  it('suppresses CSS variables when the slice is not emitted as CSS', () => {
    const [token] = flattenSlice(
      slice({
        emitsCssVariables: false,
        authored: sameInBothModes({ typography: { fontFamily: { brand: 'SB Sans Display' } } }),
        resolved: sameInBothModes({ typography: { fontFamily: { brand: 'SB Sans Display' } } }),
      }),
    )

    expect(token?.cssVariable).toBeNull()
  })

  it('attaches component and facets only for the comp tier', () => {
    const [token] = flattenSlice(
      slice({
        tier: 'comp',
        emitsCssVariables: false,
        authored: sameInBothModes({ button: { colorBackgroundContainedPrimaryHover: '#fff' } }),
        resolved: sameInBothModes({ button: { colorBackgroundContainedPrimaryHover: '#fff' } }),
      }),
    )

    expect(token?.component).toBe('button')
    expect(token?.facets).toMatchObject({ category: 'color', state: 'hover' })
  })

  it('does not attach dimensions to font weights', () => {
    const [token] = flattenSlice(
      slice({
        authored: sameInBothModes({ fontWeights: { regular: 400 } }),
        resolved: sameInBothModes({ fontWeights: { regular: 400 } }),
      }),
    )

    expect(token?.kind).toBe('fontWeight')
    expect(token?.dimension).toBeNull()
  })

  it('attaches dimensions to lengths', () => {
    const [token] = flattenSlice(
      slice({
        authored: sameInBothModes({ borderRadius: { l: 8 } }),
        resolved: sameInBothModes({ borderRadius: { l: 8 } }),
      }),
    )

    expect(token?.dimension?.light).toEqual({ value: 8, unit: 'none', px: 8 })
  })

  it('flags non-finite values instead of emitting NaN', () => {
    const [token] = flattenSlice(
      slice({
        tier: 'comp',
        emitsCssVariables: false,
        authored: sameInBothModes({ textField: { widthShadowFocus: Number.NaN } }),
        resolved: sameInBothModes({ textField: { widthShadowFocus: Number.NaN } }),
      }),
    )

    expect(token?.resolved).toEqual({ light: null, dark: null })
    expect(token?.anomalies).toEqual(['non-finite-number'])
    expect(token?.themeDependent).toBe(false)
  })

  it('keeps a path present in only one mode', () => {
    const tokens = flattenSlice(
      slice({
        authored: { light: { onlyLight: 'a' }, dark: {} },
        resolved: { light: { onlyLight: 'a' }, dark: {} },
      }),
    )

    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.resolved).toEqual({ light: 'a', dark: null })
  })

  it('flags unrepresentable values', () => {
    const tokens = flattenSlice(
      slice({
        authored: sameInBothModes({ fn: () => undefined }),
        resolved: sameInBothModes({ fn: () => undefined }),
      }),
    )

    expect(tokens[0]?.anomalies).toEqual(['unrepresentable-value'])
  })
})

describe('flattenSlices', () => {
  it('merges slices and sorts rows by id', () => {
    const tokens = flattenSlices([
      slice({
        tier: 'sys',
        authored: sameInBothModes({ Background: { backAccent: '#111' } }),
        resolved: sameInBothModes({ Background: { backAccent: '#111' } }),
      }),
      slice({
        authored: sameInBothModes({ palette: { a: '#222' } }),
        resolved: sameInBothModes({ palette: { a: '#222' } }),
      }),
    ])

    expect(tokens.map((token) => token.id)).toEqual(['ref.palette.a', 'sys.Background.backAccent'])
  })

  it('returns an empty list for no slices', () => {
    expect(flattenSlices([])).toEqual([])
  })
})
