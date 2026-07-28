import { join, resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { analyze } from '../analyze.js'
import { analyzerRoot, resolvePaths } from '../config.js'
import type { AnalysisArtifact } from '../domain/findings.js'
import { KitSpec } from '../kit/spec.js'
import { scanProject } from '../scanner/scan.js'
import { formatMismatches, loadOracle, scoreAgainstOracle, type Oracle } from '../testing/oracle.js'

/**
 * The acceptance test for stage C.
 *
 * Everything else in the suite checks that a unit behaves as written. This one checks that
 * the whole pipeline finds what a human, reading the same code, said was there — which is
 * the only claim the report actually makes.
 */

const DEMO_APP = resolve(analyzerRoot, '..', 'demo-app')

const THRESHOLD = 0.95

describe('deviation detection against the demo-app oracle', () => {
  let oracle: Oracle
  let analysis: AnalysisArtifact

  beforeAll(() => {
    oracle = loadOracle(join(DEMO_APP, 'fixtures', 'expected-findings.json'))

    const kit = KitSpec.load(resolvePaths().artifactsDir)
    const { profile, observations } = scanProject({ path: DEMO_APP })

    analysis = analyze({ kit, profile, observations })
  })

  it('reaches the agreed precision and recall on the token and API rules', () => {
    const score = scoreAgainstOracle(oracle, analysis.findings, 'M3')

    // The message carries every disagreement, so a regression says what changed rather
    // than only that a number moved.
    expect(score.recall, formatMismatches(score)).toBeGreaterThanOrEqual(THRESHOLD)
    expect(score.precision, formatMismatches(score)).toBeGreaterThanOrEqual(THRESHOLD)
  })

  it('reports nothing in the files marked clean', () => {
    const noisy = analysis.findings.filter((finding) => oracle.cleanFiles.includes(finding.file))

    expect(noisy.map((finding) => `${finding.file}:${String(finding.line)} ${finding.rule} ${finding.actual}`)).toEqual(
      [],
    )
  })

  it('never looks at gitignored files', () => {
    for (const excluded of oracle.excludedFiles) {
      expect(analysis.findings.some((finding) => finding.file === excluded.file)).toBe(false)
    }
  })

  it('records the dynamic styles it could not evaluate', () => {
    for (const expected of oracle.expectedLimitations) {
      const found = analysis.summary.limitations.some(
        (limitation) =>
          limitation.file === expected.file &&
          limitation.line === expected.line &&
          limitation.reason === expected.reason,
      )

      expect(found, `${expected.file}:${String(expected.line)} ${expected.reason}`).toBe(true)
    }
  })

  it('produces a health score with a published formula', () => {
    expect(analysis.summary.healthScore).toBeGreaterThan(0)
    expect(analysis.summary.healthScore).toBeLessThan(100)
    expect(analysis.summary.healthFormula).toContain('error 3')
  })

  it('surfaces the colours the kit has no semantic role for', () => {
    // `#ff1f78` is `ref.palette.pink.pink500` and there is no `Background` role holding it,
    // so it is a gap in the kit rather than a mistake in the project (architecture.md §1.3).
    expect(analysis.summary.kitGaps.map((gap) => gap.value)).toContain('#ff1f78')
  })

  it('counts the positives, not only the deviations', () => {
    expect(analysis.summary.positives.length).toBeGreaterThan(0)
    expect(analysis.summary.files.clean).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    const kit = KitSpec.load(resolvePaths().artifactsDir)
    const { profile, observations } = scanProject({ path: DEMO_APP })

    expect(JSON.stringify(analyze({ kit, profile, observations }))).toBe(JSON.stringify(analysis))
  })
})
