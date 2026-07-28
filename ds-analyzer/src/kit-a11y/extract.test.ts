import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import type { AnalyzerPaths } from '../config.js'
import type { ComponentsArtifact } from '../domain/components.js'
import { kitA11yArtifactSchema } from '../domain/kit-a11y.js'
import { extractKitA11y } from './extract.js'

/**
 * Synthetic upstream trees rather than the installed `@v-uik`.
 *
 * The real library is 63 packages and 37 MB, is not present on a fresh checkout, and cannot
 * be asserted against precisely — its contents change with every upstream release. These
 * fixtures pin the decisions instead: which packages count as evidence, how a component
 * without a declared package is recovered, and where the spacing grid draws the line.
 */

const roots: string[] = []

const upstream = (packages: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), 'vuik-'))
  roots.push(root)

  for (const [name, source] of Object.entries(packages)) {
    const directory = join(root, name, 'dist', 'esm')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'index.js'), source, 'utf8')
  }

  writeFileSync(join(root, 'base', 'package.json'), JSON.stringify({ version: '9.9.9' }), 'utf8')

  return root
}

const pathsWith = (upstreamDir: string | null): AnalyzerPaths =>
  ({
    analyzerRoot: '/analyzer',
    uiKitRoot: '/kit',
    themeSrcDir: '/kit/packages/theme/src',
    themePackageJson: '/kit/packages/theme/package.json',
    baseSrcDir: '/kit/packages/base/src',
    componentsDir: '/kit/packages/base/src/components',
    componentsBarrel: '/kit/packages/base/src/components/index.ts',
    baseBarrel: '/kit/packages/base/src/index.ts',
    artifactsDir: '/analyzer/artifacts',
    upstreamDir,
  }) satisfies AnalyzerPaths

const componentsWith = (entries: readonly { name: string; wraps: string[] }[]): ComponentsArtifact =>
  ({
    components: entries.map((entry) => ({ name: entry.name, wraps: entry.wraps })),
  }) as unknown as ComponentsArtifact

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('extractKitA11y', () => {
  it('records roles, aria attributes, keys and focus handling per component', () => {
    const root = upstream({
      base: 'export const noop = 1',
      tabs: `const T = { role: 'tablist' }; const K = ['ArrowLeft', 'ArrowRight']; import { findFocusableSibling } from 'x'; const A = 'aria-selected'`,
    })

    const artifact = extractKitA11y({
      paths: pathsWith(root),
      components: componentsWith([{ name: 'Tabs', wraps: ['@v-uik/base', '@v-uik/tabs'] }]),
    })

    const tabs = artifact.patterns.find((pattern) => pattern.component === 'Tabs')

    expect(tabs?.roles).toStrictEqual(['tablist'])
    expect(tabs?.keysHandled).toStrictEqual(['ArrowLeft', 'ArrowRight'])
    expect(tabs?.ariaAttributes).toStrictEqual(['aria-selected'])
    expect(tabs?.managesFocus).toBe(true)
    expect(tabs?.matchedBy).toBe('wraps')
  })

  it('refuses to credit a component for what shared infrastructure contains', () => {
    // The bug this pins: `@v-uik/utils` holds the library's keyboard helpers, so a
    // component that merely depends on it would inherit every key in the library. The first
    // draft of this extractor claimed `Spinner` handled arrow keys and `Escape` — confident,
    // checkable, and wrong.
    const root = upstream({
      base: `const R = { role: 'tablist' }`,
      utils: `const K = ['ArrowLeft', 'Escape']`,
      progress: `const R = { role: 'progressbar' }`,
    })

    const artifact = extractKitA11y({
      paths: pathsWith(root),
      components: componentsWith([{ name: 'Spinner', wraps: ['@v-uik/base', '@v-uik/utils', '@v-uik/progress'] }]),
    })

    const spinner = artifact.patterns.find((pattern) => pattern.component === 'Spinner')

    expect(spinner?.roles).toStrictEqual(['progressbar'])
    expect(spinner?.keysHandled).toStrictEqual([])
  })

  it('recovers a component that declares only the barrel, and says it guessed', () => {
    // Thirty-four of the kit's components import through `@v-uik/base` and name no specific
    // package. Without the fallback, `Modal`, `Tooltip` and `Accordion` would be missing
    // from the artifact entirely.
    const root = upstream({
      base: 'export const noop = 1',
      modal: `const R = { role: 'dialog' }; const K = ['Escape']`,
    })

    const artifact = extractKitA11y({
      paths: pathsWith(root),
      components: componentsWith([{ name: 'Modal', wraps: ['@v-uik/base'] }]),
    })

    const modal = artifact.patterns.find((pattern) => pattern.component === 'Modal')

    expect(modal?.roles).toStrictEqual(['dialog'])
    expect(modal?.keysHandled).toStrictEqual(['Escape'])
    expect(modal?.matchedBy).toBe('name')
  })

  it('maps a compound component name onto the upstream’s kebab-case directory', () => {
    const root = upstream({
      base: 'export const noop = 1',
      'browser-tabs': `const R = { role: 'tablist' }`,
    })

    const artifact = extractKitA11y({
      paths: pathsWith(root),
      components: componentsWith([{ name: 'BrowserTabs', wraps: ['@v-uik/base'] }]),
    })

    expect(artifact.patterns.find((pattern) => pattern.component === 'BrowserTabs')?.roles).toStrictEqual(['tablist'])
  })

  it('splits the spacing distribution on the grid rather than on frequency', () => {
    // Frequency alone cannot separate a step from an accident: `12px` and `15px` occur a
    // similar number of times, and no threshold keeps one without also discarding `24px`.
    const root = upstream({
      base: 'export const noop = 1',
      card: `const s = { padding: 8, paddingTop: 8, gap: 4, margin: 12, marginLeft: 24, paddingLeft: 15, gap2: 15 }`,
    })

    const artifact = extractKitA11y({
      paths: pathsWith(root),
      components: componentsWith([]),
    })

    expect(artifact.spacing.steps.map((step) => step.px)).toStrictEqual([4, 8, 12, 24])
    expect(artifact.spacing.offGridSteps.map((step) => step.px)).toStrictEqual([15])
    expect(artifact.spacing.gridBase).toBe(4)
  })

  it('produces a valid artifact that says so when the upstream is absent', () => {
    const artifact = extractKitA11y({ paths: pathsWith(null), components: componentsWith([]) })

    expect(() => kitA11yArtifactSchema.parse(artifact)).not.toThrow()
    expect(artifact.meta.upstreamAvailable).toBe(false)
    expect(artifact.diagnostics.map((entry) => entry.code)).toContain('upstream-not-installed')
    // The distinction that matters: no patterns because nothing was read, not because
    // nothing was found.
    expect(artifact.patterns).toStrictEqual([])
  })

  it('is deterministic', () => {
    const root = upstream({
      base: 'export const noop = 1',
      tabs: `const R = { role: 'tablist' }; const K = ['ArrowRight', 'ArrowLeft']`,
      modal: `const R = { role: 'dialog' }`,
    })

    const components = componentsWith([
      { name: 'Tabs', wraps: ['@v-uik/tabs'] },
      { name: 'Modal', wraps: ['@v-uik/base'] },
    ])

    const first = extractKitA11y({ paths: pathsWith(root), components })
    const second = extractKitA11y({ paths: pathsWith(root), components })

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})
