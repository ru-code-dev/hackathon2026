import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { resolvePaths } from '../config.js'
import { componentsArtifactSchema } from '../domain/components.js'
import type { KitA11yArtifact } from '../domain/kit-a11y.js'
import { kitA11yArtifactSchema } from '../domain/kit-a11y.js'
import { extractKitA11y } from './extract.js'

/**
 * The extractor against the real `@v-uik`, not a fixture.
 *
 * `extract.test.ts` pins the decisions on synthetic trees, which is the right place for
 * them — but it cannot catch the failure that actually threatens this artifact. The
 * extractor reads compiled JavaScript with regular expressions, so an upstream that changes
 * bundler, enables name mangling, or moves its output would make every pattern come back
 * empty. Synthetic fixtures would keep passing, the artifact would validate, and the
 * accessibility rules would go quiet across the board while reporting nothing wrong.
 *
 * These assertions are the tripwire. They name facts about `@v-uik@1.23` that are true by
 * inspection and would be false if extraction silently degraded.
 *
 * Skipped when the upstream is not installed, because the analyzer must remain usable on a
 * bare checkout — that is a deliberate property, not a gap in coverage.
 */

const paths = resolvePaths()
const upstreamInstalled = paths.upstreamDir !== null

describe.skipIf(!upstreamInstalled)('extractKitA11y against the installed @v-uik', () => {
  let artifact: KitA11yArtifact

  beforeAll(() => {
    const components = componentsArtifactSchema.parse(
      JSON.parse(readFileSync(join(paths.artifactsDir, 'components.json'), 'utf8')),
    )

    artifact = extractKitA11y({ paths, components })
  })

  it('satisfies its own schema', () => {
    expect(() => kitA11yArtifactSchema.parse(artifact)).not.toThrow()
  })

  it('actually read the upstream', () => {
    expect(artifact.meta.upstreamAvailable).toBe(true)
    expect(artifact.meta.packagesScanned).toBeGreaterThan(40)
    expect(artifact.meta.upstreamVersion).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('finds evidence for a substantial share of the kit', () => {
    // Twenty is far below the thirty-two seen today and far above what a broken regular
    // expression would produce, so the check survives upstream churn without going blind.
    expect(artifact.patterns.length).toBeGreaterThan(20)
  })

  it('reads the tabs contract the keyboard rule depends on', () => {
    // `a11y.pattern.keyboard` says "the kit's Tabs handles these keys and yours handles
    // none". If this ever stops being true, that sentence becomes a lie the report prints
    // with confidence.
    const tabs = artifact.patterns.find((pattern) => pattern.component === 'Tabs')

    expect(tabs).toBeDefined()
    expect(tabs?.roles).toContain('tablist')
    expect(tabs?.keysHandled).toEqual(expect.arrayContaining(['ArrowLeft', 'ArrowRight']))
    expect(tabs?.managesFocus).toBe(true)
  })

  it('reads the dialog contract the focus rule depends on', () => {
    const modal = artifact.patterns.find((pattern) => pattern.component === 'Modal')

    expect(modal).toBeDefined()
    expect(modal?.roles).toContain('dialog')
    expect(modal?.keysHandled).toContain('Escape')
  })

  it('does not credit a component with what shared infrastructure contains', () => {
    // The regression this guards: `Spinner` depends on `@v-uik/utils`, where the library's
    // keyboard helpers live. An earlier version reported it as handling arrow keys.
    const spinner = artifact.patterns.find((pattern) => pattern.component === 'Spinner')

    expect(spinner?.keysHandled ?? []).not.toContain('ArrowLeft')
    expect(spinner?.roles ?? []).toContain('progressbar')
  })

  it('recovers components that import through the barrel', () => {
    // Thirty-four kit components declare only `@v-uik/base`. Without the name fallback,
    // `Modal`, `Tooltip` and `Accordion` vanish from the artifact entirely.
    const byName = artifact.patterns.filter((pattern) => pattern.matchedBy === 'name')

    expect(byName.length).toBeGreaterThan(5)
  })

  it('derives a spacing scale that is actually a scale', () => {
    expect(artifact.spacing.totalDeclarations).toBeGreaterThan(100)
    expect(artifact.spacing.gridBase).toBe(4)
    expect(artifact.spacing.gridCoverage).toBeGreaterThan(0.8)

    // Every published step is on the grid by construction; the outliers live separately.
    for (const step of artifact.spacing.steps) {
      expect(step.px % artifact.spacing.gridBase).toBe(0)
    }
    expect(artifact.spacing.steps.map((step) => step.px)).toEqual(expect.arrayContaining([4, 8, 16]))
  })

  it('is deterministic against the real tree', () => {
    const components = componentsArtifactSchema.parse(
      JSON.parse(readFileSync(join(paths.artifactsDir, 'components.json'), 'utf8')),
    )

    expect(JSON.stringify(extractKitA11y({ paths, components }))).toBe(JSON.stringify(artifact))
  })
})
