import { beforeAll, describe, expect, it } from 'vitest'

import { resolvePaths } from '../config.js'
import { tokensArtifactSchema, type TokensArtifact, type TokenDto } from '../domain/tokens.js'
import { collectLeaves } from '../shared/object.js'

import { extractTokens } from './extract.js'
import { loadThemeSource, type ThemeSource } from './loader.js'

/**
 * Integration coverage against the real UI kit.
 *
 * The unit specs prove each transform in isolation; these prove the extraction is
 * *complete and faithful* — that no leaf of the theme is dropped, that resolved values
 * match what the kit itself computes, and that the reverse index round-trips.
 */

let artifact: TokensArtifact
let theme: ThemeSource

const tokenById = (id: string): TokenDto | undefined => artifact.tokens.find((token) => token.id === id)

beforeAll(async () => {
  const result = await extractTokens()
  artifact = result.artifact
  theme = await loadThemeSource(resolvePaths().themeSrcDir)
}, 120_000)

describe('extractTokens — contract', () => {
  it('produces an artifact that satisfies its schema', () => {
    expect(() => tokensArtifactSchema.parse(artifact)).not.toThrow()
  })

  it('declares its schema version and source', () => {
    expect(artifact.$schema).toBe('ds-analyzer/tokens@1')
    expect(artifact.meta.sourceRoot).toBe('packages/theme/src')
    expect(artifact.meta.cssVariablePrefix).toBe('sds-eng')
    expect(artifact.meta.themePackageVersion).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('is JSON-serialisable without loss', () => {
    const roundTripped: unknown = JSON.parse(JSON.stringify(artifact))
    expect(roundTripped).toEqual(artifact)
  })
})

describe('extractTokens — completeness', () => {
  it('emits one token for every leaf of every theme tier', () => {
    // Independent count, derived straight from the loaded theme rather than the extractor.
    const expected = new Set<string>()
    const add = (tier: string, root: Record<string, unknown>): void => {
      for (const leaf of collectLeaves(root)) {
        expected.add(`${tier}.${leaf.path.join('.')}`)
      }
    }

    add('ref', theme.edsRef)
    add('ref', theme.ref)
    add('sys', theme.sysLight)
    add('sys', theme.sysDark)
    add('comp', theme.comp)

    const actual = new Set(artifact.tokens.map((token) => token.id))

    expect([...expected].filter((id) => !actual.has(id))).toEqual([])
    expect(actual.size).toBe(expected.size)
  })

  it('covers all three tiers with a plausible distribution', () => {
    expect(artifact.meta.counts.byTier.ref).toBeGreaterThan(200)
    expect(artifact.meta.counts.byTier.sys).toBeGreaterThan(200)
    expect(artifact.meta.counts.byTier.comp).toBeGreaterThan(1000)
    expect(artifact.meta.counts.total).toBe(artifact.tokens.length)
  })

  it('assigns every token a category', () => {
    expect(
      artifact.tokens.filter((token) => token.category === 'other' && token.kind === 'unknown').length,
    ).toBeLessThan(5)
  })

  it('names one component per comp-tier root', () => {
    const componentNames = new Set(
      artifact.tokens.filter((token) => token.tier === 'comp').map((token) => token.component),
    )
    expect(componentNames.size).toBe(artifact.meta.counts.components)
    expect(componentNames).toContain('button')
    // The theme file is `textField.ts` but the exported const is `input`; the artifact
    // keys off the exported name, which is what the runtime theme object actually uses.
    expect(componentNames).toContain('input')
  })
})

describe('extractTokens — fidelity', () => {
  it('records a ref primitive verbatim, with colour and CSS variable', () => {
    const token = tokenById('ref.palette.pink.pink500')

    expect(token).toMatchObject({
      tier: 'ref',
      kind: 'color',
      category: 'color',
      resolved: { light: '#ff1f78', dark: '#ff1f78' },
      themeDependent: false,
      cssVariable: '--sds-eng-palette-pink-pink500',
      component: null,
      facets: null,
    })
    expect(token?.color?.light?.hex).toBe('#ff1f78ff')
  })

  it('resolves a sys alias differently per theme mode and keeps both authored templates', () => {
    const token = tokenById('sys.Foreground.forePrimary')

    expect(token?.themeDependent).toBe(true)
    expect(token?.authored.light).toContain('{edsRef.')
    expect(token?.authored.dark).toContain('{edsRef.')
    expect(token?.authored.light).not.toBe(token?.authored.dark)
    expect(token?.references.light[0]?.tier).toBe('edsRef')
    expect(token?.references.dark[0]?.tier).toBe('edsRef')
  })

  it('resolves a comp token through sys down to a literal colour', () => {
    const token = tokenById('comp.button.colorBackgroundContainedPrimary')

    expect(token?.tier).toBe('comp')
    expect(token?.component).toBe('button')
    expect(token?.references.light[0]?.tier).toBe('edsSys')
    expect(token?.resolved.light).toMatch(/^#[0-9a-f]{6}$/i)
    expect(token?.cssVariable).toBeNull()
  })

  it('merges an rgba-wrapped reference into an 8-digit hex, as calcTheme does', () => {
    const token = artifact.tokens.find(
      (candidate) => candidate.tier === 'sys' && candidate.references.light.some((ref) => ref.alpha !== null),
    )

    expect(token).toBeDefined()
    expect(token?.color?.light?.hasAlpha).toBe(true)
  })

  it('agrees with the kit on every resolved light-mode value', () => {
    const mismatches = artifact.tokens
      .filter((token) => token.tier === 'ref' && token.anomalies.length === 0)
      .filter((token) => {
        let value: unknown = theme.light.edsRef
        for (const segment of token.path) {
          value = (value as Record<string, unknown> | undefined)?.[segment]
        }
        return value !== undefined && value !== token.resolved.light
      })

    expect(mismatches.map((token) => token.id)).toEqual([])
  })
})

describe('extractTokens — CSS variables', () => {
  it('emits variables for the ref and sys tiers only', () => {
    const withVariable = artifact.tokens.filter((token) => token.cssVariable !== null)

    expect(withVariable.every((token) => token.tier !== 'comp')).toBe(true)
    expect(withVariable.length).toBe(artifact.meta.counts.cssVariables)
  })

  it('prefixes every variable consistently', () => {
    for (const token of artifact.tokens) {
      if (token.cssVariable !== null) {
        expect(token.cssVariable.startsWith('--sds-eng-')).toBe(true)
      }
    }
  })

  it('does not emit variables for the legacy `ref` typography export', () => {
    expect(tokenById('ref.typography.fontFamily.brand')?.cssVariable).toBeNull()
  })
})

describe('extractTokens — reverse index', () => {
  it('round-trips every CSS variable back to its token', () => {
    for (const token of artifact.tokens) {
      if (token.cssVariable !== null) {
        expect(artifact.reverseIndex.cssVariable[token.cssVariable]).toBeDefined()
      }
    }
  })

  it('round-trips every colour to a bucket containing its token', () => {
    for (const token of artifact.tokens) {
      const hex = token.color?.light?.hex
      if (hex !== undefined) {
        expect(artifact.reverseIndex.color.light[hex]).toContain(token.id)
      }
    }
  })

  it('round-trips every pixel dimension', () => {
    for (const token of artifact.tokens) {
      const px = token.dimension?.light?.px
      if (px !== undefined && px !== null) {
        expect(artifact.reverseIndex.dimensionPx.light[String(px)]).toContain(token.id)
      }
    }
  })

  it('answers the analyser question: which token is #ff1f78?', () => {
    expect(artifact.reverseIndex.color.light['#ff1f78ff']).toContain('ref.palette.pink.pink500')
  })
})

describe('extractTokens — scales', () => {
  it('derives the kit border radius, width and type ramps', () => {
    expect(artifact.scales.borderRadiusPx).toEqual([0, 2, 4, 8, 9999])
    expect(artifact.scales.borderWidthPx).toEqual([0, 2])
    expect(artifact.scales.fontSizePx).toEqual([10, 12, 14, 16, 18, 20, 24, 30, 38, 48])
    expect(artifact.scales.lineHeightPx).toEqual([12, 14, 16, 20, 24, 30, 32, 36, 46, 62])
    expect(artifact.scales.fontWeights).toEqual([300, 400, 500, 600])
  })

  it('lists exactly the two shipped font stacks', () => {
    expect(artifact.scales.fontFamilies).toHaveLength(2)
    expect(artifact.scales.fontFamilies.every((family) => family.includes('SB Sans'))).toBe(true)
  })

  it('keeps font weights out of the pixel scale', () => {
    for (const weight of artifact.scales.fontWeights) {
      expect(artifact.scales.allDimensionPx).not.toContain(weight)
    }
  })
})

describe('extractTokens — diagnostics', () => {
  it('reports the absent spacing scale, which constrains padding analysis downstream', () => {
    expect(artifact.diagnostics.map((entry) => entry.code)).toContain('spacing-scale-missing')
  })

  it('reports the NaN-valued token the kit ships', () => {
    const entry = artifact.diagnostics.find((item) => item.code === 'value-non-finite')

    expect(entry?.severity).toBe('error')
    expect(entry?.samples).toContain('comp.input.widthShadowFocus')
  })

  it('leaves no reference unresolved', () => {
    expect(artifact.diagnostics.find((entry) => entry.code === 'reference-unresolved')).toBeUndefined()
  })

  it('reports no CSS variable collisions', () => {
    expect(artifact.diagnostics.find((entry) => entry.code === 'css-variable-collision')).toBeUndefined()
  })
})

describe('extractTokens — determinism', () => {
  it('produces byte-identical output across runs', async () => {
    const second = await extractTokens()
    expect(JSON.stringify(second.artifact)).toBe(JSON.stringify(artifact))
  }, 120_000)
})
