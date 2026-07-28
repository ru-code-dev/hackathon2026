import type { Finding } from '../domain/findings.js'
import type { Limitation } from '../domain/profile.js'
import { compareStrings } from '../shared/sort.js'
import { deprecatedApiRule, invalidPropRule } from './api/props.js'
import { bypassImportRule, doNotUseImportRule, internalImportRule } from './api/imports.js'
import { styleOverrideRule } from './api/overrides.js'
import { suppressedFocusRule } from './a11y/focus.js'
import { patternKeyboardRule } from './a11y/pattern-keyboard.js'
import { foreignIconPackRule, foreignSvgFileRule, inlineSvgRule } from './icons/icons.js'
import { invalidAriaRule, redundantRoleRule, requiredAriaRule } from './a11y/aria.js'
import { ariaRelationsRule } from './a11y/relations.js'
import { dialogFocusRule } from './a11y/dialog.js'
import { missingAccessibleNameRule } from './a11y/name.js'
import { textContrastRule } from './a11y/contrast.js'
import { jsxA11yLintRule } from './a11y/lint.js'
import { buildSnippet } from './snippet.js'
import { colorLiteralRule } from './tokens/color.js'
import { dimensionLiteralRule } from './tokens/dimension.js'
import { foreignFontRule } from './tokens/font.js'
import { tierViolationRule } from './tokens/tier.js'
import { partialTypographyRule } from './tokens/typography.js'
import type { RawFinding, Rule, RuleContext } from './types.js'

/**
 * The rule registry and the one place findings become findings.
 *
 * Identity, source context and occurrence counts are attached here rather than in the
 * rules. Every rule would otherwise have to remember to compute them, and any two rules
 * that computed them differently would produce a report that contradicts itself.
 *
 * Ordering is by source position, not by severity. The dashboard sorts for display; the
 * artifact is committed and diffed, so it has to be stable and human-readable in file
 * order.
 */

export const RULES: readonly Rule[] = [
  jsxA11yLintRule,
  colorLiteralRule,
  dimensionLiteralRule,
  partialTypographyRule,
  foreignFontRule,
  tierViolationRule,
  bypassImportRule,
  internalImportRule,
  doNotUseImportRule,
  invalidPropRule,
  deprecatedApiRule,
  styleOverrideRule,
  suppressedFocusRule,
  patternKeyboardRule,
  invalidAriaRule,
  requiredAriaRule,
  redundantRoleRule,
  ariaRelationsRule,
  dialogFocusRule,
  missingAccessibleNameRule,
  textContrastRule,
  inlineSvgRule,
  foreignSvgFileRule,
  foreignIconPackRule,
]

/** Stable, zero-padded so that lexical order matches numeric order in the dashboard. */
const findingId = (index: number): string => `f_${String(index + 1).padStart(4, '0')}`

const compareFindings = (left: RawFinding, right: RawFinding): number =>
  compareStrings(left.file, right.file) ||
  left.line - right.line ||
  left.column - right.column ||
  compareStrings(left.rule, right.rule) ||
  compareStrings(left.actual, right.actual)

export interface RunOptions {
  /** Rule ids switched off in `ds.config.json`. */
  readonly disabledRules?: ReadonlySet<string>
}

/** Everything the enabled rules declare they could not check. */
export const collectRuleLimitations = (context: RuleContext, options: RunOptions = {}): Limitation[] => {
  const disabled = options.disabledRules ?? new Set<string>()

  return RULES.filter((rule) => !disabled.has(rule.id)).flatMap((rule) => rule.limitations?.(context) ?? [])
}

/** Runs every enabled rule and materialises the results. */
export const runRules = (context: RuleContext, options: RunOptions = {}): Finding[] => {
  const disabled = options.disabledRules ?? new Set<string>()

  const raw = RULES.filter((rule) => !disabled.has(rule.id))
    .flatMap((rule) => rule.run(context))
    .filter((finding) => !disabled.has(finding.rule))
    .sort(compareFindings)

  // Occurrences are counted across the whole project so that a deviation repeated forty
  // times outranks a unique one, whatever their severities.
  const occurrences = new Map<string, { count: number; files: Set<string> }>()
  for (const finding of raw) {
    const entry = occurrences.get(finding.impactKey) ?? { count: 0, files: new Set<string>() }
    entry.count += 1
    entry.files.add(finding.file)
    occurrences.set(finding.impactKey, entry)
  }

  return raw.map((finding, index) => {
    const impact = occurrences.get(finding.impactKey) ?? { count: 1, files: new Set([finding.file]) }

    return {
      id: findingId(index),
      rule: finding.rule,
      subkind: finding.subkind,
      category: finding.category,
      severity: finding.severity,
      confidence: finding.confidence,
      file: finding.file,
      line: finding.line,
      column: finding.column,
      snippet: buildSnippet(finding, context.sources.get(finding.file)),
      actual: finding.actual,
      expected: finding.expected,
      why: finding.why,
      note: finding.note,
      rootCause: finding.rootCause,
      appliedTo: finding.appliedTo,
      a11y: finding.a11y ?? null,
      autoFixable: finding.autoFixable,
      needsAgent: finding.needsAgent,
      candidates: finding.candidates,
      impact: { occurrences: impact.count, files: impact.files.size },
      impactKey: finding.impactKey,
    }
  })
}
