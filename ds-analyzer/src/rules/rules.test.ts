import { describe, expect, it } from 'vitest'

import { resolvePaths } from '../config.js'
import type { Observations, StyleValue } from '../domain/observations.js'
import { OBSERVATIONS_SCHEMA_ID } from '../domain/observations.js'
import { A11ySpec } from '../kit/a11y-spec.js'
import type { ProjectProfile } from '../domain/profile.js'
import { KitSpec } from '../kit/spec.js'
import { buildSpacingIndex } from './context.js'
import { runRules } from './index.js'
import { buildSnippet } from './snippet.js'
import type { RawFinding, RuleContext } from './types.js'

/**
 * Decision logic that the oracle run exercises but does not isolate.
 *
 * The end-to-end score says the pipeline agrees with a human on one project. These say
 * *why* each verdict came out the way it did, which is what makes a future change to the
 * thresholds a deliberate act rather than an accident.
 */

const kit = KitSpec.load(resolvePaths().artifactsDir)

const styleValue = (overrides: Partial<StyleValue> & Pick<StyleValue, 'property' | 'value'>): StyleValue => ({
  authored: null,
  file: 'src/a.scss',
  line: 1,
  column: 3,
  source: 'scss',
  selector: '.a',
  classNames: ['a'],
  important: false,
  dynamic: false,
  rootCause: null,
  appliedTo: null,
  ...overrides,
})

const observations = (values: readonly StyleValue[], extra: Partial<Observations> = {}): Observations => ({
  $schema: OBSERVATIONS_SCHEMA_ID,
  styleValues: [...values],
  jsxElements: [],
  imports: [],
  reExports: [],
  declarations: [],
  files: ['src/a.scss'],
  limitations: [],
  ...extra,
})

const profile: ProjectProfile = {
  $schema: 'ds-analyzer/project-profile@1',
  root: '/tmp/x',
  scope: '',
  name: 'x',
  packageManager: 'unknown',
  monorepo: { detected: false, workspaces: [] },
  tsconfigs: [],
  aliases: [],
  kitSources: [{ specifier: '@sds-eng/base', kind: 'package', via: [], names: [] }],
  kitVersion: null,
  usesKit: true,
  styleSyntaxes: ['scss'],
  files: { scanned: 1, ignored: 0, unparseable: 0, byExtension: {} },
  limitations: [],
}

const contextFor = (values: readonly StyleValue[], extra: Partial<Observations> = {}): RuleContext => {
  const collected = observations(values, extra)

  return {
    kit,
    a11y: A11ySpec.unavailable(),
    profile,
    observations: collected,
    sources: new Map(),
    spacing: buildSpacingIndex(collected.styleValues),
    elementsByFile: new Map(),
  }
}

const run = (values: readonly StyleValue[], extra: Partial<Observations> = {}) => runRules(contextFor(values, extra))

describe('buildSpacingIndex', () => {
  const padding = (px: number, times: number): StyleValue[] =>
    Array.from({ length: times }, () => styleValue({ property: 'padding', value: `${String(px)}px` }))

  it('says nothing on a sample too small to have habits', () => {
    const index = buildSpacingIndex(padding(13, 3))

    expect(index.isMagic(13)).toBe(false)
  })

  it('calls a rare value magic against a dominant one', () => {
    const index = buildSpacingIndex([...padding(8, 40), ...padding(13, 1)])

    expect(index.isMagic(13)).toBe(true)
    expect(index.isMagic(8)).toBe(false)
  })

  it('accepts a value the team clearly uses on purpose', () => {
    // 13px sixty times is that team's spacing unit, whatever the kit thinks.
    const index = buildSpacingIndex([...padding(8, 40), ...padding(13, 60)])

    expect(index.isMagic(13)).toBe(false)
  })

  it('ignores zeros, which express no decision', () => {
    const index = buildSpacingIndex(padding(0, 30))

    expect(index.total).toBe(0)
  })

  it('only counts properties the kit has no ramp for', () => {
    const index = buildSpacingIndex([styleValue({ property: 'border-radius', value: '13px' })])

    expect(index.counts.get(13)).toBeUndefined()
  })
})

