import { z } from 'zod'

import { allocateShares } from '../../dashboard/src/lib/shares.js'
import type { Finding, Summary, Usage } from '../domain/findings.js'

/**
 * The compact machine report the Qwen skill reads instead of the real artifacts.
 *
 * The model driving the skill is assumed to be weak: it must never open findings.json
 * (megabytes) or recompute a percentage (it will get it wrong). So everything the skill's
 * report step needs is pre-chewed here — closed shares, grouped problems, counted fixes —
 * and the whole thing stays around two kilobytes.
 */

export const BRIEF_SCHEMA_ID = 'ds-analyzer/brief@1'

const TOP_PROBLEMS = 10
const TOP_CUSTOM_COMPONENTS = 5

/** Auto-fixes safe enough to commit without a human reading each one. */
export const isRecommendedFix = (finding: Finding): boolean =>
  finding.autoFixable && finding.confidence >= 0.9 && !finding.needsAgent && finding.snippet.after !== null

const SEVERITY_WEIGHT: Record<Finding['severity'], number> = { error: 100, warning: 10, info: 1, candidate: 0.5 }

export const briefSchema = z.object({
  $schema: z.literal(BRIEF_SCHEMA_ID),
  project: z.object({ name: z.string().nullable(), root: z.string() }),
  health: z.object({ score: z.number(), formula: z.string() }),
  totals: z.object({
    findings: z.number().int(),
    errors: z.number().int(),
    warnings: z.number().int(),
    info: z.number().int(),
    candidates: z.number().int(),
    /** Unique decisions: findings folded by impactKey. */
    decisions: z.number().int(),
    autoFixable: z.number().int(),
    a11y: z.number().int(),
  }),
  /** Integer percentages of component elements; sum is exactly 100 (or all zeros). */
  shares: z.object({
    kit: z.number().int(),
    customTokens: z.number().int(),
    customMixed: z.number().int(),
    customHardcode: z.number().int(),
    customUnstyled: z.number().int(),
    foreign: z.number().int(),
  }),
  breakdown: z.object({
    total: z.number().int(),
    kit: z.number().int(),
    kitClean: z.number().int(),
    customTokens: z.number().int(),
    customMixed: z.number().int(),
    customHardcode: z.number().int(),
    customUnstyled: z.number().int(),
    foreign: z.number().int(),
  }),
  tokenCoveragePercent: z.number().int(),
  topProblems: z.array(
    z.object({
      impactKey: z.string(),
      rule: z.string(),
      severity: z.enum(['error', 'warning', 'info', 'candidate']),
      actual: z.string(),
      expected: z.string().nullable(),
      occurrences: z.number().int(),
      files: z.number().int(),
      autoFixable: z.boolean(),
    }),
  ),
  customComponents: z.object({
    total: z.number().int(),
    top: z.array(
      z.object({
        name: z.string(),
        file: z.string(),
        usages: z.number().int(),
        files: z.number().int(),
        tokenVerdict: z.enum(['tokens', 'mixed', 'hardcode', 'no-styles']),
        bestCandidate: z.object({ component: z.string(), score: z.number() }).nullable(),
      }),
    ),
  }),
  recommendedFixes: z.object({ decisions: z.number().int(), occurrences: z.number().int(), files: z.number().int() }),
  artifacts: z.object({
    dashboard: z.string().nullable(),
    findings: z.string(),
    usage: z.string(),
    summary: z.string(),
    patches: z.string(),
  }),
})

export type Brief = z.infer<typeof briefSchema>

export interface BriefInput {
  readonly summary: Summary
  readonly usage: Usage
  readonly findings: readonly Finding[]
  readonly projectName: string | null
  readonly projectRoot: string
  readonly outputDirectory: string
  readonly dashboardPath: string | null
}

