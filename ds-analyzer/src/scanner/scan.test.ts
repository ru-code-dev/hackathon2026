import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { observationsSchema } from '../domain/observations.js'
import { projectProfileSchema } from '../domain/profile.js'
import { analyzerRoot } from '../config.js'
import { scanProject, type ScanResult } from './scan.js'

/**
 * Integration coverage against the `demo-app` fixture.
 *
 * These assertions are the contract the analysis stage relies on. Every one of them
 * corresponds to something a naive scanner gets wrong: the alias, the re-export barrel,
 * the gitignored directory, the two-hop Sass variable, the slot map.
 */

const DEMO_APP = resolve(analyzerRoot, '..', 'demo-app')

describe('scanProject on demo-app', () => {
  let result: ScanResult

  beforeAll(() => {
    result = scanProject({ path: DEMO_APP })
  })

  it('produces artifacts that satisfy their own schemas', () => {
    expect(() => projectProfileSchema.parse(result.profile)).not.toThrow()
    expect(() => observationsSchema.parse(result.observations)).not.toThrow()
  })

  it('anchors on the package root', () => {
    expect(result.profile.root).toBe(DEMO_APP)
    expect(result.profile.name).toBe('acme-orders')
    expect(result.profile.scope).toBe('')
  })

  it('works with no dependencies installed', () => {
    // The fixture has no node_modules by design: an audit has to run on a fresh checkout.
    expect(result.profile.files.scanned).toBeGreaterThan(0)
    expect(result.profile.files.unparseable).toBe(0)
  })

  it('reads the alias from both tsconfig and the vite config', () => {
    const patterns = result.profile.aliases.map((alias) => `${alias.pattern}=${alias.source}`)

    expect(patterns).toContain('@/*=tsconfig')
    expect(patterns).toContain('@=vite')
  })

  it('finds the kit behind the project’s own barrel', () => {
    const specifiers = result.profile.kitSources.map((source) => source.specifier)

    expect(specifiers).toContain('@sds-eng/base')
    expect(specifiers).toContain('src/shared/ui/index.ts')
    expect(result.profile.usesKit).toBe(true)
  })

  it('classifies the wrapped upstream separately from the kit', () => {
    const upstream = result.profile.kitSources.find((source) => source.specifier === '@v-uik/button')

    expect(upstream?.kind).toBe('wrapped-upstream')
  })

  it('resolves a Button imported through the alias and the barrel', () => {
    // `import { Button } from '@/shared/ui'` — two indirections away from the kit.
    const element = result.observations.jsxElements.find(
      (candidate) => candidate.file === 'src/App.tsx' && candidate.name === 'Button',
    )

    expect(element?.resolvedFrom).toBe('@/shared/ui')
    expect(element?.kitComponent).toBe('Button')
    expect(element?.props['view']).toBe('ghost')
  })

  it('honours the project gitignore', () => {
    expect(result.observations.files).not.toContain('src/generated/ApiTypes.tsx')
    expect(result.observations.styleValues.some((value) => value.file.startsWith('src/generated/'))).toBe(false)
  })

  it('detects every style syntax the fixture uses', () => {
    expect(result.profile.styleSyntaxes).toEqual(
      expect.arrayContaining(['scss', 'scss-modules', 'styled-components', 'inline-style', 'ts-literal']),
    )
  })

  it('resolves a two-hop Sass variable and blames the line holding the literal', () => {
    const declaration = result.observations.styleValues.find(
      (value) => value.file === 'src/shared/ui/legacy/OldCard.module.scss' && value.property === 'border-left',
    )

    expect(declaration?.value).toBe('2px solid #ff1f78')
    expect(declaration?.authored).toBe('2px solid v.$accent-border')
    expect(declaration?.rootCause).toEqual({ file: 'src/shared/styles/_vars.scss', line: 15, name: '$brand' })
  })

  it('links a slot map to the kit component it styles', () => {
    const declaration = result.observations.styleValues.find(
      (value) => value.file === 'src/features/auth/PasswordField.module.scss' && value.property === 'font-family',
    )

    expect(declaration?.appliedTo).toEqual({ kind: 'kit-component', name: 'TextField', slot: 'input' })
  })

  it('links a plain className to the kit component it styles', () => {
    const declaration = result.observations.styleValues.find(
      (value) => value.file === 'src/features/auth/PasswordField.module.scss' && value.property === 'padding',
    )

    expect(declaration?.appliedTo).toEqual({ kind: 'kit-component', name: 'TextField', slot: null })
  })

  it('does not mistake a local component’s own classes for kit overrides', () => {
    const declaration = result.observations.styleValues.find(
      (value) => value.file === 'src/features/orders/OrderDialog.module.scss' && value.property === 'background',
    )

    expect(declaration?.appliedTo?.kind).toBe('host-element')
  })

  it('records both branches of a conditional inline style', () => {
    const borders = result.observations.styleValues.filter(
      (value) => value.file === 'src/features/settings/SettingsTabs.tsx' && value.property === 'border-bottom',
    )

    expect(borders.map((value) => value.value)).toEqual(['2px solid #2969e3', 'none'])
  })

  it('records interpolated styled-components values as limitations rather than dropping them', () => {
    const dynamic = result.observations.limitations.filter(
      (limitation) => limitation.file === 'src/shared/ui/MyButton.tsx' && limitation.reason === 'dynamic-styles',
    )

    expect(dynamic).toHaveLength(2)
  })

  it('picks up design literals sitting in plain TypeScript objects', () => {
    const literals = result.observations.styleValues.filter(
      (value) => value.file === 'src/shared/ui/MyButton.tsx' && value.source === 'ts-literal',
    )

    expect(literals.map((value) => value.value)).toEqual([
      '#2969e3',
      '#f1f3f6',
      '#e31227',
      '5px 11px',
      '9px 15px',
      '13px 19px',
    ])
  })

  it('reads presentational SVG attributes', () => {
    const strokes = result.observations.styleValues.filter(
      (value) => value.file === 'src/shared/ui/Spinner.tsx' && value.property === 'stroke',
    )

    expect(strokes.map((value) => value.value)).toEqual(['#e9edf2', '#2969e3'])
  })

  it('describes local components well enough to rank them later', () => {
    const dialog = result.observations.declarations.find((candidate) => candidate.name === 'OrderDialog')

    expect(dialog?.ariaRoles).toContain('dialog')
    expect(dialog?.ariaAttributes).toContain('aria-modal')
    expect(dialog?.nativeTags).toEqual(expect.arrayContaining(['button', 'div', 'header']))
    expect(dialog?.props).toEqual(['children', 'onClose', 'open', 'title'])
    expect(dialog?.kitComponentsUsed).toEqual(['Button', 'Text'])
    expect(dialog?.astSignature.length).toBeGreaterThan(20)
  })

  it('notices an inline SVG', () => {
    const spinner = result.observations.declarations.find((candidate) => candidate.name === 'Spinner')

    expect(spinner?.hasInlineSvg).toBe(true)
  })

  it('is deterministic', () => {
    const second = scanProject({ path: DEMO_APP })

    expect(JSON.stringify(second.observations)).toBe(JSON.stringify(result.observations))
    expect(JSON.stringify(second.profile)).toBe(JSON.stringify(result.profile))
  })
})

describe('scanProject scoping', () => {
  it('narrows collection to a subdirectory while still reading root configuration', () => {
    const scoped = scanProject({ path: resolve(DEMO_APP, 'src/features/orders') })

    expect(scoped.profile.root).toBe(DEMO_APP)
    expect(scoped.profile.scope).toBe('src/features/orders')
    expect(scoped.observations.files.every((file) => file.startsWith('src/features/orders/'))).toBe(true)
    // The alias lives in the root tsconfig, outside the scope, and must still be known.
    expect(scoped.profile.aliases.map((alias) => alias.pattern)).toContain('@/*')
  })

  it('accepts a single file', () => {
    const single = scanProject({ path: resolve(DEMO_APP, 'src/features/orders/OrderCard.tsx') })

    expect(single.observations.files).toEqual(['src/features/orders/OrderCard.tsx'])
    expect(single.observations.styleValues.length).toBeGreaterThan(0)
  })

  it('accepts an extra exclude pattern', () => {
    const excluded = scanProject({ path: DEMO_APP, exclude: ['src/features/**'] })

    expect(excluded.observations.files.some((file) => file.startsWith('src/features/'))).toBe(false)
  })
})