describe('dimension verdicts', () => {
  const subkindOf = (property: string, value: string): string | null | undefined =>
    run([styleValue({ property, value })]).find((finding) => finding.rule === 'token.literal.dimension')?.subkind

  it('reports a value on the ramp, at info', () => {
    expect(subkindOf('border-radius', '8px')).toBe('onScale')
  })

  it('reports a value off the ramp', () => {
    expect(subkindOf('border-radius', '6px')).toBe('offScale')
  })

  it('names the neighbouring legal values', () => {
    const finding = run([styleValue({ property: 'border-radius', value: '6px' })])[0]

    expect(finding?.why).toContain('4 и 8')
  })

  it('says nothing about layout, where no token could ever be the answer', () => {
    expect(subkindOf('min-width', '480px')).toBeUndefined()
    expect(subkindOf('margin-bottom', '13px')).toBeUndefined()
    expect(subkindOf('width', '100%')).toBeUndefined()
  })

  it('ignores a zero', () => {
    expect(subkindOf('padding', '0')).toBeUndefined()
  })

  it('splits a shorthand into one finding per length', () => {
    const findings = run([styleValue({ property: 'padding', value: '11px 13px' })])

    expect(findings.map((finding) => finding.actual)).toEqual(['11px', '13px'])
  })
})

describe('style override policy', () => {
  const kitClass = (property: string, options: Partial<StyleValue> = {}) =>
    styleValue({
      property,
      value: '1px',
      appliedTo: { kind: 'kit-component', name: 'Button', slot: null },
      ...options,
    })

  const overrideRules = (values: readonly StyleValue[]): string[] =>
    run(values)
      .filter((finding) => finding.category === 'override')
      .map((finding) => finding.rule)

  it('leaves layout alone — it is the parent’s business', () => {
    expect(overrideRules([kitClass('margin-top'), kitClass('width'), kitClass('flex')])).toEqual([])
  })

  it('warns about repainting', () => {
    expect(overrideRules([kitClass('background', { value: '#ffffff' })])).toEqual(['style.override.repaint'])
  })

  it('treats internal spacing as a hint that the wrong size was picked', () => {
    expect(overrideRules([kitClass('padding', { value: '11px' })])).toEqual(['style.override.size'])
  })

  it('reports !important on its own, without also reporting the repaint', () => {
    expect(overrideRules([kitClass('background', { value: '#ffffff', important: true })])).toEqual([
      'style.override.important',
    ])
  })

  it('reports a private slot even when the property is pure layout', () => {
    // The layout exemption is about styling a component's public surface. A private slot
    // gets renamed without deprecation, so a margin on it breaks just as loudly.
    expect(
      overrideRules([
        kitClass('gap', { appliedTo: { kind: 'kit-component', name: 'Button', slot: 'contentContainer' } }),
      ]),
    ).toEqual(['style.override.inner'])
  })

  it('collapses several repainted properties in one class into one finding', () => {
    const findings = run([
      kitClass('background', { value: '#ffffff', line: 2 }),
      kitClass('border-radius', { value: '3px', line: 3 }),
    ]).filter((finding) => finding.category === 'override')

    expect(findings).toHaveLength(1)
    expect(findings[0]?.line).toBe(2)
    expect(findings[0]?.why).toContain('background, border-radius')
  })

  it('says nothing about a class that never reaches a kit component', () => {
    expect(overrideRules([styleValue({ property: 'background', value: '#ffffff' })])).toEqual([])
  })
})

