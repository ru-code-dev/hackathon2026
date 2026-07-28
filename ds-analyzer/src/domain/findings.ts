import { z } from 'zod'

import { limitationSchema } from './profile.js'

/**
 * Wire contract for `ui-analyzer/findings.json` and its companions (architecture.md §6).
 *
 * One shape for every rule. A dashboard that had to special-case each rule would need
 * changing every time a rule is added, and the interesting rules are exactly the ones
 * added last.
 *
 * Three fields deserve their reasoning stated, because they are what makes the report
 * actionable rather than merely correct:
 *
 *  - `expected` is `null` when the kit genuinely offers nothing. Inventing a suggestion
 *    is worse than admitting there is none — it sends people to a token that does not fit.
 *  - `impact` carries occurrence counts so a deviation repeated forty times outranks a
 *    unique one. Severity alone sorts badly.
 *  - `rootCause` points at the declaration to fix when the finding is a symptom, so a Sass
 *    variable used in fourteen places reads as one problem.
 */

export const severitySchema = z.enum(['error', 'warning', 'info', 'candidate'])

export const findingCategorySchema = z.enum([
  'token',
  'typography',
  'font',
  'api',
  'override',
  'component',
  'icon',
  'a11y',
])

/**
 * Accessibility facet, present only on findings that carry one.
 *
 * A nested nullable object rather than three flat fields: `pattern` is meaningless on a
 * colour literal, and widening the universal shape with one rule family's vocabulary is
 * how a wire contract turns into a junk drawer. Grouping also lets the facet grow without
 * touching `Finding` again.
 */
export const a11ySchema = z.object({
  /** WCAG success criteria the finding violates, e.g. `['1.4.3']`. Empty when none applies. */
  wcag: z.array(z.string()),
  /** APG pattern slug for pattern-conformance findings, e.g. `tabs`; `null` otherwise. */
  pattern: z.string().nullable(),
  /** What the user actually loses, in one sentence — not a restatement of the rule. */
  impact: z.string().min(1),
})

export const expectedSchema = z.object({
  /** Token id, e.g. `sys.Border.borderAccent`. */
  token: z.string().nullable(),
  /** CSS custom property for `token`, ready to paste. */
  cssVar: z.string().nullable(),
  /** Kit component name, for `component.*` findings. */
  component: z.string().nullable(),
  /** The replacement string itself, in the syntax of the file it belongs to. */
  value: z.string(),
})

export const candidateSchema = z.object({
  component: z.string(),
  score: z.number(),
  /** Human-readable evidence, computed deterministically — not model output. */
  reasons: z.array(z.string()),
})

export const snippetSchema = z.object({
  /** Source lines around the finding, joined with newlines. */
  before: z.string(),
  /** `before` with the fix applied; `null` when no fix is known. */
  after: z.string().nullable(),
  /** 1-based line within `before` that the finding sits on. */
  highlightLine: z.number().int().positive(),
  /** Absolute line number of the first line of `before`. */
  startLine: z.number().int().positive(),
})

export const findingSchema = z.object({
  /** Stable within a run, derived from the finding's own content so links survive reruns. */
  id: z.string().min(1),
  rule: z.string().min(1),
  /** Sub-classification within a rule, e.g. `exact` / `near` / `shade` / `foreign`. */
  subkind: z.string().nullable(),
  category: findingCategorySchema,
  severity: severitySchema,
  /** 0–1. Below 0.75 the AI stage runs adversarial verification. */
  confidence: z.number().min(0).max(1),

  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),

  snippet: snippetSchema,

  /** What is in the code. */
  actual: z.string(),
  expected: expectedSchema.nullable(),

  /** One sentence naming the consequence, not just the rule. */
  why: z.string().min(1),
  /** A caveat the reader must see before applying the fix. */
  note: z.string().nullable(),

  /** Declaration to repair when this finding is a symptom of one. */
  rootCause: z.object({ file: z.string(), line: z.number().int().positive(), name: z.string() }).nullable(),

  /** Kit component this declaration lands on, when it lands on one. */
  appliedTo: z.object({ component: z.string(), slot: z.string().nullable() }).nullable(),

  /** Accessibility consequence, for the rules and screens that reason about it. */
  a11y: a11ySchema.nullable(),

  autoFixable: z.boolean(),
  needsAgent: z.boolean(),

  candidates: z.array(candidateSchema),

  impact: z.object({
    /** How many findings across the project share this rule and value. */
    occurrences: z.number().int().positive(),
    files: z.number().int().positive(),
  }),

  /**
   * Groups occurrences of one underlying decision: findings share a key when fixing one
   * teaches you how to fix the rest. The dashboard's problem view folds on it.
   */
  impactKey: z.string().min(1),
})

