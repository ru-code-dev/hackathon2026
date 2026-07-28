import { describe, expect, it } from 'vitest'

import { buildUnifiedDiff, toCurlCommand } from '../../dashboard/src/lib/diff.js'
import type { Finding } from '../../dashboard/src/contract.js'

/**
 * The diff builder is the one piece of the dashboard that leaves the browser: its output
 * goes through a webhook into `git apply` on a CI box. A malformed hunk there fails a
 * pipeline someone else owns, so the format is pinned here down to the marker characters.
 */

const finding = (overrides: Partial<Finding> & { file: string; line: number }): Finding => ({
  id: `f_${String(overrides.line)}`,
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
    startLine: overrides.line - 1,
    beforeHtml: '',
    afterHtml: null,
  },
  actual: '#123456',
  expected: null,
  why: 'причина',
  note: null,
  rootCause: null,
  appliedTo: null,
  a11y: null,
  autoFixable: true,
  needsAgent: false,
  candidates: [],
  impact: { occurrences: 1, files: 1 },
  impactKey: 'k',
  ...overrides,
})

describe('buildUnifiedDiff', () => {
  it('emits a git-apply-compatible hunk with interleaved markers', () => {
    const result = buildUnifiedDiff([
      finding({
        file: 'src/a.css',
        line: 5,
        snippet: {
          before: '.x {\n  color: #123456;\n}',
          after: '.x {\n  color: var(--t);\n}',
          highlightLine: 2,
          startLine: 4,
          beforeHtml: '',
          afterHtml: null,
        },
      }),
    ])

    expect(result.diff).toBe(
      [
        'diff --git a/src/a.css b/src/a.css',
        '--- a/src/a.css',
        '+++ b/src/a.css',
        '@@ -4,3 +4,3 @@',
        ' .x {',
        '-  color: #123456;',
        '+  color: var(--t);',
        ' }',
        '',
      ].join('\n'),
    )
    expect(result.files).toEqual(['src/a.css'])
    expect(result.changedLines).toBe(1)
    expect(result.skipped).toHaveLength(0)
  })

  it('merges overlapping windows that agree and keeps both changes', () => {
    const shared = 'a\nb\nc\nd'
    const result = buildUnifiedDiff([
      finding({
        file: 'f.css',
        line: 2,
        snippet: {
          before: shared,
          after: 'a\nB\nc\nd',
          highlightLine: 2,
          startLine: 1,
          beforeHtml: '',
          afterHtml: null,
        },
      }),
      finding({
        file: 'f.css',
        line: 3,
        snippet: {
          before: shared,
          after: 'a\nb\nC\nd',
          highlightLine: 3,
          startLine: 1,
          beforeHtml: '',
          afterHtml: null,
        },
      }),
    ])

    expect(result.skipped).toHaveLength(0)
    expect(result.changedLines).toBe(2)
    expect(result.diff).toContain('-b\n+B')
    expect(result.diff).toContain('-c\n+C')
    expect(result.diff.match(/@@ -/g)).toHaveLength(1)
  })

  it('skips a genuine conflict instead of silently dropping it', () => {
    const result = buildUnifiedDiff([
      finding({
        file: 'f.css',
        line: 2,
        snippet: {
          before: 'a\nb\nc',
          after: 'a\nB1\nc',
          highlightLine: 2,
          startLine: 1,
          beforeHtml: '',
          afterHtml: null,
        },
      }),
      finding({
        file: 'f.css',
        line: 2,
        snippet: {
          before: 'a\nb\nc',
          after: 'a\nB2\nc',
          highlightLine: 2,
          startLine: 1,
          beforeHtml: '',
          afterHtml: null,
        },
      }),
    ])

    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]?.reason).toContain('пересекается')
    expect(result.diff).toContain('+B1')
    expect(result.diff).not.toContain('+B2')
  })

  it('skips findings without an automatic replacement', () => {
    const result = buildUnifiedDiff([
      finding({
        file: 'f.css',
        line: 2,
        autoFixable: false,
        snippet: { before: 'a\nb\nc', after: null, highlightLine: 2, startLine: 1, beforeHtml: '', afterHtml: null },
      }),
    ])

    expect(result.diff).toBe('')
    expect(result.skipped[0]?.reason).toContain('нет автоматической замены')
  })

  it('keeps hunks in separate files under separate headers, sorted', () => {
    const snippet = {
      before: 'a\nb\nc',
      after: 'a\nB\nc',
      highlightLine: 2,
      startLine: 1,
      beforeHtml: '',
      afterHtml: null,
    }
    const result = buildUnifiedDiff([
      finding({ file: 'z.css', line: 2, snippet }),
      finding({ file: 'a.css', line: 2, snippet }),
    ])

    expect(result.files).toEqual(['a.css', 'z.css'])
    expect(result.diff.indexOf('a/a.css')).toBeLessThan(result.diff.indexOf('a/z.css'))
  })
})

describe('toCurlCommand', () => {
  it('single-quotes the body and escapes embedded single quotes', () => {
    const command = toCurlCommand('https://ci.example/invoke?token=T', {
      repository_url: 'https://git.example/r.git',
      branch_name: 'b',
      target_branch: 't',
      pr_title: "it's a title",
      pr_body: 'body',
      diff_content: 'diff --git a/x b/x',
    })

    expect(command.startsWith("curl -X POST 'https://ci.example/invoke?token=T'")).toBe(true)
    expect(command).toContain("'\\''s a title")
    expect(command).toContain("-H 'Content-Type: application/json'")
  })
})
