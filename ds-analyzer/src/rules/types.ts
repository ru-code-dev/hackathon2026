import type { Expected, FindingCategory, Severity } from '../domain/findings.js'
import type { Declaration, ImportRecord, JsxElement, Observations, StyleValue } from '../domain/observations.js'
import type { ProjectProfile } from '../domain/profile.js'
import type { KitSpec } from '../kit/spec.js'

/**
 * Stage C contracts.
 *
 * A rule is a pure function from facts to findings. It receives no filesystem, no parser
 * and no network — everything it may know is in {@link RuleContext}. That constraint is
 * what makes the rules testable in isolation and what keeps a syntax change from rippling
 * past the collectors.
 */

/**
 * What a rule emits.
 *
 * Deliberately smaller than a `Finding`: identity, source snippets and occurrence counts
 * are cross-cutting and are attached once by the runner, so no rule has to remember to
 * compute them and no two rules can compute them differently.
 */
export interface RawFinding {
  readonly rule: string
  readonly subkind: string | null
  readonly category: FindingCategory
  readonly severity: Severity
  readonly confidence: number

  readonly file: string
  readonly line: number
  readonly column: number

  readonly actual: string
  readonly expected: Expected | null

  readonly why: string
  readonly note: string | null

  readonly rootCause: { readonly file: string; readonly line: number; readonly name: string } | null
  readonly appliedTo: { readonly component: string; readonly slot: string | null } | null

  readonly autoFixable: boolean
  readonly needsAgent: boolean

  readonly candidates: { readonly component: string; readonly score: number; readonly reasons: string[] }[]

  /**
   * Groups occurrences of the same underlying problem for the `impact` counters.
   * Two findings share a key when fixing one teaches you how to fix the other.
   */
  readonly impactKey: string

  /**
   * Text to substitute for {@link RawFinding.actual} on the affected line when building
   * the `after` snippet. `null` when the fix is not a simple in-line replacement.
   */
  readonly replaceWith: string | null
}

/** Frequency of raw pixel values across the project, for properties the kit has no scale for. */
export interface FrequencyIndex {
  /** Pixel value → number of occurrences. */
  readonly counts: ReadonlyMap<number, number>
  readonly total: number
  /** `true` when the value is rare enough against the project's own habits to look magic. */
  readonly isMagic: (px: number) => boolean
}

export interface RuleContext {
  readonly kit: KitSpec
  readonly profile: ProjectProfile
  readonly observations: Observations
  /** File contents, project-relative, for snippet extraction. */
  readonly sources: ReadonlyMap<string, readonly string[]>
  readonly spacing: FrequencyIndex
  /** JSX elements grouped by file, so element rules do not rescan. */
  readonly elementsByFile: ReadonlyMap<string, readonly JsxElement[]>
}

export interface Rule {
  readonly id: string
  readonly category: FindingCategory
  /** One line, shown in the dashboard's rule list. */
  readonly description: string
  readonly run: (context: RuleContext) => RawFinding[]
}

/** A rule that walks style declarations. */
export type StyleRule = (styleValue: StyleValue, context: RuleContext) => RawFinding[]

/** A rule that walks rendered elements. */
export type ElementRule = (element: JsxElement, context: RuleContext) => RawFinding[]

/** A rule that walks import statements. */
export type ImportRule = (record: ImportRecord, context: RuleContext) => RawFinding[]

/** A rule that walks local component declarations. */
export type DeclarationRule = (declaration: Declaration, context: RuleContext) => RawFinding[]

/** Lifts a per-declaration rule to a whole-project rule. */
export const overStyleValues =
  (rule: StyleRule) =>
  (context: RuleContext): RawFinding[] =>
    context.observations.styleValues.flatMap((styleValue) => rule(styleValue, context))

/** Lifts a per-element rule to a whole-project rule. */
export const overElements =
  (rule: ElementRule) =>
  (context: RuleContext): RawFinding[] =>
    context.observations.jsxElements.flatMap((element) => rule(element, context))

/** Lifts a per-import rule to a whole-project rule. */
export const overImports =
  (rule: ImportRule) =>
  (context: RuleContext): RawFinding[] =>
    context.observations.imports.flatMap((record) => rule(record, context))

/** Observations that carry no design decision and every style rule must skip. */
export const isAnalysableStyleValue = (styleValue: Pick<Observations['styleValues'][number], 'value'>): boolean =>
  styleValue.value.trim().length > 0
