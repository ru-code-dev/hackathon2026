import type { Finding } from '../contract.js'

/**
 * Builds one unified diff from a set of auto-fixable findings.
 *
 * Every auto-fixable finding already carries its fix as `snippet.before`/`snippet.after` —
 * the same context window the reader saw on screen, so what lands in the PR is exactly
 * what was previewed. Auto-fixes are single-line replacements, which gives this builder
 * two properties it leans on:
 *
 *  - line counts never change, so hunks further down a file keep their coordinates and no
 *    offset bookkeeping is needed;
 *  - two fixes conflict only when their context windows overlap *and* disagree about a
 *    shared line. Overlapping windows that agree are merged; genuine disagreements are
 *    returned as `skipped`, never silently dropped — a patch that quietly leaves fixes out
 *    reads as "applied everything" to the person who clicked.
 */

export interface DiffResult {
  /** `git apply`-compatible unified diff; empty string when nothing was buildable. */
  diff: string
  /** Files touched by the diff. */
  files: string[]
  /** Changed-line count (one per replaced line). */
  changedLines: number
  /** Findings left out of the diff, with the reason a human can act on. */
  skipped: { finding: Finding; reason: string }[]
}

interface Hunk {
  /** 1-based line of the first context line. */
  start: number
  before: string[]
  after: string[]
  findings: Finding[]
}

const overlaps = (left: Hunk, right: Hunk): boolean =>
  left.start <= right.start + right.before.length - 1 && right.start <= left.start + left.before.length - 1

/**
 * Merges `next` into `base` when their windows overlap.
 *
 * Both windows are excerpts of the same file, so their context lines must agree wherever
 * they cover the same line number. Each side's *changes* are then re-applied on top of the
 * union. Returns `null` when the windows contradict each other — that is a real conflict.
 */
const merge = (base: Hunk, next: Hunk): Hunk | null => {
  const start = Math.min(base.start, next.start)
  const end = Math.max(base.start + base.before.length, next.start + next.before.length)

  const beforeUnion: (string | undefined)[] = Array.from({ length: end - start })
  for (const hunk of [base, next]) {
    for (const [index, line] of hunk.before.entries()) {
      const at = hunk.start - start + index
      if (beforeUnion[at] !== undefined && beforeUnion[at] !== line) {
        return null
      }
      beforeUnion[at] = line
    }
  }
  if (beforeUnion.some((line) => line === undefined)) {
    // A gap between the two windows: not actually overlapping.
    return null
  }

  const afterUnion = [...(beforeUnion as string[])]
  for (const hunk of [base, next]) {
    for (const [index, line] of hunk.after.entries()) {
      const at = hunk.start - start + index
      const original = hunk.before[index]
      if (line !== original) {
        // A change from one window; the other must not have changed the same line differently.
        if (afterUnion[at] !== beforeUnion[at] && afterUnion[at] !== line) {
          return null
        }
        afterUnion[at] = line
      }
    }
  }

  return { start, before: beforeUnion as string[], after: afterUnion, findings: [...base.findings, ...next.findings] }
}

const toHunkText = (hunk: Hunk): string => {
  const lines: string[] = [
    `@@ -${String(hunk.start)},${String(hunk.before.length)} +${String(hunk.start)},${String(hunk.after.length)} @@`,
  ]

  for (const [index, line] of hunk.before.entries()) {
    const replacement = hunk.after[index]
    if (replacement === line) {
      lines.push(` ${line}`)
    } else {
      lines.push(`-${line}`)
    }
  }
  for (const [index, line] of hunk.after.entries()) {
    if (hunk.before[index] !== line) {
      // Emitted after the matching `-` block; with equal-length windows the grouping below
      // keeps removals and additions adjacent per changed line.
      lines.push(`+${line}`)
    }
  }

  return lines.join('\n')
}

/**
 * Interleaves removals and additions per changed line, the way `git diff` prints them.
 * Equal-length windows make this a straight zip.
 */
const toInterleavedHunkText = (hunk: Hunk): string => {
  if (hunk.before.length !== hunk.after.length) {
    return toHunkText(hunk)
  }

  const lines: string[] = [
    `@@ -${String(hunk.start)},${String(hunk.before.length)} +${String(hunk.start)},${String(hunk.after.length)} @@`,
  ]

  for (const [index, line] of hunk.before.entries()) {
    const replacement = hunk.after[index] ?? line
    if (replacement === line) {
      lines.push(` ${line}`)
    } else {
      lines.push(`-${line}`, `+${replacement}`)
    }
  }

  return lines.join('\n')
}

export const buildUnifiedDiff = (findings: readonly Finding[]): DiffResult => {
  const skipped: DiffResult['skipped'] = []
  const byFile = new Map<string, Hunk[]>()

  const eligible = [...findings]
    .filter((finding) => {
      if (!finding.autoFixable || finding.snippet.after === null) {
        skipped.push({ finding, reason: 'нет автоматической замены' })
        return false
      }
      return true
    })
    .sort((left, right) => (left.file < right.file ? -1 : left.file > right.file ? 1 : left.line - right.line))

  for (const finding of eligible) {
    const hunk: Hunk = {
      start: finding.snippet.startLine,
      before: finding.snippet.before.split('\n'),
      after: (finding.snippet.after ?? '').split('\n'),
      findings: [finding],
    }

    if (hunk.before.length !== hunk.after.length) {
      skipped.push({ finding, reason: 'замена меняет число строк — примените вручную' })
      continue
    }

    const hunks = byFile.get(finding.file) ?? []
    const collision = hunks.findIndex((existing) => overlaps(existing, hunk))

    if (collision === -1) {
      hunks.push(hunk)
    } else {
      const merged = merge(hunks[collision] as Hunk, hunk)
      if (merged === null) {
        skipped.push({ finding, reason: 'пересекается с другой выбранной правкой' })
        byFile.set(finding.file, hunks)
        continue
      }
      hunks[collision] = merged
    }
    byFile.set(finding.file, hunks)
  }

  const parts: string[] = []
  let changedLines = 0

  for (const file of [...byFile.keys()].sort()) {
    const hunks = (byFile.get(file) ?? []).sort((left, right) => left.start - right.start)
    if (hunks.length === 0) {
      continue
    }

    parts.push(`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`)
    for (const hunk of hunks) {
      parts.push(toInterleavedHunkText(hunk))
      changedLines += hunk.before.filter((line, index) => hunk.after[index] !== line).length
    }
  }

  return {
    diff: parts.length === 0 ? '' : `${parts.join('\n')}\n`,
    files: [...byFile.keys()].filter((file) => (byFile.get(file) ?? []).length > 0).sort(),
    changedLines,
    skipped,
  }
}

/** The exact request body the Jenkins generic-webhook-trigger job expects. */
export interface PrRequest {
  repository_url: string
  branch_name: string
  target_branch: string
  pr_title: string
  pr_body: string
  diff_content: string
}

/** Shell-quoted curl command — the guaranteed path when the browser blocks cross-origin. */
export const toCurlCommand = (webhookUrl: string, request: PrRequest): string => {
  const body = JSON.stringify(request, null, 1)
  const quote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`

  return `curl -X POST ${quote(webhookUrl)} -H 'Content-Type: application/json' -d ${quote(body)}`
}
