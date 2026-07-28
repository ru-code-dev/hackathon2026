import type { SourceFile } from 'ts-morph'
import { describe, expect, it } from 'vitest'

import { createSourceFiles, testLocate, testPaths } from '../testing/source.js'

import { readBarrel } from './barrel.js'
import { collectModuleExports, type ExportWalkContext } from './exports.js'
import { setFileProbe } from './resolve.js'

/**
 * Builds a fixture module graph and a walk context wired to an in-memory probe, so
 * resolution is exercised without touching the real filesystem.
 */
const buildGraph = (files: Readonly<Record<string, string>>) => {
  const sourceFiles = createSourceFiles(files)
  const filesByPath = new Map<string, SourceFile>(sourceFiles.map((file) => [file.getFilePath(), file]))
  const probe = setFileProbe(filesByPath.keys())

  const componentsByFile = new Map<string, Set<string>>(
    sourceFiles.map((file) => [file.getFilePath(), new Set<string>()]),
  )

  const context: ExportWalkContext = { paths: testPaths, locate: testLocate, componentsByFile, filesByPath, probe }

  const entry = (relativePath: string): SourceFile => {
    const file = filesByPath.get(`${testPaths.baseSrcDir}/${relativePath}`)
    if (!file) {
      throw new Error(`fixture missing: ${relativePath}`)
    }
    return file
  }

  return { context, entry, probe, componentsByFile }
}

describe('collectModuleExports', () => {
  it('collects locally declared exports of every kind', () => {
    const { context, entry } = buildGraph({
      'components/X/index.ts': `
        export const value = 1
        export function helper() { return 1 }
        export class Thing {}
        export interface Props { a?: string }
        export type Alias = string
        export enum Mode { A }
      `,
    })

    const { symbols } = collectModuleExports(entry('components/X/index.ts'), context)

    expect(symbols.map((symbol) => symbol.name)).toEqual(['Alias', 'Mode', 'Props', 'Thing', 'helper', 'value'])
    expect(symbols.find((symbol) => symbol.name === 'Props')?.kind).toBe('type')
    expect(symbols.find((symbol) => symbol.name === 'Alias')?.kind).toBe('type')
    expect(symbols.find((symbol) => symbol.name === 'value')?.kind).toBe('value')
  })

  it('classifies a declaration as a component when the file declares one by that name', () => {
    const { context, entry, componentsByFile } = buildGraph({
      'components/X/index.ts': `export const Button = 1`,
    })
    componentsByFile.set(`${testPaths.baseSrcDir}/components/X/index.ts`, new Set(['Button']))

    const { symbols } = collectModuleExports(entry('components/X/index.ts'), context)

    expect(symbols[0]?.kind).toBe('component')
  })

  it('follows local star re-exports transitively', () => {
    const { context, entry } = buildGraph({
      'components/index.ts': `export * from './Button'`,
      'components/Button/index.ts': `export * from './Button'`,
      'components/Button/Button.ts': `export const Button = 1\nexport type ButtonProps = { a?: string }`,
    })

    const { symbols } = collectModuleExports(entry('components/index.ts'), context)

    expect(symbols.map((symbol) => symbol.name)).toEqual(['Button', 'ButtonProps'])
  })

  it('records external star re-exports as unresolved edges instead of symbols', () => {
    const { context, entry } = buildGraph({
      'components/index.ts': `export * from './Button'\nexport * from '@v-uik/grid'`,
      'components/Button/index.ts': `export const Button = 1`,
    })

    const { symbols, unresolvedStars } = collectModuleExports(entry('components/index.ts'), context)

    expect(symbols.map((symbol) => symbol.name)).toEqual(['Button'])
    expect(unresolvedStars).toEqual([
      { specifier: '@v-uik/grid', packageName: '@v-uik/grid', from: 'packages/base/src/components/index.ts' },
    ])
  })

  it('resolves named re-exports and records aliasing', () => {
    const { context, entry } = buildGraph({
      'components/index.ts': `export { Classes as SelectClasses } from '@v-uik/select'`,
    })

    const { symbols } = collectModuleExports(entry('components/index.ts'), context)

    expect(symbols[0]).toMatchObject({
      name: 'SelectClasses',
      localName: 'Classes',
      origin: 'external',
      from: '@v-uik/select',
    })
  })

  it('marks type-only re-exports as types', () => {
    const { context, entry } = buildGraph({
      'components/index.ts': `export type { CommonProps as TagCommonProps } from '@v-uik/tag'`,
    })

    expect(collectModuleExports(entry('components/index.ts'), context).symbols[0]?.kind).toBe('type')
  })

  it('lets a local declaration shadow a star re-export of the same name', () => {
    const { context, entry } = buildGraph({
      'components/index.ts': `export * from './Button'\nexport const Button = 2`,
      'components/Button/index.ts': `export const Button = 1`,
    })

    const { symbols } = collectModuleExports(entry('components/index.ts'), context)

    expect(symbols).toHaveLength(1)
    expect(symbols[0]?.from).toBeNull()
  })

  it('terminates on a cyclic barrel graph', () => {
    const { context, entry } = buildGraph({
      'components/a.ts': `export * from './b'\nexport const A = 1`,
      'components/b.ts': `export * from './a'\nexport const B = 1`,
    })

    const { symbols } = collectModuleExports(entry('components/a.ts'), context)

    expect(symbols.map((symbol) => symbol.name).sort()).toEqual(['A', 'B'])
  })

  it('resolves the @src path alias', () => {
    const { context, entry } = buildGraph({
      'components/X/index.ts': `export * from '@src/shared/types'`,
      'shared/types.ts': `export type Size = 'sm'`,
    })

    expect(collectModuleExports(entry('components/X/index.ts'), context).symbols.map((s) => s.name)).toEqual(['Size'])
  })

  it('returns nothing for a module with no exports', () => {
    const { context, entry } = buildGraph({ 'components/X/index.ts': `const internal = 1` })

    expect(collectModuleExports(entry('components/X/index.ts'), context)).toEqual({
      symbols: [],
      unresolvedStars: [],
    })
  })
})

describe('readBarrel', () => {
  it('reads entries verbatim without following them', () => {
    const { entry, probe } = buildGraph({
      'components/index.ts': `
        export * from './Button'
        export * from '@v-uik/grid'
        export type { Classes as SelectClasses } from '@v-uik/select'
      `,
      'components/Button/index.ts': `export const Button = 1`,
    })

    const entries = readBarrel(entry('components/index.ts'), testPaths, testLocate, probe)

    expect(entries).toEqual([
      expect.objectContaining({
        specifier: './Button',
        origin: 'local',
        star: true,
        names: [],
        typeOnly: false,
        resolvedFile: 'packages/base/src/components/Button/index.ts',
      }),
      expect.objectContaining({ specifier: '@v-uik/grid', origin: 'external', star: true, resolvedFile: null }),
      expect.objectContaining({ specifier: '@v-uik/select', names: ['SelectClasses'], star: false, typeOnly: true }),
    ])
  })

  it('skips local re-exports that have no module specifier', () => {
    const { entry, probe } = buildGraph({ 'components/index.ts': `const a = 1\nexport { a }` })

    expect(readBarrel(entry('components/index.ts'), testPaths, testLocate, probe)).toEqual([])
  })
})