describe('prop.invalid suggestions', () => {
  const element = (props: Record<string, string>) => ({
    name: 'Button',
    resolvedFrom: '@sds-eng/base',
    kitComponent: 'Button',
    props,
    propLines: Object.fromEntries(Object.keys(props).map((key) => [key, 1])),
    propExpressions: {},
    eventHandlers: [],
    keysHandled: [],
    hasTextChild: false,
    styleRefs: [],
    hasInlineStyle: false,
    file: 'src/a.tsx',
    line: 1,
    column: 1,
  })

  const findingFor = (props: Record<string, string>) =>
    run([], { jsxElements: [element(props)], files: ['src/a.tsx'] }).find((finding) => finding.rule === 'prop.invalid')

  it('maps a known synonym and offers to apply it', () => {
    const finding = findingFor({ view: 'danger' })

    expect(finding?.expected?.value).toBe('view="negative"')
    expect(finding?.autoFixable).toBe(true)
  })

  it('suggests the nearest legal size but refuses to apply a guess', () => {
    const finding = findingFor({ size: 'xl' })

    expect(finding?.expected?.value).toBe('size="md"')
    expect(finding?.autoFixable).toBe(false)
  })

  it('lists the legal values in the explanation', () => {
    expect(findingFor({ view: 'ghost' })?.why).toContain('primary, secondary, negative')
  })

  it('says nothing about a legal value', () => {
    expect(findingFor({ view: 'primary' })).toBeUndefined()
  })

  it('says nothing about a prop the kit does not constrain', () => {
    expect(findingFor({ id: 'submit' })).toBeUndefined()
  })
})

describe('buildSnippet', () => {
  const finding = (overrides: Partial<RawFinding> = {}): RawFinding => ({
    rule: 'token.literal.color',
    subkind: 'exact',
    category: 'token',
    severity: 'error',
    confidence: 1,
    file: 'src/a.scss',
    line: 3,
    column: 3,
    actual: '#ff1f78',
    expected: null,
    why: '',
    note: null,
    rootCause: null,
    appliedTo: null,
    autoFixable: true,
    needsAgent: false,
    candidates: [],
    impactKey: 'x',
    replaceWith: 'var(--x)',
    ...overrides,
  })

  const lines = ['.a {', '  padding: 8px;', '  color: #ff1f78;', '  margin: 0;', '}']

  it('centres the window on the finding', () => {
    const snippet = buildSnippet(finding(), lines)

    expect(snippet.highlightLine).toBe(3)
    expect(snippet.startLine).toBe(1)
    expect(snippet.before.split('\n')).toHaveLength(5)
  })

  it('applies the fix on the affected line and nowhere else', () => {
    const snippet = buildSnippet(finding(), lines)

    expect(snippet.after).toContain('color: var(--x);')
    expect(snippet.after).toContain('padding: 8px;')
  })

  it('offers no after when there is no fix', () => {
    expect(buildSnippet(finding({ replaceWith: null }), lines).after).toBeNull()
  })

  it('offers no after when the value is not on the line it claims', () => {
    expect(buildSnippet(finding({ line: 2 }), lines).after).toBeNull()
  })

  it('copes with a missing source', () => {
    expect(buildSnippet(finding(), undefined)).toEqual({ before: '', after: null, highlightLine: 1, startLine: 3 })
  })

  it('clamps at the start of a file', () => {
    const snippet = buildSnippet(finding({ line: 1 }), lines)

    expect(snippet.startLine).toBe(1)
    expect(snippet.highlightLine).toBe(1)
  })
})

describe('finding identity', () => {
  it('numbers findings in source order', () => {
    const findings = run([
      styleValue({ property: 'color', value: '#ff1f78', line: 9 }),
      styleValue({ property: 'color', value: '#2969e3', line: 2 }),
    ])

    expect(findings.map((finding) => [finding.id, finding.line])).toEqual([
      ['f_0001', 2],
      ['f_0002', 9],
    ])
  })

  it('counts occurrences of the same value across the project', () => {
    const findings = run([
      styleValue({ property: 'color', value: '#ff1f78', line: 1 }),
      styleValue({ property: 'background', value: '#ff1f78', line: 2, file: 'src/b.scss' }),
    ])

    expect(findings[0]?.impact).toEqual({ occurrences: 2, files: 2 })
  })
})
