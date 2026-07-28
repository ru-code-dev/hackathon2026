import { beforeAll, describe, expect, it } from 'vitest'

import { componentsArtifactSchema, type ComponentsArtifact, type UiKitComponentDto } from '../domain/components.js'

import { extractComponents } from './extract.js'

/**
 * Integration coverage against the real UI kit.
 *
 * These assertions are written against facts a consumer of the artifact will rely on —
 * that `Button` exposes exactly three `view` values, that `Input` is deprecated, that
 * the barrel passes `@v-uik` packages straight through — so a regression in the
 * extractor shows up as a broken promise rather than a changed number.
 */

let artifact: ComponentsArtifact

const component = (name: string): UiKitComponentDto => {
  const found = artifact.components.find((candidate) => candidate.name === name)
  if (!found) {
    throw new Error(`component not extracted: ${name}`)
  }
  return found
}

beforeAll(async () => {
  const result = await extractComponents()
  artifact = result.artifact
}, 120_000)

describe('extractComponents — contract', () => {
  it('produces an artifact that satisfies its schema', () => {
    expect(() => componentsArtifactSchema.parse(artifact)).not.toThrow()
  })

  it('declares its source, barrels and the absence of a type checker', () => {
    expect(artifact.$schema).toBe('ds-analyzer/components@1')
    expect(artifact.meta.sourceRoot).toBe('packages/base/src')
    expect(artifact.meta.barrels).toContain('packages/base/src/components/index.ts')
    expect(artifact.meta.typeCheckerAvailable).toBe(false)
  })

  it('is JSON-serialisable without loss', () => {
    const roundTripped: unknown = JSON.parse(JSON.stringify(artifact))
    expect(roundTripped).toEqual(artifact)
  })
})

describe('extractComponents — coverage', () => {
  it('finds every component directory on disk', () => {
    expect(artifact.components.length).toBeGreaterThanOrEqual(60)
    expect(artifact.meta.counts.componentDirectories).toBe(artifact.components.length)
  })

  it('marks the barrel-exported directories as public', () => {
    for (const name of ['Button', 'Modal', 'TextField', 'Select', 'Table', 'Tabs']) {
      expect(component(name).public, name).toBe(true)
    }
  })

  it('resolves an entry file for nearly every directory', () => {
    const withoutEntry = artifact.components.filter((entry) => entry.entryFile === null)
    expect(withoutEntry.length).toBeLessThanOrEqual(3)
  })

  it('excludes stories and examples from the declared component list', () => {
    const names = component('Button').components.map((entry) => entry.name)

    expect(names).toContain('Button')
    // These are Storybook demos in Button/examples, not kit API.
    expect(names).not.toContain('FilledButtons')
    expect(names).not.toContain('IconSizes')
  })
})

describe('extractComponents — Button as a reference case', () => {
  it('detects the component and its statically attached sub-component', () => {
    const button = component('Button').components.find((entry) => entry.name === 'Button')

    expect(button?.detection).toBe('forwardRef')
    expect(button?.subcomponents).toEqual(['Icon'])
  })

  it('extracts the public variant sets with their internal value mapping', () => {
    const variants = component('Button').variants

    expect(variants.find((entry) => entry.name === 'views')).toMatchObject({
      keys: ['primary', 'secondary', 'negative'],
      values: { primary: 'primary', secondary: 'secondary', negative: 'error' },
    })
    expect(variants.find((entry) => entry.name === 'sizes')).toMatchObject({
      keys: ['xs', 'sm', 'md'],
      values: { xs: 'sm', sm: 'md', md: 'lg' },
    })
  })

  it('extracts the overridable style slots', () => {
    const slots = component('Button').slots.find((entry) => entry.name === 'ButtonClasses')

    expect(slots?.slots.map((slot) => slot.name)).toEqual(['spinner', 'onlyIcon', 'contentContainer'])
    expect(slots?.unresolvedBases).toEqual(["ButtonProps['classes']"])
  })

  it('records the upstream package it wraps', () => {
    expect(component('Button').wraps).toContain('@v-uik/button')
  })

  it('inventories its documentation and test assets', () => {
    const assets = component('Button').assets

    expect(assets.stories).toContain('Button.stories.tsx')
    expect(assets.docs).toContain('Button.mdx')
    expect(assets.testFiles).toContain('__tests__/Button.test.tsx')
    expect(assets.e2eSnapshots).toBeGreaterThan(100)
    expect(assets.examples).toBeGreaterThan(0)
  })
})

