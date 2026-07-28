import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { analyze } from './analyze.js'
import { analyzerRoot, resolvePaths } from './config.js'
import { analysisArtifactSchema, findingCategorySchema, severitySchema } from './domain/findings.js'
import type { AnalysisArtifact } from './domain/findings.js'
import { A11ySpec } from './kit/a11y-spec.js'
import { KitSpec } from './kit/spec.js'
import { scanProject } from './scanner/scan.js'

/**
 * The analysis artifact against its own schema.
 *
 * `scan.test.ts` already does this for observations, but nothing did it for the analysis
 * output — validation lived only in the CLI, so `npm run verify` could stay green while
 * the artifact the CLI writes was invalid.
 *
 * The gap has teeth because `bySeverity` and `byCategory` are `z.record`s keyed by an enum,
 * and zod requires every key of an enum-keyed record to be present. A category added to the
 * schema but missed in the seeding list produces an artifact that fails its own contract at
 * the last possible moment — after a full scan, in front of the user. The seeding lists are
 * now derived from the schemas, and this test is what keeps that true.
 */

const DEMO_APP = resolve(analyzerRoot, '..', 'demo-app')

describe('analyze on demo-app', () => {
  let analysis: AnalysisArtifact

  beforeAll(() => {
    const artifactsDir = resolvePaths().artifactsDir
    const kit = KitSpec.load(artifactsDir)
    const a11y = A11ySpec.load(artifactsDir)
    const scan = scanProject({ path: DEMO_APP })
    analysis = analyze({ kit, a11y, profile: scan.profile, observations: scan.observations })
  })

  it('produces an artifact that satisfies its own schema', () => {
    expect(() => analysisArtifactSchema.parse(analysis)).not.toThrow()
  })

  it('seeds every severity and every category the schema declares', () => {
    // Explicit, because the schema parse above would also pass if a bucket were present
    // with a wrong value. What matters is that no bucket can go missing when one is added.
    expect(Object.keys(analysis.summary.findings.bySeverity).sort()).toStrictEqual([...severitySchema.options].sort())
    expect(Object.keys(analysis.summary.findings.byCategory).sort()).toStrictEqual(
      [...findingCategorySchema.options].sort(),
    )
  })

  it('carries the accessibility facet on every finding, null where there is none', () => {
    // The facet is required on the wire even when empty: an absent key and a null one read
    // differently in a committed, diffed artifact.
    expect(analysis.findings.length).toBeGreaterThan(0)

    for (const finding of analysis.findings) {
      expect(finding).toHaveProperty('a11y')

      if (finding.category === 'a11y') {
        expect(finding.a11y).not.toBeNull()
        expect(finding.a11y?.impact.length ?? 0).toBeGreaterThan(0)
      } else {
        // Nothing outside the accessibility rules claims a consequence it cannot back up.
        expect(finding.a11y).toBeNull()
      }
    }
  })

  it('says what to do about every accessibility finding', () => {
    // `impact` states the consequence, `fix` states the remedy, and a report that has the
    // first without the second is a list of complaints. Asserted on real output rather
    // than per rule, because the rule that forgets is the one nobody wrote a test for.
    const unguided = analysis.findings
      .filter((finding) => finding.category === 'a11y' && (finding.a11y?.fix ?? null) === null)
      .map((finding) => `${finding.rule}/${finding.subkind ?? '-'}`)

    expect([...new Set(unguided)]).toStrictEqual([])
  })

  it('backs every auto-fixable accessibility finding with a real patch', () => {
    // `autoFixable` is a promise the PR flow keeps: it builds the diff from `snippet.after`
    // and silently skips anything without one. A finding that claims the label and cannot
    // produce the patch is how that flow starts quietly dropping selected fixes.
    for (const finding of analysis.findings.filter((item) => item.category === 'a11y' && item.autoFixable)) {
      expect(finding.snippet.after, `${finding.rule} at ${finding.file}:${String(finding.line)}`).not.toBeNull()
      expect(finding.snippet.after).not.toBe(finding.snippet.before)
    }
  })

  it('reports the accessibility findings the demo project was built to contain', () => {
    const rules = analysis.findings.filter((finding) => finding.category === 'a11y').map((finding) => finding.rule)

    expect(rules).toContain('a11y.focus.suppressed')
    expect(rules).toContain('a11y.pattern.keyboard')
  })
})
