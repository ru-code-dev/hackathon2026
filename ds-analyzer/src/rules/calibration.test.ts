import { existsSync } from 'node:fs'

import { beforeAll, describe, expect, it } from 'vitest'

import { analyze } from '../analyze.js'
import { resolvePaths } from '../config.js'
import type { Finding } from '../domain/findings.js'
import { KitSpec } from '../kit/spec.js'
import { scanProject } from '../scanner/scan.js'

/**
 * Calibration against the kit's own usage examples.
 *
 * Every component directory carries an `examples` folder: 684 snippets written by the kit's
 * authors. They are the closest thing to canonical usage that exists, so a rule that fires
 * on them is a rule that will fire on correct code everywhere.
 *
 * **A correction to `architecture.md` §3.2.** The plan called for zero findings across the
 * examples. That target turns out to be wrong, and measurably so: the examples are demo
 * scaffolding — `<div style={{ display: 'flex', columnGap: 15 }}>` wrapping the component
 * being shown — so they are full of genuine raw values. Reporting them is correct
 * behaviour, not a false positive.
 *
 * What *is* a meaningful calibration is the API surface. Across all 684 examples the kit's
 * authors use their own components with documented props and non-deprecated symbols, so
 * `prop.invalid` and `api.deprecated` must be completely silent. Those two rules are also
 * the ones that would be most damaging to get wrong, because they claim the developer
 * wrote something the library does not accept.
 */

const paths = resolvePaths()
const kitAvailable = existsSync(paths.componentsDir)

describe.skipIf(!kitAvailable)('calibration against the kit’s own examples', () => {
  let exampleFindings: Finding[]
  let exampleFiles: number

  beforeAll(() => {
    const kit = KitSpec.load(paths.artifactsDir)
    const { profile, observations } = scanProject({ path: paths.uiKitRoot })
    const analysis = analyze({ kit, profile, observations })

    exampleFindings = analysis.findings.filter((finding) => finding.file.includes('/examples/'))
    exampleFiles = observations.files.filter((file) => file.includes('/examples/')).length
  }, 120_000)

  it('reads the whole example corpus', () => {
    expect(exampleFiles).toBeGreaterThan(600)
  })

  it('never claims the kit’s authors passed an unknown prop value', () => {
    const invalid = exampleFindings.filter((finding) => finding.rule === 'prop.invalid')

    expect(invalid.map((finding) => `${finding.file}:${String(finding.line)} ${finding.actual}`)).toEqual([])
  })

  it('never claims the kit’s authors used a deprecated symbol', () => {
    const deprecated = exampleFindings.filter((finding) => finding.rule === 'api.deprecated')

    expect(deprecated.map((finding) => `${finding.file}:${String(finding.line)} ${finding.actual}`)).toEqual([])
  })

  it('never claims a private slot is styled', () => {
    const inner = exampleFindings.filter((finding) => finding.rule === 'style.override.inner')

    expect(inner.map((finding) => `${finding.file}:${String(finding.line)}`)).toEqual([])
  })

  it('never claims the kit’s own typefaces are foreign', () => {
    expect(exampleFindings.filter((finding) => finding.rule === 'font.foreign')).toEqual([])
  })

  it('does not fall over on 2000+ real files', () => {
    expect(exampleFindings.length).toBeGreaterThan(0)
  })
})
