import { readFileSync } from 'node:fs'

import { z } from 'zod'

import type { Finding } from '../domain/findings.js'
import { compareStrings } from '../shared/sort.js'

/**
 * Scoring the detectors against the hand-authored ground truth.
 *
 * The oracle is the specification: every entry was derived by reading the fixture and
 * checking the value against the extracted tokens. Precision and recall against it are the
 * only honest way to answer "does this work", because a detector that finds everything by
 * reporting everything scores perfectly on recall alone.
 *
 * A finding matches an expectation when file, line, rule and value all agree. Once matched,
 * `subkind` and `expect` are additionally asserted — those encode *which* token the kit
 * should have offered, which is where a plausible-looking detector usually goes wrong.
 */

export const expectationSchema = z.object({
  id: z.string(),
  /** Milestone that enforces the entry: token and API rules are `M3`, component rules `M5`. */
  stage: z.enum(['M3', 'M5']),
  file: z.string(),
  line: z.number().int().positive(),
  rule: z.string(),
  subkind: z.string().optional(),
  actual: z.string(),
  expect: z.string().nullable().optional(),
  rootCause: z.string().optional(),
  note: z.string().optional(),
})

export const oracleSchema = z.object({
  $schema: z.literal('ds-analyzer/expected-findings@1'),
  cleanFiles: z.array(z.string()),
  excludedFiles: z.array(z.object({ file: z.string(), reason: z.string() })),
  expectedLimitations: z.array(
    z.object({ file: z.string(), line: z.number(), reason: z.string(), detail: z.string() }),
  ),
  expectations: z.array(expectationSchema),
})

export type Expectation = z.infer<typeof expectationSchema>
export type Oracle = z.infer<typeof oracleSchema>

export const loadOracle = (path: string): Oracle => oracleSchema.parse(JSON.parse(readFileSync(path, 'utf8')))

/** Identity a finding and an expectation are matched on. */
const keyOf = (entry: { file: string; line: number; rule: string; actual: string }): string =>
  `${entry.file}:${String(entry.line)}:${entry.rule}:${entry.actual}`

export interface Mismatch {
  readonly kind: 'missing' | 'unexpected' | 'wrong-subkind' | 'wrong-token' | 'wrong-root-cause'
  readonly key: string
  readonly detail: string
}

export interface Score {
  readonly matched: number
  readonly expected: number
  readonly reported: number
  readonly precision: number
  readonly recall: number
  readonly mismatches: Mismatch[]
}

/**
 * Scores `findings` against the expectations of one stage.
 *
 * Findings from rules the stage does not own are excluded from the precision denominator:
 * a component-detection finding is not a false positive for the token rules.
 */
export const scoreAgainstOracle = (
  oracle: Oracle,
  findings: readonly Finding[],
  stage: Expectation['stage'],
): Score => {
  const expectations = oracle.expectations.filter((entry) => entry.stage === stage)
  const ownedRules = new Set(expectations.map((entry) => entry.rule))
  const relevant = findings.filter((finding) => ownedRules.has(finding.rule))

  const byKey = new Map<string, Finding>()
  for (const finding of relevant) {
    byKey.set(keyOf(finding), finding)
  }

  const mismatches: Mismatch[] = []
  const matchedKeys = new Set<string>()

  for (const expectation of expectations) {
    const key = keyOf(expectation)
    const finding = byKey.get(key)

    if (finding === undefined) {
      mismatches.push({ kind: 'missing', key, detail: `${expectation.id}: not reported` })
      continue
    }

    matchedKeys.add(key)

    if (expectation.subkind !== undefined && finding.subkind !== expectation.subkind) {
      mismatches.push({
        kind: 'wrong-subkind',
        key,
        detail: `${expectation.id}: expected subkind ${expectation.subkind}, got ${finding.subkind ?? 'null'}`,
      })
    }

    if (expectation.expect !== undefined) {
      // Rules answer "what instead?" in whichever field fits them: a token for style
      // literals, a component for API rules, the component being styled for overrides,
      // and a ready-made statement for imports.
      const actual =
        finding.expected?.token ??
        finding.expected?.component ??
        finding.appliedTo?.component ??
        finding.expected?.value ??
        null
      if (actual !== expectation.expect) {
        mismatches.push({
          kind: 'wrong-token',
          key,
          detail: `${expectation.id}: expected ${expectation.expect ?? 'null'}, got ${actual ?? 'null'}`,
        })
      }
    }

    if (expectation.rootCause !== undefined) {
      const actual = finding.rootCause === null ? null : `${finding.rootCause.file}:${String(finding.rootCause.line)}`
      if (actual !== expectation.rootCause) {
        mismatches.push({
          kind: 'wrong-root-cause',
          key,
          detail: `${expectation.id}: expected root cause ${expectation.rootCause}, got ${actual ?? 'null'}`,
        })
      }
    }
  }

  for (const finding of relevant) {
    const key = keyOf(finding)
    if (!matchedKeys.has(key)) {
      mismatches.push({ kind: 'unexpected', key, detail: `${finding.id}: ${finding.why.slice(0, 90)}` })
    }
  }

  const matched = matchedKeys.size

  return {
    matched,
    expected: expectations.length,
    reported: relevant.length,
    precision: relevant.length === 0 ? 1 : matched / relevant.length,
    recall: expectations.length === 0 ? 1 : matched / expectations.length,
    mismatches: mismatches.sort((left, right) => compareStrings(left.key, right.key)),
  }
}

/** Multi-line report of everything that disagreed, for a test failure message. */
export const formatMismatches = (score: Score): string =>
  [
    `precision ${score.precision.toFixed(3)} (${String(score.matched)}/${String(score.reported)})`,
    `recall    ${score.recall.toFixed(3)} (${String(score.matched)}/${String(score.expected)})`,
    ...score.mismatches.map((mismatch) => `  [${mismatch.kind}] ${mismatch.key}\n      ${mismatch.detail}`),
  ].join('\n')
