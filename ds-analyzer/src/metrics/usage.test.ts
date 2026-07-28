import { describe, expect, it } from 'vitest'

import { resolvePaths } from '../config.js'
import type { Declaration, ImportRecord, JsxElement, Observations, StyleValue } from '../domain/observations.js'
import { OBSERVATIONS_SCHEMA_ID } from '../domain/observations.js'
import type { Finding } from '../domain/findings.js'
import { KitSpec } from '../kit/spec.js'
import { buildUsage } from './usage.js'

/**
 * The custom-component heuristic is the part of `buildUsage` a wrong answer actively
 * misleads with: a false `kit-like` sends someone hunting for a duplicate that is not
 * there, a missed one hides a real fork. Everything else in the builder is counting.
 */

const kit = KitSpec.load(resolvePaths().artifactsDir)

const element = (overrides: Partial<JsxElement>): JsxElement => ({
  name: 'div',
  resolvedFrom: null,
  kitComponent: null,
  props: {},
  propExpressions: {},
  eventHandlers: [],
  keysHandled: [],
  content: { text: false, expression: false, component: false },
  hasLabelAncestor: false,
  propLines: {},
  styleRefs: [],
  hasInlineStyle: false,
  file: 'src/App.tsx',
  line: 1,
  column: 1,
  ...overrides,
})

const declaration = (overrides: Partial<Declaration>): Declaration => ({
  name: 'Widget',
  kind: 'component',
  props: [],
  ariaRoles: [],
  ariaAttributes: [],
  nativeTags: [],
  jsxShape: [],
  kitComponentsUsed: [],
  cssProperties: [],
  hasInlineSvg: false,
  eventHandlers: [],
  keysHandled: [],
  astSignature: [],
  elementCount: 1,
  file: 'src/Widget.tsx',
  line: 1,
  column: 1,
  ...overrides,
})

const observations = (partial: Partial<Observations>): Observations => ({
  $schema: OBSERVATIONS_SCHEMA_ID,
  styleValues: [],
  jsxElements: [],
  imports: [],
  reExports: [],
  declarations: [],
  lintMessages: [],
  files: [],
  limitations: [],
  ...partial,
})

const usageFor = (partial: Partial<Observations>, sources = new Map<string, readonly string[]>()) =>
  buildUsage(observations(partial), [], kit, sources)

describe('customComponents', () => {
  it('flags a local component whose name contains a kit name as kit-like', () => {
    const usage = usageFor({
      declarations: [declaration({ name: 'MyButton', file: 'src/MyButton.tsx' })],
      jsxElements: [element({ name: 'MyButton', file: 'src/App.tsx' })],
    })

    const custom = usage.customComponents.find((component) => component.name === 'MyButton')
    expect(custom?.verdict).toBe('kit-like')
    expect(custom?.nameMatch).toEqual({ component: 'Button', kind: 'contains' })
  })

  it('flags an exact name collision even when the component is barely used', () => {
    const usage = usageFor({
      declarations: [declaration({ name: 'Spinner', file: 'src/Spinner.tsx' })],
      jsxElements: [element({ name: 'Spinner' })],
    })

    expect(usage.customComponents[0]?.nameMatch).toEqual({ component: 'Spinner', kind: 'exact' })
  })

  it('promotes a reused component with no kit lookalike to kit-candidate', () => {
    const usage = usageFor({
      declarations: [declaration({ name: 'PriceSummary', file: 'src/PriceSummary.tsx' })],
      jsxElements: [
        element({ name: 'PriceSummary', file: 'src/a.tsx' }),
        element({ name: 'PriceSummary', file: 'src/a.tsx' }),
        element({ name: 'PriceSummary', file: 'src/b.tsx' }),
      ],
    })

    const custom = usage.customComponents.find((component) => component.name === 'PriceSummary')
    expect(custom?.verdict).toBe('kit-candidate')
    expect(custom?.nameMatch).toBeNull()
  })

  it('drops one-off feature components entirely', () => {
    const usage = usageFor({
      declarations: [declaration({ name: 'CheckoutScreen' })],
      jsxElements: [element({ name: 'CheckoutScreen' })],
    })

    expect(usage.customComponents).toHaveLength(0)
  })

  it('keeps an inline-svg component regardless of reuse — icons are always ds material', () => {
    const usage = usageFor({
      declarations: [declaration({ name: 'ArrowGlyph', hasInlineSvg: true })],
    })

    expect(usage.customComponents[0]?.verdict).toBe('local')
  })

  it('carries the declaration snippet from sources', () => {
    const usage = usageFor(
      {
        declarations: [declaration({ name: 'Spinner', file: 'src/Spinner.tsx', line: 2 })],
      },
      new Map([
        ['src/Spinner.tsx', ['import React from "react"', 'export const Spinner = () => {', '  return null', '}']],
      ]),
    )

    expect(usage.customComponents[0]?.snippet).toBe('export const Spinner = () => {\n  return null\n}')
  })
})

