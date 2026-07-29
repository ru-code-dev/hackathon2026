import { describe, expect, it } from 'vitest'

import { buildCheckVerdict, checkVerdictSchema, intersectFindings, parseChangedLines } from './check.js'
import { finding } from './fixtures.js'

/**
 * The check verdict can gate a CI pipeline, so the diff parsing is pinned against git's
 * actual `-U0` output shapes: multi-line hunks, single-line hunks without a count,
 * pure deletions, deleted and renamed files.
 */

const DIFF = [
  'diff --git a/src/App.tsx b/src/App.tsx',
  'index 111..222 100644',
  '--- a/src/App.tsx',
  '+++ b/src/App.tsx',
  '@@ -10,2 +10,3 @@',
  '+one',
  '+two',
  '+three',
  '@@ -20 +21 @@',
  '+single',
  'diff --git a/src/gone.tsx b/src/gone.tsx',
  '--- a/src/gone.tsx',
  '+++ /dev/null',
  '@@ -1,5 +0,0 @@',
  'diff --git a/src/old.tsx b/src/renamed.tsx',
  '--- a/src/old.tsx',
  '+++ b/src/renamed.tsx',
  '@@ -3,0 +4,2 @@',
  '+a',
  '+b',
].join('\n')

describe('parseChangedLines', () => {
  it('collects added lines per file from -U0 hunks', () => {
    const changed = parseChangedLines(DIFF)
    expect([...(changed.get('src/App.tsx') ?? [])].sort((a, b) => a - b)).toEqual([10, 11, 12, 21])
  })

  it('anchors renamed files to the new path', () => {
    const changed = parseChangedLines(DIFF)
    expect([...(changed.get('src/renamed.tsx') ?? [])]).toEqual([4, 5])
    expect(changed.has('src/old.tsx')).toBe(false)
  })

  it('skips deleted files and pure deletions — nothing on the new side to blame', () => {
    const changed = parseChangedLines(DIFF)
    expect(changed.has('src/gone.tsx')).toBe(false)
  })

  it('returns an empty map for an empty diff', () => {
    expect(parseChangedLines('').size).toBe(0)
  })
})

describe('intersectFindings', () => {
  it('keeps findings on changed lines only', () => {
    const changed = parseChangedLines(DIFF)
    const hitFinding = finding({ file: 'src/App.tsx', line: 11 })
    const missFinding = finding({ file: 'src/App.tsx', line: 99 })
    const otherFile = finding({ file: 'src/Other.tsx', line: 11 })
    expect(intersectFindings([hitFinding, missFinding, otherFile], changed)).toEqual([hitFinding])
  })
})

describe('buildCheckVerdict', () => {
  const base = { range: 'HEAD', dashboardPath: '/p/ui-analyzer/dashboard.html', checkPath: '/p/ui-analyzer/check.json' }

  it('produces a schema-valid verdict and fails the gate only on errors', () => {
    const changed = parseChangedLines(DIFF)
    const clean = buildCheckVerdict({
      findings: [finding({ file: 'src/App.tsx', line: 11, severity: 'warning' })],
      changed,
      ...base,
    })
    expect(() => checkVerdictSchema.parse(clean)).not.toThrow()
    expect(clean.gate).toBe('pass')

    const failing = buildCheckVerdict({
      findings: [finding({ file: 'src/App.tsx', line: 11, severity: 'error' })],
      changed,
      ...base,
    })
    expect(failing.gate).toBe('fail')
    expect(failing.totals.errors).toBe(1)
  })

  it('counts decisions and recommended fixes over the intersected set only', () => {
    const changed = parseChangedLines(DIFF)
    const verdict = buildCheckVerdict({
      findings: [
        finding({ file: 'src/App.tsx', line: 10, impactKey: 'k1' }),
        finding({ file: 'src/App.tsx', line: 11, impactKey: 'k1' }),
        finding({ file: 'src/App.tsx', line: 99, impactKey: 'k2' }),
      ],
      changed,
      ...base,
    })
    expect(verdict.totals.findings).toBe(2)
    expect(verdict.totals.decisions).toBe(1)
    expect(verdict.totals.recommendedFixes).toBe(2)
  })

  it('lists errors first and reports how many findings were omitted', () => {
    const changed = new Map([['a.tsx', new Set(Array.from({ length: 40 }, (_, index) => index + 1))]])
    const findings = Array.from({ length: 30 }, (_, index) =>
      finding({ file: 'a.tsx', line: index + 1, severity: index === 29 ? 'error' : 'info' }),
    )
    const verdict = buildCheckVerdict({ findings, changed, ...base })
    expect(verdict.findings[0]?.severity).toBe('error')
    expect(verdict.findings).toHaveLength(20)
    expect(verdict.omitted).toBe(10)
  })
})
