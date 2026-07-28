import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ExtractionError } from './shared/errors.js'

/**
 * Filesystem layout the extractors depend on.
 *
 * Resolution order for the UI kit root:
 *   1. explicit argument
 *   2. `DS_UI_KIT_ROOT` environment variable
 *   3. `../ui-kit-eds-ce` next to this project
 */
export interface AnalyzerPaths {
  /** Root of this analyzer project. */
  readonly analyzerRoot: string
  /** Root of the UI kit monorepo. */
  readonly uiKitRoot: string
  /** `packages/theme/src` — the token sources. */
  readonly themeSrcDir: string
  /** `packages/theme/package.json`. */
  readonly themePackageJson: string
  /** `packages/base/src` — the component sources. */
  readonly baseSrcDir: string
  /** `packages/base/src/components`. */
  readonly componentsDir: string
  /** `packages/base/src/components/index.ts` — the public component barrel. */
  readonly componentsBarrel: string
  /** `packages/base/src/index.ts` — the package entry point. */
  readonly baseBarrel: string
  /** Output directory for generated JSON artifacts. */
  readonly artifactsDir: string
}

const DEFAULT_UI_KIT_DIRNAME = 'ui-kit-eds-ce'

const currentDir = dirname(fileURLToPath(import.meta.url))

/** `<repo>/ds-analyzer` — this file lives at `<analyzerRoot>/src/config.ts`. */
export const analyzerRoot = resolve(currentDir, '..')

const resolveUiKitRoot = (explicitRoot?: string): string => {
  const candidates = [
    explicitRoot,
    process.env['DS_UI_KIT_ROOT'],
    resolve(analyzerRoot, '..', DEFAULT_UI_KIT_DIRNAME),
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)

  for (const candidate of candidates) {
    const absolute = resolve(candidate)
    if (existsSync(join(absolute, 'packages', 'theme', 'src'))) {
      return absolute
    }
  }

  throw new ExtractionError(
    `Could not locate the UI kit. Tried: ${candidates.join(', ')}. ` +
      'Pass an explicit path or set DS_UI_KIT_ROOT to the repository root of ui-kit-eds-ce.',
  )
}

/** Builds the path set used by every extractor. Fails fast if the kit is not found. */
export const resolvePaths = (explicitUiKitRoot?: string): AnalyzerPaths => {
  const uiKitRoot = resolveUiKitRoot(explicitUiKitRoot)
  const baseSrcDir = join(uiKitRoot, 'packages', 'base', 'src')
  const componentsDir = join(baseSrcDir, 'components')

  return {
    analyzerRoot,
    uiKitRoot,
    themeSrcDir: join(uiKitRoot, 'packages', 'theme', 'src'),
    themePackageJson: join(uiKitRoot, 'packages', 'theme', 'package.json'),
    baseSrcDir,
    componentsDir,
    componentsBarrel: join(componentsDir, 'index.ts'),
    baseBarrel: join(baseSrcDir, 'index.ts'),
    artifactsDir: join(analyzerRoot, 'artifacts'),
  }
}

/**
 * Where the extracted kit specification lives.
 *
 * Deliberately independent of {@link resolvePaths}: analysing a consumer project needs the
 * artifacts and nothing else. Requiring a checkout of the UI kit as well would mean every
 * team that wants an audit first has to clone a repository they do not otherwise need —
 * and the artifacts are committed precisely so they do not have to.
 */
export const defaultArtifactsDir = join(analyzerRoot, 'artifacts')

/** Path relative to the UI kit root, with POSIX separators, for stable artifact fields. */
export const toKitRelativePath = (paths: AnalyzerPaths, absolutePath: string): string =>
  relative(paths.uiKitRoot, absolutePath).split(/[\\/]/).join('/')