describe('foreignComponents origin', () => {
  it('separates locally declared components from third-party imports', () => {
    const usage = usageFor({
      declarations: [declaration({ name: 'Spinner', file: 'src/Spinner.tsx' })],
      jsxElements: [
        element({ name: 'Spinner' }),
        element({ name: 'DatePicker', resolvedFrom: 'antd' }),
        element({ name: 'DatePicker', resolvedFrom: 'antd' }),
      ],
    })

    expect(usage.foreignComponents).toEqual([
      { name: 'DatePicker', usages: 2, local: false, source: 'antd' },
      { name: 'Spinner', usages: 1, local: true, source: null },
    ])
  })
})

describe('token verdicts and the element breakdown', () => {
  const styleValue = (
    overrides: Partial<StyleValue> & Pick<StyleValue, 'file' | 'property' | 'value'>,
  ): StyleValue => ({
    authored: null,
    line: 3,
    column: 1,
    source: 'scss',
    selector: '.a',
    classNames: ['a'],
    important: false,
    dynamic: false,
    rootCause: null,
    appliedTo: null,
    ...overrides,
  })

  const hardcodeFinding = (file: string): Finding => ({
    id: 'f_0001',
    rule: 'token.literal.color',
    subkind: 'exact',
    category: 'token',
    severity: 'error',
    confidence: 1,
    file,
    line: 4,
    column: 3,
    snippet: { before: 'x', after: null, highlightLine: 1, startLine: 4 },
    actual: '#2969e3',
    expected: null,
    why: 'причина',
    note: null,
    rootCause: null,
    appliedTo: null,
    a11y: null,
    autoFixable: false,
    needsAgent: false,
    candidates: [],
    impact: { occurrences: 1, files: 1 },
    impactKey: 'k',
  })

  const styleImport = (from: string, to: string): ImportRecord => ({
    specifier: `./${to.split('/').pop() ?? ''}`,
    names: [],
    defaultImport: null,
    namespaceImport: null,
    typeOnly: false,
    resolution: { kind: 'relative', file: to },
    file: from,
    line: 1,
    column: 1,
  })

  it('classifies a component styled purely through kit tokens', () => {
    const usage = buildUsage(
      observations({
        declarations: [declaration({ name: 'Spinner', file: 'src/Spinner.tsx' })],
        styleValues: [
          styleValue({ file: 'src/Spinner.tsx', property: 'color', value: 'var(--sds-eng-Switch-shadow-disable)' }),
        ],
      }),
      [],
      kit,
      new Map(),
    )

    expect(usage.customComponents[0]?.tokenVerdict).toBe('tokens')
    expect(usage.customComponents[0]?.tokenRefs).toBe(1)
  })

  it('attributes hardcode living in an imported stylesheet to the component', () => {
    const usage = buildUsage(
      observations({
        declarations: [declaration({ name: 'Spinner', file: 'src/Spinner.tsx' })],
        imports: [styleImport('src/Spinner.tsx', 'src/spinner.module.scss')],
      }),
      [hardcodeFinding('src/spinner.module.scss')],
      kit,
      new Map(),
    )

    expect(usage.customComponents[0]?.tokenVerdict).toBe('hardcode')
    expect(usage.customComponents[0]?.hardcodedValues).toBe(1)
  })

  it('marks tokens and hardcode side by side as mixed', () => {
    const usage = buildUsage(
      observations({
        declarations: [declaration({ name: 'Spinner', file: 'src/Spinner.tsx' })],
        styleValues: [
          styleValue({ file: 'src/Spinner.tsx', property: 'color', value: 'var(--sds-eng-Switch-shadow-disable)' }),
        ],
      }),
      [hardcodeFinding('src/Spinner.tsx')],
      kit,
      new Map(),
    )

    expect(usage.customComponents[0]?.tokenVerdict).toBe('mixed')
  })

  it('closes the element breakdown to exactly 100%', () => {
    const usage = buildUsage(
      observations({
        declarations: [
          declaration({ name: 'Clean', file: 'src/Clean.tsx' }),
          declaration({ name: 'Dirty', file: 'src/Dirty.tsx' }),
        ],
        styleValues: [
          styleValue({ file: 'src/Clean.tsx', property: 'color', value: 'var(--sds-eng-Switch-shadow-disable)' }),
        ],
        jsxElements: [
          element({ name: 'Button', kitComponent: 'Button', resolvedFrom: '@sds-eng/base' }),
          element({ name: 'Clean' }),
          element({ name: 'Dirty' }),
          element({ name: 'DatePicker', resolvedFrom: 'antd' }),
          element({ name: 'div' }),
        ],
      }),
      [hardcodeFinding('src/Dirty.tsx')],
      kit,
      new Map(),
    )

    const breakdown = usage.elementBreakdown
    expect(breakdown.total).toBe(4)
    expect(breakdown.kit).toBe(1)
    expect(breakdown.kitClean).toBe(1)
    expect(breakdown.customTokens).toBe(1)
    expect(breakdown.customHardcode).toBe(1)
    expect(breakdown.foreign).toBe(1)
    expect(
      breakdown.kit +
        breakdown.customTokens +
        breakdown.customMixed +
        breakdown.customHardcode +
        breakdown.customUnstyled +
        breakdown.foreign,
    ).toBe(breakdown.total)
  })
})
