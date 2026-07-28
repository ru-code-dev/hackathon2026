import { describe, expect, it } from 'vitest'

import type { Finding, Summary } from '../../dashboard/src/contract.js'
import {
  A11Y_CHECK_COUNT,
  A11Y_SECTIONS,
  contrastPair,
  groupA11y,
  notCheckedFor,
  sectionsFor,
} from '../../dashboard/src/lib/a11y.js'
import { findingCategorySchema } from '../domain/findings.js'
import { RULES } from '../rules/index.js'
import { jsxA11yRuleIds } from '../scanner/collectors/jsx-a11y-lint.js'

/**
 * The arrangement behind the accessibility screen.
 *
 * Three of the decisions it makes can be wrong without the page looking broken, and each
 * one is a way for the report to mislead rather than merely to look untidy: findings that
 * do not fold, a rule that falls out of every section and so out of the report, and an
 * unrun check presented next to an empty list as though it were a pass.
 */

const finding = (overrides: Partial<Finding> & Pick<Finding, 'rule' | 'impactKey'>): Finding => ({
  id: `${overrides.rule}-${String(overrides.line ?? 1)}`,
  subkind: null,
  category: 'a11y',
  severity: 'error',
  confidence: 1,
  file: 'src/W.tsx',
  line: 1,
  column: 1,
  snippet: { before: '', after: null, highlightLine: 1, startLine: 1, beforeHtml: '', afterHtml: null },
  actual: 'x',
  expected: null,
  why: 'потому что',
  note: null,
  rootCause: null,
  appliedTo: null,
  a11y: { wcag: ['2.1.1'], pattern: null, impact: 'нечем управлять', fix: 'возьмите Tabs' },
  autoFixable: false,
  needsAgent: false,
  candidates: [],
  impact: { occurrences: 1, files: 1 },
  ...overrides,
})

