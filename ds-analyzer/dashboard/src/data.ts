/**
 * The payload the generator injects, and the types the screens read it through.
 *
 * Deliberately hand-written rather than shared with the analyzer's zod schemas: the
 * dashboard is a separate build with no dependency on the analyzer, which is what lets it
 * be built once and reused for every project. The shapes are kept in step by the
 * generator, which is the only thing that writes this payload.
 */

export type Severity = 'error' | 'warning' | 'info' | 'candidate'

export type FindingCategory = 'token' | 'typography' | 'font' | 'api' | 'override' | 'component' | 'icon'

export interface Expected {
  token: string | null
  cssVar: string | null
  component: string | null
  value: string
}

export interface Snippet {
  before: string
  after: string | null
  highlightLine: number
  startLine: number
  /** Pre-rendered by Shiki at generation time; zero highlighting cost in the browser. */
  beforeHtml: string
  afterHtml: string | null
}

export interface Finding {
  id: string
  rule: string
  subkind: string | null
  category: FindingCategory
  severity: Severity
  confidence: number
  file: string
  line: number
  column: number
  snippet: Snippet
  actual: string
  expected: Expected | null
  why: string
  note: string | null
  rootCause: { file: string; line: number; name: string } | null
  appliedTo: { component: string; slot: string | null } | null
  autoFixable: boolean
  needsAgent: boolean
  candidates: { component: string; score: number; reasons: string[] }[]
  impact: { occurrences: number; files: number }
}

export interface Usage {
  components: {
    name: string
    usages: number
    files: number
    findings: number
    overrides: number
    props: Record<string, Record<string, number>>
  }[]
  unusedComponents: string[]
  foreignComponents: { name: string; usages: number }[]
  tokenUsage: Record<string, number>
}

export interface Summary {
  healthScore: number
  healthFormula: string
  adoption: number
  tokenCoverage: number
  files: { scanned: number; clean: number }
  findings: {
    total: number
    bySeverity: Record<Severity, number>
    byRule: Record<string, number>
    byCategory: Record<FindingCategory, number>
    autoFixable: number
    needsAgent: number
  }
  positives: { label: string; detail: string }[]
  kitGaps: { value: string; token: string; role: string; occurrences: number }[]
  limitations: { file: string; line: number | null; reason: string; detail: string }[]
}

export interface Payload {
  project: { name: string | null; root: string; kitVersion: string | null; usesKit: boolean }
  generatedAt: string
  summary: Summary
  usage: Usage
  findings: Finding[]
  /** Rule id → one-line description, for the filter panel. */
  ruleDescriptions: Record<string, string>
}

/**
 * Reads the injected payload.
 *
 * Throws rather than rendering an empty shell: an un-substituted template is a generator
 * bug, and a dashboard that silently shows "0 findings" for it would be the most
 * misleading possible failure.
 */
export const readPayload = (): Payload => {
  const element = document.getElementById('ds-data')

  if (!element?.textContent) {
    throw new Error('No analysis payload found. This file is the unsubstituted template.')
  }

  const parsed: unknown = JSON.parse(element.textContent)

  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('The analysis payload is empty. Regenerate the report.')
  }

  return parsed as Payload
}

export const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'info', 'candidate']

export const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Ошибка',
  warning: 'Предупреждение',
  info: 'Заметка',
  candidate: 'Кандидат',
}

export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  token: 'Токены',
  typography: 'Типографика',
  font: 'Шрифты',
  api: 'API кита',
  override: 'Переопределения',
  component: 'Компоненты',
  icon: 'Иконки',
}