export const usageSchema = z.object({
  /** Per kit component: how much it is used and how much it is fought with. */
  components: z.array(
    z.object({
      name: z.string(),
      usages: z.number().int().nonnegative(),
      files: z.number().int().nonnegative(),
      findings: z.number().int().nonnegative(),
      overrides: z.number().int().nonnegative(),
      /** Prop → value → count, showing which variants are actually needed. */
      props: z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())),
    }),
  ),
  /** Kit components never used anywhere. */
  unusedComponents: z.array(z.string()),
  /** Non-kit component elements, ranked by how often they appear. */
  foreignComponents: z.array(
    z.object({
      name: z.string(),
      usages: z.number().int().nonnegative(),
      /** Declared inside the project (its code is on disk) rather than imported from a package. */
      local: z.boolean(),
      /** Most frequent import specifier the element resolves from; `null` when declared in place. */
      source: z.string().nullable(),
    }),
  ),
  /**
   * Locally declared components worth the design-system team's attention: reused ones,
   * ones that look like a kit component by name, and inline-SVG icons.
   *
   * The verdict is a deterministic heuristic (name similarity, reuse, composition) — the
   * honest precursor of the M5 scorer. It says "worth checking", never "is a duplicate".
   */
  customComponents: z.array(
    z.object({
      name: z.string(),
      file: z.string(),
      line: z.number().int().positive(),
      usages: z.number().int().nonnegative(),
      files: z.number().int().nonnegative(),
      props: z.array(z.string()),
      kitComponentsUsed: z.array(z.string()),
      hasInlineSvg: z.boolean(),
      /** First lines of the declaration, for the side-by-side view in the report. */
      snippet: z.string(),
      /** `kit-like`: resembles a kit component · `kit-candidate`: reused, kit has nothing like it · `local`: neither. */
      verdict: z.enum(['kit-like', 'kit-candidate', 'local']),
      nameMatch: z.object({ component: z.string(), kind: z.enum(['exact', 'contains', 'similar']) }).nullable(),
    }),
  ),
  /** Token id → how often it is referenced correctly through `var()`. */
  tokenUsage: z.record(z.string(), z.number().int().nonnegative()),
})

export const summarySchema = z.object({
  /** 0–100. The formula is published alongside the number. */
  healthScore: z.number().int().min(0).max(100),
  healthFormula: z.string(),
  /** Share of component elements that come from the kit. */
  adoption: z.number().min(0).max(1),
  /** Share of style values expressed through tokens rather than literals. */
  tokenCoverage: z.number().min(0).max(1),
  files: z.object({
    scanned: z.number().int().nonnegative(),
    clean: z.number().int().nonnegative(),
  }),
  findings: z.object({
    total: z.number().int().nonnegative(),
    bySeverity: z.record(severitySchema, z.number().int().nonnegative()),
    byRule: z.record(z.string(), z.number().int().nonnegative()),
    byCategory: z.record(findingCategorySchema, z.number().int().nonnegative()),
    autoFixable: z.number().int().nonnegative(),
    needsAgent: z.number().int().nonnegative(),
  }),
  /** Things that went right, so the report is worth opening twice. */
  positives: z.array(z.object({ label: z.string(), detail: z.string() })),
  /**
   * Colours found in the project that match a `ref` token but have no `sys` role for the
   * property they are used on — a gap in the kit rather than a mistake in the project.
   */
  kitGaps: z.array(
    z.object({ value: z.string(), token: z.string(), role: z.string(), occurrences: z.number().int().positive() }),
  ),
  limitations: z.array(limitationSchema),
})

export const analysisArtifactSchema = z.object({
  $schema: z.literal('ds-analyzer/analysis@1'),
  findings: z.array(findingSchema),
  usage: usageSchema,
  summary: summarySchema,
})

export type Severity = z.infer<typeof severitySchema>
export type FindingCategory = z.infer<typeof findingCategorySchema>
export type A11yFacet = z.infer<typeof a11ySchema>
export type Expected = z.infer<typeof expectedSchema>
export type Candidate = z.infer<typeof candidateSchema>
export type Snippet = z.infer<typeof snippetSchema>
export type Finding = z.infer<typeof findingSchema>
export type Usage = z.infer<typeof usageSchema>
export type Summary = z.infer<typeof summarySchema>
export type AnalysisArtifact = z.infer<typeof analysisArtifactSchema>
