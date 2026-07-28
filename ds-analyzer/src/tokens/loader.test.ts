import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ExtractionError } from '../shared/errors.js'

import { loadThemeSource } from './loader.js'

/**
 * The loader executes the kit's theme sources. These specs pin the guard rails that
 * make that safe: it must refuse to run against a directory that is not a theme, and it
 * must fail loudly the moment the theme package stops being self-contained.
 */

const createdDirectories: string[] = []

const createThemeFixture = async (files: Readonly<Record<string, string>>): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ds-analyzer-theme-'))
  createdDirectories.push(directory)

  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(directory, name), contents, 'utf8')
  }

  return directory
}

/** Minimal but structurally complete stand-in for `packages/theme/src`. */
const MINIMAL_THEME: Readonly<Record<string, string>> = {
  'ref.ts': `
    export const ref = { typography: { fontFamily: { brand: 'Brand' } } }
    export const edsRef = { palette: { red: '#ff0000' } }
  `,
  'sys.ts': `
    export const sysLight = { Background: { backAccent: '{edsRef.palette.red}' } }
    export const sysDark = { Background: { backAccent: '{edsRef.palette.red}' } }
  `,
  'comp.ts': `export const comp = { button: { colorBackground: '{edsSys.Background.backAccent}' } }`,
  'calcTheme.ts': `
    import { ref, edsRef } from './ref'
    import { comp } from './comp'
    const replace = (value, values) => {
      if (typeof value === 'string') {
        const path = value.match(/\\{(.*?)\\}/)?.[1]
        if (!path) return value
        return path.split('.').reduce((acc, key) => acc?.[key], values)
      }
      if (typeof value !== 'object') return value
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item, values)]))
    }
    export const calcTheme = (sys) => {
      const edsSys = replace(sys, { edsRef })
      return { ref, edsRef, edsSys, comp: replace(comp, { edsRef, edsSys }) }
    }
  `,
  'light.ts': `
    import { calcTheme } from './calcTheme'
    import { sysLight } from './sys'
    export const light = calcTheme(sysLight)
  `,
  'dark.ts': `
    import { calcTheme } from './calcTheme'
    import { sysDark } from './sys'
    export const dark = calcTheme(sysDark)
  `,
}

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('loadThemeSource', () => {
  it('loads authored and resolved tiers from a self-contained theme', async () => {
    const theme = await loadThemeSource(await createThemeFixture(MINIMAL_THEME))

    expect(theme.edsRef).toEqual({ palette: { red: '#ff0000' } })
    expect(theme.sysLight).toEqual({ Background: { backAccent: '{edsRef.palette.red}' } })
    expect(theme.light.edsSys).toEqual({ Background: { backAccent: '#ff0000' } })
    expect(theme.light.comp).toEqual({ button: { colorBackground: '#ff0000' } })
    expect(theme.dark.edsSys).toEqual({ Background: { backAccent: '#ff0000' } })
  })

  it('names the missing files when the directory is not a theme', async () => {
    const directory = await createThemeFixture({ 'ref.ts': 'export const ref = {}' })

    await expect(loadThemeSource(directory)).rejects.toThrow(ExtractionError)
    await expect(loadThemeSource(directory)).rejects.toThrow(/sys\.ts/)
  })

  it('refuses to run once the theme package gains an external import', async () => {
    const directory = await createThemeFixture({
      ...MINIMAL_THEME,
      'ref.ts': `
        import { something } from '@v-uik/base'
        export const ref = { typography: { fontFamily: { brand: something } } }
        export const edsRef = { palette: { red: '#ff0000' } }
      `,
    })

    await expect(loadThemeSource(directory)).rejects.toThrow(/no longer self-contained/)
    await expect(loadThemeSource(directory)).rejects.toThrow(/@v-uik\/base/)
  })

  it('rejects a theme whose exports are not objects', async () => {
    const directory = await createThemeFixture({
      ...MINIMAL_THEME,
      'comp.ts': `export const comp = 'not an object'`,
    })

    await expect(loadThemeSource(directory)).rejects.toThrow(/"comp" is not an object/)
  })

  it('rejects a resolved theme that is missing a tier', async () => {
    const directory = await createThemeFixture({
      ...MINIMAL_THEME,
      'light.ts': `export const light = { edsRef: {}, edsSys: {} }`,
    })

    await expect(loadThemeSource(directory)).rejects.toThrow(/missing tier\(s\)/)
  })
})
