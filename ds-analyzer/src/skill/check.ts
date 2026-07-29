import { z } from 'zod'

import type { Finding } from '../domain/findings.js'
import { isRecommendedFix } from './brief.js'

/**
 * Diff-режим: «что вносит этот коммит», а не «что накопилось в проекте».
 *
 * The analysis itself always runs over the whole project — the rules need global context
 * (frequency indexes, component reuse, duplicate clusters). The diff enters afterwards as
 * a *filter*: a finding belongs to the change when it sits on a line the diff added or
 * modified. Because the analysis is deterministic, this line intersection IS «introduced
 * by this diff» for line-anchored findings — no second baseline run required.
 */

export const CHECK_SCHEMA_ID = 'ds-analyzer/check@1'

/** Findings quoted verbatim in the verdict; the rest are counted and linked. */
const VERDICT_FINDINGS = 20

export const checkVerdictSchema = z.object({
  $schema: z.literal(CHECK_SCHEMA_ID),
  /** What was compared, in git's own words: `HEAD`, `--staged`, `origin/main..HEAD`. */
  range: z.string(),
  changed: z.object({ files: z.number().int(), lines: z.number().int() }),
  /** `pass` — no errors on changed lines; the exit code stays 0 unless `--gate` asks. */
  gate: z.enum(['pass', 'fail']),
  totals: z.object({
    findings: z.number().int(),
    errors: z.number().int(),
    warnings: z.number().int(),
    info: z.number().int(),
    candidates: z.number().int(),
    decisions: z.number().int(),
    autoFixable: z.number().int(),
    recommendedFixes: z.number().int(),
  }),
  findings: z.array(
    z.object({
      id: z.string(),
      rule: z.string(),
      severity: z.enum(['error', 'warning', 'info', 'candidate']),
      file: z.string(),
      line: z.number().int(),
      actual: z.string(),
      expected: z.string().nullable(),
      why: z.string(),
      autoFixable: z.boolean(),
      impactKey: z.string(),
    }),
  ),
  /** How many findings the list above omits. */
  omitted: z.number().int(),
  artifacts: z.object({ dashboard: z.string().nullable(), check: z.string() }),
})

export type CheckVerdict = z.infer<typeof checkVerdictSchema>

/** File → 1-based lines added or modified on the NEW side of the diff. */
export type ChangedLines = Map<string, Set<number>>

/**
 * Parses `git diff -U0` output. Zero context makes every `+start,count` header name
 * exactly the added/modified lines — no reconstruction needed. Deletions carry no new
 * lines and are skipped: there is nothing in the new tree to anchor a finding to.
 */
export const parseChangedLines = (diffText: string): ChangedLines => {
  const changed: ChangedLines = new Map()
  let currentFile: string | null = null

  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      // `+++ b/src/App.tsx` → `src/App.tsx`; `+++ /dev/null` → deleted file, no new side.
      const path = line.slice(4).trim()
      currentFile = path === '/dev/null' ? null : path.replace(/^b\//, '')
      continue
    }
    if (currentFile === null || !line.startsWith('@@')) {
      continue
    }
    const header = /\+(\d+)(?:,(\d+))?/.exec(line)
    if (header === null) {
      continue
    }
    const start = Number.parseInt(header[1] ?? '0', 10)
    const count = header[2] === undefined ? 1 : Number.parseInt(header[2], 10)
    if (count === 0) {
      continue
    }
    const lines = changed.get(currentFile) ?? new Set<number>()
    for (let offset = 0; offset < count; offset += 1) {
      lines.add(start + offset)
    }
    changed.set(currentFile, lines)
  }

  return changed
}

/** Findings sitting on a changed line — the ones this diff is answerable for. */
export const intersectFindings = (findings: readonly Finding[], changed: ChangedLines): Finding[] =>
  findings.filter((finding) => changed.get(finding.file)?.has(finding.line) ?? false)

export const buildCheckVerdict = (input: {
  findings: readonly Finding[]
  changed: ChangedLines
  range: string
  dashboardPath: string | null
  checkPath: string
}): CheckVerdict => {
  const hit = intersectFindings(input.findings, input.changed)

  const bySeverity = { error: 0, warning: 0, info: 0, candidate: 0 }
  for (const finding of hit) {
    bySeverity[finding.severity] += 1
  }

  const order = { error: 0, warning: 1, info: 2, candidate: 3 }
  const listed = [...hit]
    .sort((left, right) => order[left.severity] - order[right.severity] || left.file.localeCompare(right.file))
    .slice(0, VERDICT_FINDINGS)

  let changedLineCount = 0
  for (const lines of input.changed.values()) {
    changedLineCount += lines.size
  }

  return {
    $schema: CHECK_SCHEMA_ID,
    range: input.range,
    changed: { files: input.changed.size, lines: changedLineCount },
    gate: bySeverity.error > 0 ? 'fail' : 'pass',
    totals: {
      findings: hit.length,
      errors: bySeverity.error,
      warnings: bySeverity.warning,
      info: bySeverity.info,
      candidates: bySeverity.candidate,
      decisions: new Set(hit.map((finding) => finding.impactKey)).size,
      autoFixable: hit.filter((finding) => finding.autoFixable).length,
      recommendedFixes: hit.filter(isRecommendedFix).length,
    },
    findings: listed.map((finding) => ({
      id: finding.id,
      rule: finding.rule,
      severity: finding.severity,
      file: finding.file,
      line: finding.line,
      actual: finding.actual,
      expected: finding.expected === null ? null : (finding.expected.token ?? finding.expected.value),
      why: finding.why,
      autoFixable: finding.autoFixable,
      impactKey: finding.impactKey,
    })),
    omitted: Math.max(0, hit.length - listed.length),
    artifacts: { dashboard: input.dashboardPath, check: input.checkPath },
  }
}
