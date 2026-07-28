import { describe, expect, it } from 'vitest'

import type { TokenDto } from '../domain/tokens.js'

import { parseColor } from './color.js'
import { parseDimension } from './dimension.js'
import { buildReverseIndex, findCssVariableCollisions } from './reverse-index.js'

const token = (overrides: Partial<TokenDto> & Pick<TokenDto, 'id'>): TokenDto => ({
  tier: 'ref',
  path: overrides.id.split('.').slice(1),
  pathString: overrides.id.split('.').slice(1).join('.'),
  key: overrides.id.split('.').at(-1) ?? '',
  kind: 'color',
  category: 'color',
  authored: { light: null, dark: null },
  resolved: { light: null, dark: null },
  themeDependent: false,
  references: { light: [], dark: [] },
  color: null,
  dimension: null,
  cssVariable: null,
  component: null,
  facets: null,
  anomalies: [],
  ...overrides,
})

const colorToken = (id: string, light: string, dark = light): TokenDto =>
  token({
    id,
    resolved: { light, dark },
    color: { light: parseColor(light), dark: parseColor(dark) },
  })

describe('buildReverseIndex', () => {
  it('maps a CSS variable to its token', () => {
    const index = buildReverseIndex([token({ id: 'ref.palette.a', cssVariable: '--sds-eng-palette-a' })])

    expect(index.cssVariable).toEqual({ '--sds-eng-palette-a': 'ref.palette.a' })
  })

  it('indexes colours by canonical hex per mode', () => {
    const index = buildReverseIndex([colorToken('sys.Background.backAccent', '#ff1f78', '#0a162b')])

    expect(index.color.light['#ff1f78ff']).toEqual(['sys.Background.backAccent'])
    expect(index.color.dark['#0a162bff']).toEqual(['sys.Background.backAccent'])
    expect(index.color.dark['#ff1f78ff']).toBeUndefined()
  })

  it('collects every token sharing a colour into one sorted bucket', () => {
    const index = buildReverseIndex([colorToken('ref.palette.b', '#ff1f78'), colorToken('ref.palette.a', '#ff1f78')])

    expect(index.color.light['#ff1f78ff']).toEqual(['ref.palette.a', 'ref.palette.b'])
  })

  it('normalises differing notations of the same colour into one bucket', () => {
    const index = buildReverseIndex([colorToken('ref.palette.a', '#fff'), colorToken('ref.palette.b', '#ffffff')])

    expect(index.color.light['#ffffffff']).toEqual(['ref.palette.a', 'ref.palette.b'])
  })

  it('indexes dimensions by pixel value', () => {
    const index = buildReverseIndex([
      token({
        id: 'ref.borderRadius.l',
        kind: 'dimension',
        category: 'dimension',
        resolved: { light: 8, dark: 8 },
        dimension: { light: parseDimension(8), dark: parseDimension(8) },
      }),
    ])

    expect(index.dimensionPx.light['8']).toEqual(['ref.borderRadius.l'])
  })

  it('skips dimensions without a pixel projection', () => {
    const index = buildReverseIndex([
      token({
        id: 'ref.a',
        kind: 'dimension',
        category: 'dimension',
        resolved: { light: '96%', dark: '96%' },
        dimension: { light: parseDimension('96%'), dark: parseDimension('96%') },
      }),
    ])

    expect(index.dimensionPx.light).toEqual({})
  })

  it('indexes every non-null resolved value as a literal', () => {
    const index = buildReverseIndex([
      token({
        id: 'ref.fontFamilies.text',
        kind: 'fontFamily',
        resolved: { light: 'SB Sans Text', dark: 'SB Sans Text' },
      }),
    ])

    expect(index.literal.light['SB Sans Text']).toEqual(['ref.fontFamilies.text'])
  })

  it('omits null resolved values from the literal index', () => {
    const index = buildReverseIndex([token({ id: 'comp.a.b' })])

    expect(index.literal.light).toEqual({})
  })

  it('emits sorted keys for stable diffs', () => {
    const index = buildReverseIndex([colorToken('ref.b', '#ffffff'), colorToken('ref.a', '#000000')])

    expect(Object.keys(index.color.light)).toEqual(['#000000ff', '#ffffffff'])
  })

  it('handles an empty token set', () => {
    const index = buildReverseIndex([])

    expect(index.cssVariable).toEqual({})
    expect(index.color.light).toEqual({})
  })
})

describe('findCssVariableCollisions', () => {
  it('reports variables claimed by more than one token', () => {
    const collisions = findCssVariableCollisions([
      token({ id: 'ref.a', cssVariable: '--sds-eng-x' }),
      token({ id: 'sys.b', cssVariable: '--sds-eng-x' }),
      token({ id: 'ref.c', cssVariable: '--sds-eng-y' }),
    ])

    expect([...collisions.keys()]).toEqual(['--sds-eng-x'])
    expect(collisions.get('--sds-eng-x')).toEqual(['ref.a', 'sys.b'])
  })

  it('is empty when every variable is unique', () => {
    expect(findCssVariableCollisions([token({ id: 'ref.a', cssVariable: '--x' })]).size).toBe(0)
  })
})
