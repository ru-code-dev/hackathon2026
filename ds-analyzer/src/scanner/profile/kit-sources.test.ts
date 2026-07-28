import { describe, expect, it } from 'vitest'

import type { ImportRecord, ReExportRecord } from '../../domain/observations.js'
import { computeKitClosure, DEFAULT_KIT_PACKAGES, kitComponentFor } from './kit-sources.js'

const reExport = (
  file: string,
  specifier: string,
  names: string[],
  resolvedFile: string | null = null,
): ReExportRecord => ({
  specifier,
  names: names.map((exported) => ({ exported, local: exported, typeOnly: false })),
  star: names.length === 0,
  resolution: { kind: resolvedFile === null ? 'package' : 'relative', file: resolvedFile },
  file,
  line: 1,
  column: 1,
})

const importRecord = (file: string, specifier: string, names: string[]): ImportRecord => ({
  specifier,
  names: names.map((imported) => ({ imported, local: imported, typeOnly: false })),
  defaultImport: null,
  namespaceImport: null,
  typeOnly: false,
  resolution: { kind: 'package', file: null },
  file,
  line: 1,
  column: 1,
})

const closureOf = (input: { reExports?: ReExportRecord[]; imports?: ImportRecord[] }) =>
  computeKitClosure({
    reExports: input.reExports ?? [],
    imports: input.imports ?? [],
    kitPackages: [...DEFAULT_KIT_PACKAGES],
  })

describe('computeKitClosure', () => {
  it('recognises a direct kit import', () => {
    const closure = closureOf({ imports: [importRecord('src/a.tsx', '@sds-eng/base', ['Button'])] })

    expect(closure.usesKit).toBe(true)
    expect(closure.sources.map((source) => source.specifier)).toEqual(['@sds-eng/base'])
  })

  it('promotes a project barrel that re-exports the kit', () => {
    const closure = closureOf({
      reExports: [reExport('src/shared/ui/index.ts', '@sds-eng/base', ['Button', 'Modal'])],
    })

    const barrel = closure.sources.find((source) => source.specifier === 'src/shared/ui/index.ts')

    expect(barrel?.kind).toBe('project-barrel')
    expect(barrel?.names).toEqual(['Button', 'Modal'])
  })

  it('follows a chain of barrels to a fixed point', () => {
    // outer -> inner -> @sds-eng/base. One pass would only reach `inner`.
    const closure = closureOf({
      reExports: [
        reExport('src/ui/outer.ts', './inner.js', ['Button'], 'src/ui/inner.ts'),
        reExport('src/ui/inner.ts', '@sds-eng/base', ['Button']),
      ],
    })

    expect(closure.sources.map((source) => source.specifier)).toContain('src/ui/outer.ts')
    expect(closure.sources.map((source) => source.specifier)).toContain('src/ui/inner.ts')
  })

  it('does not promote a barrel that only re-exports the wrapped upstream', () => {
    // Re-exporting @v-uik is a bypass, not adoption; a different rule reports it.
    const closure = closureOf({
      reExports: [reExport('src/ui/raw.ts', '@v-uik/button', ['Button'])],
    })

    expect(closure.sources.find((source) => source.specifier === 'src/ui/raw.ts')).toBeUndefined()
    expect(closure.sources.find((source) => source.specifier === '@v-uik/button')?.kind).toBe('wrapped-upstream')
  })

  it('says the kit is unused when only the upstream is imported', () => {
    const closure = closureOf({ imports: [importRecord('src/a.tsx', '@v-uik/button', ['Button'])] })

    expect(closure.usesKit).toBe(false)
  })

  it('reports no sources for a project that never touches the kit', () => {
    const closure = closureOf({ imports: [importRecord('src/a.tsx', 'react', ['useState'])] })

    expect(closure.sources).toEqual([])
    expect(closure.usesKit).toBe(false)
  })

  it('terminates on a cycle between two barrels', () => {
    const closure = closureOf({
      reExports: [reExport('src/a.ts', './b.js', ['X'], 'src/b.ts'), reExport('src/b.ts', './a.js', ['X'], 'src/a.ts')],
    })

    expect(closure.sources).toEqual([])
  })
})

describe('kitComponentFor', () => {
  it('accepts any name from a star source, whose exports cannot be enumerated', () => {
    const closure = closureOf({ imports: [importRecord('src/a.tsx', '@sds-eng/base', ['Button'])] })

    expect(kitComponentFor(closure, '@sds-eng/base', 'Anything')).toBe('Anything')
  })

  it('accepts only the listed names from an enumerated barrel', () => {
    const closure = closureOf({
      reExports: [reExport('src/ui/index.ts', '@sds-eng/base', ['Button'])],
    })

    expect(kitComponentFor(closure, 'src/ui/index.ts', 'Button')).toBe('Button')
    expect(kitComponentFor(closure, 'src/ui/index.ts', 'MyButton')).toBeNull()
  })

  it('returns null for a module that is not a kit source', () => {
    const closure = closureOf({})

    expect(kitComponentFor(closure, 'src/other.ts', 'Button')).toBeNull()
    expect(kitComponentFor(closure, null, 'Button')).toBeNull()
  })
})
