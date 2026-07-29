import type { Finding, Summary, Usage } from '../domain/findings.js'

/**
 * Hand-rolled minimal artifacts for the skill-layer tests.
 *
 * Deliberately built through factories with overrides, so a test states only what it is
 * about — a schema change breaks the factory once, not every test.
 */

export const finding = (overrides: Partial<Finding> & { file: string; line: number }): Finding => ({
  id: `f_${overrides.file}_${String(overrides.line)}`,
  rule: 'token.literal.color',
  subkind: 'exact',
  category: 'token',
  severity: 'info',
  confidence: 1,
  column: 3,
  snippet: {
    before: 'a\nb\nc',
    after: 'a\nB\nc',
    highlightLine: 2,
    startLine: Math.max(1, overrides.line - 1),
  },
  actual: '#123456',
  expected: { token: 'sys.Color.accent', cssVar: '--sds-accent', component: null, value: 'var(--sds-accent)' },
  why: 'причина',
  note: null,
  rootCause: null,
  appliedTo: null,
  a11y: null,
  autoFixable: true,
  needsAgent: false,
  candidates: [],
  impact: { occurrences: 1, files: 1 },
  impactKey: 'token.literal.color:#123456',
  ...overrides,
})

export const customComponent = (
  overrides: Partial<Usage['customComponents'][number]> & { name: string; file: string },
): Usage['customComponents'][number] => ({
  line: 1,
  usages: 3,
  files: 2,
  props: ['size'],
  kitComponentsUsed: [],
  hasInlineSvg: false,
  snippet: 'export const X = () => null',
  verdict: 'kit-like',
  nameMatch: null,
  tokenRefs: 0,
  hardcodedValues: 0,
  tokenVerdict: 'no-styles',
  ...overrides,
})

export const usage = (overrides?: Partial<Usage>): Usage => ({
  components: [],
  unusedComponents: [],
  foreignComponents: [],
  customComponents: [],
  elementBreakdown: {
    total: 55,
    kit: 42,
    kitClean: 29,
    customTokens: 0,
    customMixed: 1,
    customHardcode: 8,
    customUnstyled: 3,
    foreign: 1,
  },
  tokenUsage: {},
  ...overrides,
})

export const summary = (overrides?: Partial<Summary>): Summary => ({
  healthScore: 61,
  healthFormula: '50% чистота · 30% внедрение · 20% токены',
  adoption: 0.76,
  tokenCoverage: 0.61,
  files: { scanned: 20, clean: 8 },
  findings: {
    total: 3,
    bySeverity: { error: 1, warning: 1, info: 1, candidate: 0 },
    byRule: { 'token.literal.color': 3 },
    byCategory: { token: 3, typography: 0, font: 0, api: 0, override: 0, component: 0, icon: 0, a11y: 0 },
    autoFixable: 2,
    needsAgent: 0,
  },
  positives: [],
  kitGaps: [],
  limitations: [],
  ...overrides,
})
