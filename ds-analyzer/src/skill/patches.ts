import { z } from 'zod'

import { buildUnifiedDiff } from '../../dashboard/src/lib/diff.js'
import type { Finding } from '../domain/findings.js'
import { isRecommendedFix } from './brief.js'

/**
 * `patches.json` — the machine-readable side of the PR pipeline.
 *
 * One entry per decision (impactKey), each carrying its own `git apply`-ready diff, so the
 * skill can show the user a короткий список групп and let them pick. The *selected* set is
 * then rebuilt as ONE diff over the union of findings — never by concatenating the
 * per-group diffs, because two groups touching the same context window must merge into one
 * hunk or be reported as a conflict, exactly like the dashboard does it.
 */

export const PATCHES_SCHEMA_ID = 'ds-analyzer/patches@1'

export const patchGroupSchema = z.object({
  impactKey: z.string(),
  rule: z.string(),
  /** «actual → expected», the line the user picks by. */
  title: z.string(),
  severity: z.enum(['error', 'warning', 'info', 'candidate']),
  occurrences: z.number().int(),
  files: z.array(z.string()),
  changedLines: z.number().int(),
  /** Safe to commit without reading each occurrence: high confidence, no agent needed. */
  recommended: z.boolean(),
  diff: z.string(),
  skipped: z.array(z.object({ file: z.string(), line: z.number().int(), reason: z.string() })),
})

export const patchesArtifactSchema = z.object({
  $schema: z.literal(PATCHES_SCHEMA_ID),
  groups: z.array(patchGroupSchema),
  /** impactKeys of every recommended group — the default selection. */
  recommendedKeys: z.array(z.string()),
  totals: z.object({
    groups: z.number().int(),
    recommendedGroups: z.number().int(),
    occurrences: z.number().int(),
  }),
})

export type PatchGroup = z.infer<typeof patchGroupSchema>
export type PatchesArtifact = z.infer<typeof patchesArtifactSchema>

const fixable = (findings: readonly Finding[]): Finding[] =>
  findings.filter((finding) => finding.autoFixable && finding.snippet.after !== null)

export const buildPatches = (findings: readonly Finding[]): PatchesArtifact => {
  const byKey = new Map<string, { first: Finding; all: Finding[] }>()
  for (const finding of fixable(findings)) {
    const group = byKey.get(finding.impactKey) ?? { first: finding, all: [] }
    group.all.push(finding)
    byKey.set(finding.impactKey, group)
  }

  const groups: PatchGroup[] = [...byKey.entries()]
    .map(([impactKey, { first, all: group }]) => {
      const result = buildUnifiedDiff(group)
      const expected = first.expected === null ? null : (first.expected.token ?? first.expected.value)
      return {
        impactKey,
        rule: first.rule,
        title: expected === null ? first.actual : `${first.actual} → ${expected}`,
        severity: first.severity,
        occurrences: group.length,
        files: result.files,
        changedLines: result.changedLines,
        recommended: group.every(isRecommendedFix),
        diff: result.diff,
        skipped: result.skipped.map((entry) => ({
          file: entry.finding.file,
          line: entry.finding.line,
          reason: entry.reason,
        })),
      }
    })
    // Recommended first, then by weight of occurrence — the order the user picks in.
    .sort((left, right) => Number(right.recommended) - Number(left.recommended) || right.occurrences - left.occurrences)

  const recommendedKeys = groups.filter((group) => group.recommended).map((group) => group.impactKey)

  return {
    $schema: PATCHES_SCHEMA_ID,
    groups,
    recommendedKeys,
    totals: {
      groups: groups.length,
      recommendedGroups: recommendedKeys.length,
      occurrences: groups.reduce((sum, group) => sum + group.occurrences, 0),
    },
  }
}

export interface Selection {
  diff: string
  files: string[]
  changedLines: number
  skipped: { file: string; line: number; reason: string }[]
  /** Keys requested but absent from the findings — a typo the caller must hear about. */
  unknownKeys: string[]
}

/** One combined diff over the union of the chosen groups' findings. */
export const buildSelection = (findings: readonly Finding[], keys: readonly string[]): Selection => {
  const wanted = new Set(keys)
  const present = new Set(fixable(findings).map((finding) => finding.impactKey))
  const selected = fixable(findings).filter((finding) => wanted.has(finding.impactKey))

  const result = buildUnifiedDiff(selected)
  return {
    diff: result.diff,
    files: result.files,
    changedLines: result.changedLines,
    skipped: result.skipped.map((entry) => ({
      file: entry.finding.file,
      line: entry.finding.line,
      reason: entry.reason,
    })),
    unknownKeys: [...wanted].filter((key) => !present.has(key)).sort(),
  }
}
