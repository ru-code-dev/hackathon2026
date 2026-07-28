import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { build } from 'esbuild'

import { ExtractionError } from '../shared/errors.js'
import { isPlainRecord, type PlainRecord } from '../shared/object.js'
import { compareStrings } from '../shared/sort.js'

/**
 * Loads the design system's theme by *executing its TypeScript sources*.
 *
 * Two other approaches were rejected:
 *
 * - Importing the published package — the kit's `node_modules` are not installed and
 *   `@sds-eng/theme` is not on a public registry.
 * - Parsing the sources with an AST — `calcTheme()` performs non-trivial reference
 *   resolution (including an `rgba({ref},0.06)` → `#rrggbbaa` alpha merge) that would
 *   have to be reimplemented, and any drift between the two implementations would
 *   silently corrupt the artifact.
 *
 * Executing the real sources is safe here because `packages/theme` has **zero**
 * external imports — it is a closed set of plain object literals plus pure helpers.
 * That is asserted by {@link assertSelfContained} so the assumption fails loudly if a
 * future kit version introduces a dependency.
 *
 * Both the *authored* tiers (`sysLight`, `comp` — still carrying `{edsRef.…}`
 * templates) and the *resolved* themes (`light`, `dark`) are returned, so the
 * extractor can record provenance alongside final values.
 */
export interface ResolvedTheme {
  readonly ref: PlainRecord
  readonly edsRef: PlainRecord
  readonly edsSys: PlainRecord
  readonly comp: PlainRecord
}

export interface ThemeSource {
  /** Authored primitives; already literal, no references. */
  readonly edsRef: PlainRecord
  /** Authored typography families exposed under the legacy `ref` export. */
  readonly ref: PlainRecord
  /** Authored semantic tier, light mode — contains `{edsRef.…}` templates. */
  readonly sysLight: PlainRecord
  /** Authored semantic tier, dark mode. */
  readonly sysDark: PlainRecord
  /** Authored component tier — contains `{edsRef.…}` and `{edsSys.…}` templates. */
  readonly comp: PlainRecord
  /** Fully resolved light theme as shipped to consumers. */
  readonly light: ResolvedTheme
  /** Fully resolved dark theme as shipped to consumers. */
  readonly dark: ResolvedTheme
}

const ENTRY_SOURCE = `
export { ref, edsRef } from './ref'
export { sysLight, sysDark } from './sys'
export { comp } from './comp'
export { light } from './light'
export { dark } from './dark'
`

const REQUIRED_SOURCE_FILES = ['ref.ts', 'sys.ts', 'comp.ts', 'light.ts', 'dark.ts', 'calcTheme.ts'] as const

const RESOLVED_THEME_KEYS = ['ref', 'edsRef', 'edsSys', 'comp'] as const

const assertSourcesPresent = (themeSrcDir: string): void => {
  const missing = REQUIRED_SOURCE_FILES.filter((file) => !existsSync(join(themeSrcDir, file)))

  if (missing.length > 0) {
    throw new ExtractionError(
      `Theme sources not found in "${themeSrcDir}". Missing: ${missing.join(', ')}. ` +
        'Check that the UI kit path points at packages/theme/src.',
    )
  }
}

/**
 * Fails if the theme package gained an external import, which would make executing it
 * dependent on the kit's uninstalled `node_modules`.
 */
const assertSelfContained = (externalImports: readonly string[]): void => {
  if (externalImports.length > 0) {
    throw new ExtractionError(
      `The theme package is no longer self-contained; it now imports: ${externalImports.join(', ')}. ` +
        'The loader executes theme sources directly and cannot resolve third-party modules.',
    )
  }
}

const asRecord = (value: unknown, exportName: string): PlainRecord => {
  if (!isPlainRecord(value)) {
    throw new ExtractionError(`Theme export "${exportName}" is not an object (got ${typeof value}).`)
  }
  return value
}

const asResolvedTheme = (value: unknown, exportName: string): ResolvedTheme => {
  const record = asRecord(value, exportName)

  const missing = RESOLVED_THEME_KEYS.filter((key) => !isPlainRecord(record[key]))
  if (missing.length > 0) {
    throw new ExtractionError(`Theme export "${exportName}" is missing tier(s): ${missing.join(', ')}.`)
  }

  return {
    ref: record['ref'] as PlainRecord,
    edsRef: record['edsRef'] as PlainRecord,
    edsSys: record['edsSys'] as PlainRecord,
    comp: record['comp'] as PlainRecord,
  }
}

/** Bundles the theme entry into a single self-contained ESM module. */
const bundleThemeModule = async (themeSrcDir: string): Promise<string> => {
  const externalImports = new Set<string>()

  const result = await build({
    stdin: {
      contents: ENTRY_SOURCE,
      resolveDir: themeSrcDir,
      sourcefile: 'ds-analyzer-theme-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    resolveExtensions: ['.ts', '.tsx', '.js'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'record-external-imports',
        setup(pluginBuild) {
          // Anything not starting with `.` or `/` would come from node_modules.
          pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
            externalImports.add(args.path)
            return { path: args.path, external: true }
          })
        },
      },
    ],
  })

  assertSelfContained([...externalImports].sort(compareStrings))

  const output = result.outputFiles?.[0]
  if (!output) {
    throw new ExtractionError('esbuild produced no output for the theme bundle.')
  }

  return output.text
}

/**
 * Compiles and evaluates the UI kit's theme sources.
 *
 * @param themeSrcDir Absolute path to `packages/theme/src` of the UI kit.
 */
export const loadThemeSource = async (themeSrcDir: string): Promise<ThemeSource> => {
  assertSourcesPresent(themeSrcDir)

  const code = await bundleThemeModule(themeSrcDir)

  // A data: URL keeps the loader free of temp-file cleanup and of any chance that a
  // stale file from a previous run is imported from the module cache.
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`

  const loaded: unknown = await import(/* @vite-ignore */ moduleUrl)
  const module = asRecord(loaded, 'theme module')

  return {
    edsRef: asRecord(module['edsRef'], 'edsRef'),
    ref: asRecord(module['ref'], 'ref'),
    sysLight: asRecord(module['sysLight'], 'sysLight'),
    sysDark: asRecord(module['sysDark'], 'sysDark'),
    comp: asRecord(module['comp'], 'comp'),
    light: asResolvedTheme(module['light'], 'light'),
    dark: asResolvedTheme(module['dark'], 'dark'),
  }
}
