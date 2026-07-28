import type { Snippet } from '../domain/findings.js'
import type { RawFinding } from './types.js'

/**
 * Source context attached to a finding.
 *
 * A finding without its surroundings is a coordinate, and a coordinate is not something
 * anyone can judge. Four lines either side is enough to see which rule or which element
 * the value belongs to and short enough to read at a glance; the dashboard widens this on
 * demand from the same source.
 *
 * The `after` variant is produced by substituting on the affected line only. Rewriting
 * more than the one line would mean re-emitting code the developer wrote, and a diff that
 * touches lines nobody asked about does not get applied.
 */

/** Lines of context kept on either side of the finding. */
const CONTEXT_LINES = 4

export const buildSnippet = (finding: RawFinding, lines: readonly string[] | undefined): Snippet => {
  if (lines === undefined || lines.length === 0) {
    return { before: '', after: null, highlightLine: 1, startLine: finding.line }
  }

  const index = Math.min(Math.max(finding.line - 1, 0), lines.length - 1)
  const start = Math.max(0, index - CONTEXT_LINES)
  const end = Math.min(lines.length, index + CONTEXT_LINES + 1)

  const window = lines.slice(start, end)
  const highlightLine = index - start + 1
  const target = window[highlightLine - 1] ?? ''

  const replacement = finding.replaceWith
  const after =
    replacement === null || !target.includes(finding.actual)
      ? null
      : window
          .map((line, offset) => (offset === highlightLine - 1 ? line.replace(finding.actual, replacement) : line))
          .join('\n')

  return {
    before: window.join('\n'),
    after,
    highlightLine,
    startLine: start + 1,
  }
}