describe('groupA11y', () => {
  it('folds the plugin’s rule into one group per plugin rule, not one per occurrence', () => {
    // `a11y.lint` is a single rule carrying most of the findings. Ungrouped it renders as
    // fifty identical-looking rows; folded on `impactKey` it is the handful of distinct
    // problems it actually is.
    const groups = groupA11y([
      finding({ rule: 'a11y.lint', subkind: 'alt-text', impactKey: 'a11y.lint:alt-text', line: 3 }),
      finding({ rule: 'a11y.lint', subkind: 'alt-text', impactKey: 'a11y.lint:alt-text', line: 9 }),
      finding({ rule: 'a11y.lint', subkind: 'no-autofocus', impactKey: 'a11y.lint:no-autofocus', line: 4 }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.occurrences).sort()).toStrictEqual([1, 2])
  })

  it('leads with the worst occurrence, not the first', () => {
    const groups = groupA11y([
      finding({ rule: 'a11y.lint', impactKey: 'k', severity: 'info', line: 1 }),
      finding({ rule: 'a11y.lint', impactKey: 'k', severity: 'error', line: 7 }),
    ])

    expect(groups[0]?.severity).toBe('error')
  })

  it('ranks by total consequence, so a repeated error outranks a one-off', () => {
    const groups = groupA11y([
      finding({ rule: 'a11y.lint', impactKey: 'rare', severity: 'error', line: 1 }),
      ...Array.from({ length: 5 }, (_, index) =>
        finding({ rule: 'a11y.lint', impactKey: 'common', severity: 'warning', line: index + 10 }),
      ),
    ])

    expect(groups.map((group) => group.key)).toStrictEqual(['common', 'rare'])
  })

  it('carries the consequence and the remedy up to the group', () => {
    // The screen puts `impact` in the heading and `fix` in its own box. Losing either in
    // the fold turns a work plan back into a list of complaints.
    const [group] = groupA11y([finding({ rule: 'a11y.pattern.keyboard', impactKey: 'k' })])

    expect(group?.impact).toBe('нечем управлять')
    expect(group?.fix).toBe('возьмите Tabs')
    expect(group?.wcag).toStrictEqual(['2.1.1'])
  })

  it('unions the criteria across occurrences', () => {
    const [group] = groupA11y([
      finding({ rule: 'a11y.lint', impactKey: 'k', line: 1 }),
      finding({
        rule: 'a11y.lint',
        impactKey: 'k',
        line: 2,
        a11y: { wcag: ['4.1.2', '2.1.1'], pattern: null, impact: 'i', fix: null },
      }),
    ])

    expect(group?.wcag).toStrictEqual(['2.1.1', '4.1.2'])
  })

  it('falls back to the explanation rather than rendering a blank heading', () => {
    const [group] = groupA11y([finding({ rule: 'a11y.lint', impactKey: 'k', a11y: null })])

    expect(group?.impact).toBe('потому что')
    expect(group?.fix).toBeNull()
  })
})

describe('sectionsFor', () => {
  it('places every accessibility rule in the registry into a section', () => {
    // The regression this catches: a rule is added, ships findings, and never appears on
    // the screen because nobody listed it. It would look exactly like a clean codebase.
    const registered = RULES.filter((rule) => rule.category === 'a11y')
      .map((rule) => rule.id)
      .sort()
    const claimed = new Set(A11Y_SECTIONS.flatMap((section) => section.rules))

    expect(registered.filter((id) => !claimed.has(id))).toStrictEqual([])
    // And the category itself still exists, so this test cannot pass by matching nothing.
    expect(findingCategorySchema.options).toContain('a11y')
    expect(registered.length).toBeGreaterThan(0)
  })

  it('advertises the number of checks that actually ship', () => {
    // The screen's opening sentence is a claim about coverage. Superseding one plugin rule
    // silently makes it false, and a number nobody can check is worse than no number.
    const own = RULES.filter((rule) => rule.category === 'a11y' && rule.id !== 'a11y.lint')

    expect(A11Y_CHECK_COUNT).toBe(own.length + jsxA11yRuleIds().length)
  })

  it('does not invent an empty catch-all section', () => {
    const sections = sectionsFor(groupA11y([finding({ rule: 'a11y.contrast.text', impactKey: 'k' })]))

    expect(sections.map((entry) => entry.section.id)).toStrictEqual(A11Y_SECTIONS.map((section) => section.id))
  })

  it('shows a rule no section claims rather than dropping it', () => {
    const sections = sectionsFor(groupA11y([finding({ rule: 'a11y.some.future.rule', impactKey: 'k' })]))
    const other = sections.find((entry) => entry.section.id === 'other')

    expect(other?.groups).toHaveLength(1)
  })

  it('reads keyboard first and the plugin’s long list last', () => {
    expect(A11Y_SECTIONS[0]?.id).toBe('keyboard')
    expect(A11Y_SECTIONS.at(-1)?.id).toBe('lint')
  })
})

describe('notCheckedFor', () => {
  const limitation = (reason: Summary['limitations'][number]['reason']): Summary['limitations'][number] => ({
    file: 'src/W.tsx',
    line: 1,
    reason,
    detail: 'd',
  })

  it('keeps the reasons that mean a check did not run', () => {
    // The one error this screen must never make. An empty section next to an unrun check
    // reads as approval, so both reasons have to reach the reader.
    expect(
      notCheckedFor([
        limitation('spec-unavailable'),
        limitation('unsupported-syntax'),
        limitation('dynamic-styles'),
        limitation('parse-error'),
      ]).map((item) => item.reason),
    ).toStrictEqual(['spec-unavailable', 'unsupported-syntax'])
  })
})

describe('contrastPair', () => {
  it('splits the pair the contrast rule wrote', () => {
    expect(contrastPair('#ffffff на #00d4aa')).toStrictEqual(['#ffffff', '#00d4aa'])
    expect(contrastPair('rgb(255,255,255) на hsl(0 0% 0%)')).toStrictEqual(['rgb(255,255,255)', 'hsl(0 0% 0%)'])
  })

  it('refuses to paint a token reference', () => {
    // `var(--sds-eng-…)` resolves against this dashboard's theme, not the audited project's,
    // so a swatch built from it would show a confident measurement of the wrong colours.
    expect(contrastPair('var(--sds-eng-Text-textPrimary) на #ffffff')).toBeNull()
    expect(contrastPair('#ffffff')).toBeNull()
  })
})
