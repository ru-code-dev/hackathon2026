import { describe, expect, it } from 'vitest'

import type { TokenDto } from '../domain/tokens.js'

import { buildTokenDiagnostics } from './diagnostics.js'

const token = (overrides: Partial<TokenDto> & Pick<TokenDto, 'id' | 'tier'>): TokenDto => {
  const path = overrides.id.split('.').slice(1)
  return {
    path,
    pathString: path.join('.'),
    key: path.at(-1) ?? '',
    kind: 'color',
    category: 'color',
    authored: { light: '#fff', dark: '#fff' },
    resolved: { light: '#fff', dark: '#fff' },
    themeDependent: false,
    references: { light: [], dark: [] },
    color: null,
    dimension: null,
    cssVariable: null,
    component: null,
    facets: null,
    anomalies: [],
    ...overrides,
  }
}

const codesOf = (tokens: TokenDto[]): string[] => buildTokenDiagnostics(tokens).map((entry) => entry.code)

describe('buildTokenDiagnostics', () => {
  it('reports a missing spacing scale when no ref group looks like one', () => {
    const diagnostics = buildTokenDiagnostics([token({ id: 'ref.borderRadius.l', tier: 'ref' })])

    expect(diagnostics.map((entry) => entry.code)).toContain('spacing-scale-missing')
  })

  it('stays silent about spacing when a spacing group exists', () => {
    expect(codesOf([token({ id: 'ref.spacing.m', tier: 'ref' })])).not.toContain('spacing-scale-missing')
  })

  it('reports values that never resolved', () => {
    const diagnostics = buildTokenDiagnostics([
      token({ id: 'sys.a.b', tier: 'sys', resolved: { light: '{edsRef.missing.path}', dark: '#fff' } }),
    ])

    const entry = diagnostics.find((item) => item.code === 'reference-unresolved')
    expect(entry?.severity).toBe('error')
    expect(entry?.samples).toEqual(['sys.a.b'])
  })

  it('reports non-finite values as an error', () => {
    const diagnostics = buildTokenDiagnostics([
      token({ id: 'comp.textField.widthShadowFocus', tier: 'comp', anomalies: ['non-finite-number'] }),
    ])

    const entry = diagnostics.find((item) => item.code === 'value-non-finite')
    expect(entry?.severity).toBe('error')
    expect(entry?.count).toBe(1)
  })

  it('reports CSS variable collisions', () => {
    const diagnostics = buildTokenDiagnostics([
      token({ id: 'ref.a', tier: 'ref', cssVariable: '--sds-eng-x' }),
      token({ id: 'sys.b', tier: 'sys', cssVariable: '--sds-eng-x' }),
    ])

    const entry = diagnostics.find((item) => item.code === 'css-variable-collision')
    expect(entry?.samples[0]).toContain('--sds-eng-x')
  })

  it('reports component tokens that hardcode a value instead of referencing a tier', () => {
    const diagnostics = buildTokenDiagnostics([
      token({
        id: 'comp.card.colorShadowFocus',
        tier: 'comp',
        category: 'shadow',
        resolved: { light: 'none', dark: 'none' },
      }),
    ])

    expect(diagnostics.map((entry) => entry.code)).toContain('comp-token-literal')
  })

  it('reports sys colours that do not change between themes', () => {
    const diagnostics = buildTokenDiagnostics([
      token({ id: 'sys.BackgroundConst.backConstPrimary', tier: 'sys', themeDependent: false }),
    ])

    expect(diagnostics.map((entry) => entry.code)).toContain('sys-color-theme-invariant')
  })

  it('caps the sample list while keeping the true count', () => {
    const tokens = Array.from({ length: 30 }, (_, index) =>
      token({ id: `sys.Background.c${index}`, tier: 'sys', themeDependent: false }),
    )

    const entry = buildTokenDiagnostics(tokens).find((item) => item.code === 'sys-color-theme-invariant')
    expect(entry?.count).toBe(30)
    expect(entry?.samples.length).toBeLessThanOrEqual(10)
  })

  it('returns only the spacing gap for a clean ref-only token set', () => {
    expect(codesOf([token({ id: 'ref.palette.a', tier: 'ref' })])).toEqual(['spacing-scale-missing'])
  })
})