/** Best kit candidate the scorer attached to this declaration, if any component finding matched. */
const bestCandidateFor = (
  component: Usage['customComponents'][number],
  findings: readonly Finding[],
): { component: string; score: number } | null => {
  for (const finding of findings) {
    if (!finding.rule.startsWith('component.')) continue
    if (finding.file !== component.file) continue
    if (finding.line !== component.line && finding.actual !== component.name) continue
    const top = finding.candidates[0]
    if (top !== undefined) {
      return { component: top.component, score: Math.round(top.score * 100) / 100 }
    }
  }
  return null
}

export const buildBrief = (input: BriefInput): Brief => {
  const { summary, usage, findings } = input

  const groups = new Map<string, { first: Finding; findings: Finding[]; files: Set<string> }>()
  for (const finding of findings) {
    const group = groups.get(finding.impactKey) ?? { first: finding, findings: [], files: new Set<string>() }
    group.findings.push(finding)
    group.files.add(finding.file)
    groups.set(finding.impactKey, group)
  }

  const topProblems = [...groups.entries()]
    .map(([impactKey, group]) => {
      const { first } = group
      return {
        weight: SEVERITY_WEIGHT[first.severity] * group.findings.length,
        problem: {
          impactKey,
          rule: first.rule,
          severity: first.severity,
          actual: first.actual,
          expected: first.expected === null ? null : (first.expected.token ?? first.expected.value),
          occurrences: group.findings.length,
          files: group.files.size,
          autoFixable: group.findings.every((finding) => finding.autoFixable),
        },
      }
    })
    .sort((left, right) => right.weight - left.weight)
    .slice(0, TOP_PROBLEMS)
    .map((entry) => entry.problem)

  const recommended = findings.filter(isRecommendedFix)
  const recommendedKeys = new Set(recommended.map((finding) => finding.impactKey))
  const recommendedFiles = new Set(recommended.map((finding) => finding.file))

  const topCustom = [...usage.customComponents]
    .sort((left, right) => right.usages - left.usages)
    .slice(0, TOP_CUSTOM_COMPONENTS)
    .map((component) => ({
      name: component.name,
      file: component.file,
      usages: component.usages,
      files: component.files,
      tokenVerdict: component.tokenVerdict,
      bestCandidate: bestCandidateFor(component, findings),
    }))

  const breakdown = usage.elementBreakdown
  const shares = allocateShares({
    kit: breakdown.kit,
    customTokens: breakdown.customTokens,
    customMixed: breakdown.customMixed,
    customHardcode: breakdown.customHardcode,
    customUnstyled: breakdown.customUnstyled,
    foreign: breakdown.foreign,
  })

  return {
    $schema: BRIEF_SCHEMA_ID,
    project: { name: input.projectName, root: input.projectRoot },
    health: { score: summary.healthScore, formula: summary.healthFormula },
    totals: {
      findings: summary.findings.total,
      errors: summary.findings.bySeverity.error,
      warnings: summary.findings.bySeverity.warning,
      info: summary.findings.bySeverity.info,
      candidates: summary.findings.bySeverity.candidate,
      decisions: groups.size,
      autoFixable: summary.findings.autoFixable,
      a11y: summary.findings.byCategory.a11y,
    },
    shares,
    breakdown: {
      total: breakdown.total,
      kit: breakdown.kit,
      kitClean: breakdown.kitClean,
      customTokens: breakdown.customTokens,
      customMixed: breakdown.customMixed,
      customHardcode: breakdown.customHardcode,
      customUnstyled: breakdown.customUnstyled,
      foreign: breakdown.foreign,
    },
    tokenCoveragePercent: Math.round(summary.tokenCoverage * 100),
    topProblems,
    customComponents: { total: usage.customComponents.length, top: topCustom },
    recommendedFixes: {
      decisions: recommendedKeys.size,
      occurrences: recommended.length,
      files: recommendedFiles.size,
    },
    artifacts: {
      dashboard: input.dashboardPath,
      findings: `${input.outputDirectory}/findings.json`,
      usage: `${input.outputDirectory}/usage.json`,
      summary: `${input.outputDirectory}/summary.json`,
      patches: `${input.outputDirectory}/patches.json`,
    },
  }
}
