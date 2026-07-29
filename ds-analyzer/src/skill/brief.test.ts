import { describe, expect, it } from 'vitest'

import { briefSchema, buildBrief, isRecommendedFix } from './brief.js'
import { customComponent, finding, summary, usage } from './fixtures.js'

/**
 * The brief is the only thing the skill's model reads after a run, so its contract is
 * pinned hard: schema-valid, shares closed to 100, problems ranked by severity × count,
 * recommended fixes counted by the exact rule the patches builder uses.
 */

const baseInput = {
  projectName: 'demo-app',
  projectRoot: '/proj',
  outputDirectory: '/proj/ui-analyzer',
  dashboardPath: '/proj/ui-analyzer/dashboard.html',
}

describe('buildBrief', () => {
  it('produces a schema-valid document', () => {
    const brief = buildBrief({
      summary: summary(),
      usage: usage(),
      findings: [finding({ file: 'a.tsx', line: 3 })],
      ...baseInput,
    })
    expect(() => briefSchema.parse(brief)).not.toThrow()
  })

  it('closes shares to exactly 100', () => {
    const brief = buildBrief({ summary: summary(), usage: usage(), findings: [], ...baseInput })
    const total = Object.values(brief.shares).reduce((sum, share) => sum + share, 0)
    expect(total).toBe(100)
  })

  it('counts decisions as unique impact keys, not occurrences', () => {
    const findings = [
      finding({ file: 'a.tsx', line: 1, impactKey: 'k1' }),
      finding({ file: 'b.tsx', line: 2, impactKey: 'k1' }),
      finding({ file: 'c.tsx', line: 3, impactKey: 'k2' }),
    ]
    const brief = buildBrief({ summary: summary(), usage: usage(), findings, ...baseInput })
    expect(brief.totals.decisions).toBe(2)
  })

  it('ranks an error group above a bigger info group', () => {
    const findings = [
      finding({ file: 'a.tsx', line: 1, impactKey: 'info-group', severity: 'info' }),
      finding({ file: 'b.tsx', line: 2, impactKey: 'info-group', severity: 'info' }),
      finding({ file: 'c.tsx', line: 3, impactKey: 'error-group', severity: 'error' }),
    ]
    const brief = buildBrief({ summary: summary(), usage: usage(), findings, ...baseInput })
    expect(brief.topProblems[0]?.impactKey).toBe('error-group')
  })

  it('excludes low-confidence and agent-needing findings from recommended fixes', () => {
    const findings = [
      finding({ file: 'a.tsx', line: 1, impactKey: 'safe', confidence: 1 }),
      finding({ file: 'b.tsx', line: 2, impactKey: 'shaky', confidence: 0.7 }),
      finding({ file: 'c.tsx', line: 3, impactKey: 'agent', needsAgent: true }),
    ]
    const brief = buildBrief({ summary: summary(), usage: usage(), findings, ...baseInput })
    expect(brief.recommendedFixes.decisions).toBe(1)
    expect(brief.recommendedFixes.occurrences).toBe(1)
  })

  it('attaches the best kit candidate to a top custom component', () => {
    const component = customComponent({ name: 'MyButton', file: 'src/MyButton.tsx', line: 5, usages: 9 })
    const componentFinding = finding({
      file: 'src/MyButton.tsx',
      line: 5,
      rule: 'component.custom',
      category: 'component',
      actual: 'MyButton',
      autoFixable: false,
      candidates: [{ component: 'Button', score: 0.87, reasons: ['имя'] }],
    })
    const brief = buildBrief({
      summary: summary(),
      usage: usage({ customComponents: [component] }),
      findings: [componentFinding],
      ...baseInput,
    })
    expect(brief.customComponents.top[0]).toMatchObject({
      name: 'MyButton',
      bestCandidate: { component: 'Button', score: 0.87 },
    })
  })

  it('stays a compact document on realistic volume', () => {
    const findings = Array.from({ length: 300 }, (_, index) =>
      finding({ file: `f${String(index % 30)}.tsx`, line: index + 1, impactKey: `k${String(index % 40)}` }),
    )
    const brief = buildBrief({ summary: summary(), usage: usage(), findings, ...baseInput })
    expect(brief.topProblems.length).toBeLessThanOrEqual(10)
    expect(JSON.stringify(brief).length).toBeLessThan(6_000)
  })
})

describe('isRecommendedFix', () => {
  it('requires an actual replacement to exist', () => {
    const noAfter = finding({ file: 'a.tsx', line: 1 })
    expect(isRecommendedFix({ ...noAfter, snippet: { ...noAfter.snippet, after: null } })).toBe(false)
  })
})