describe('extractComponents — public API surface', () => {
  it('exposes the headline components as public symbols', () => {
    const names = new Set(artifact.publicSymbols.map((symbol) => symbol.name))

    for (const expected of ['Button', 'Modal', 'TextField', 'Select', 'Tabs', 'Tooltip']) {
      expect(names, expected).toContain(expected)
    }
  })

  it('attributes a symbol to the component directory that declares it', () => {
    expect(artifact.publicSymbols.find((symbol) => symbol.name === 'Button')?.component).toBe('Button')
  })

  it('flags deprecated public symbols', () => {
    const input = artifact.publicSymbols.find((symbol) => symbol.name === 'Input')

    expect(input?.deprecated).toBe(true)
    expect(artifact.meta.counts.deprecatedSymbols).toBeGreaterThan(0)
  })

  it('has no duplicate symbol names', () => {
    const names = artifact.publicSymbols.map((symbol) => symbol.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('extractComponents — external boundary', () => {
  it('records the @v-uik packages the barrel re-exports wholesale', () => {
    const packages = artifact.externalReExports.map((entry) => entry.package)

    expect(packages).toContain('@v-uik/grid')
    expect(packages).toContain('@v-uik/container')
    expect(packages.every((name) => name.startsWith('@'))).toBe(true)
  })

  it('states plainly that those packages could not be resolved', () => {
    expect(artifact.externalReExports.every((entry) => !entry.resolved)).toBe(true)
    expect(artifact.diagnostics.map((entry) => entry.code)).toContain('external-reexport-unresolved')
  })

  it('reads the barrel verbatim, keeping local and external entries apart', () => {
    const local = artifact.barrel.filter((entry) => entry.origin === 'local')
    const external = artifact.barrel.filter((entry) => entry.origin === 'external')

    expect(local.length).toBeGreaterThan(30)
    expect(external.length).toBeGreaterThan(10)
    expect(local.every((entry) => entry.resolvedFile !== null)).toBe(true)
  })

  it('flags the do-not-use module the barrel exports', () => {
    expect(artifact.diagnostics.map((entry) => entry.code)).toContain('do-not-use-exported')
  })
})

describe('extractComponents — props', () => {
  it('extracts prop members with docs from a locally declared interface', () => {
    const props = artifact.components.flatMap((entry) => entry.props).find((entry) => entry.name === 'TextFieldProps')

    expect(props).toBeDefined()
    expect(props?.members.some((member) => member.name === 'size')).toBe(true)
    expect(props?.members.some((member) => member.doc.deprecated)).toBe(true)
  })

  it('records unresolvable heritage rather than claiming an empty prop surface', () => {
    const props = artifact.components.flatMap((entry) => entry.props).find((entry) => entry.name === 'ButtonProps')

    expect(props?.members).toEqual([])
    expect(props?.extends.length).toBeGreaterThan(0)
  })

  it('reports the components whose prop contract lives entirely upstream', () => {
    expect(artifact.diagnostics.map((entry) => entry.code)).toContain('props-type-not-found')
  })
})

describe('extractComponents — determinism', () => {
  it('produces byte-identical output across runs', async () => {
    const second = await extractComponents()
    expect(JSON.stringify(second.artifact)).toBe(JSON.stringify(artifact))
  }, 120_000)
})
