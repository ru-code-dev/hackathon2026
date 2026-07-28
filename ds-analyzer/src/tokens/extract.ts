import { readFile } from 'node:fs/promises'

import { resolvePaths, toKitRelativePath, type AnalyzerPaths } from '../config.js'
import { tokensArtifactSchema, type TokenDto, type TokensArtifact } from '../domain/tokens.js'
import { validateArtifact } from '../domain/validate.js'
import { isPlainRecord } from '../shared/object.js'

import { CSS_VARIABLE_PREFIX } from './css-variables.js'
import { buildTokenDiagnostics } from './diagnostics.js'
import { flattenSlices, type TokenSourceSlice } from './flatten.js'
import { loadThemeSource, type ThemeSource } from './loader.js'
import { buildReverseIndex } from './reverse-index.js'
import { buildScales } from './scales.js'
import { THEME_MODES, TOKEN_TIERS, type TokenTier } from './tiers.js'

/**
 * Assembles the theme into the four flattenable slices.
 *
 * The legacy `ref` export (`{ typography: { fontFamily: … } }`) is a separate slice from
 * `edsRef` because the CSS-variable generator only emits `edsRef` and `edsSys`. Folding
 * it into `edsRef` would fabricate CSS variables that the kit never ships.
 */
const buildSlices = (theme: ThemeSource): TokenSourceSlice[] => [
  {
    tier: 'ref',
    label: 'edsRef',
    authored: { light: theme.edsRef, dark: theme.edsRef },
    resolved: { light: theme.light.edsRef, dark: theme.dark.edsRef },
    emitsCssVariables: true,
  },
  {
    tier: 'ref',
    label: 'ref (legacy typography aliases)',
    authored: { light: theme.ref, dark: theme.ref },
    resolved: { light: theme.light.ref, dark: theme.dark.ref },
    emitsCssVariables: false,
  },
  {
    tier: 'sys',
    label: 'edsSys',
    authored: { light: theme.sysLight, dark: theme.sysDark },
    resolved: { light: theme.light.edsSys, dark: theme.dark.edsSys },
    emitsCssVariables: true,
  },
  {
    tier: 'comp',
    label: 'comp',
    authored: { light: theme.comp, dark: theme.comp },
    resolved: { light: theme.light.comp, dark: theme.dark.comp },
    emitsCssVariables: false,
  },
]

const readThemeVersion = async (packageJsonPath: string): Promise<string | null> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    if (isPlainRecord(parsed) && typeof parsed['version'] === 'string') {
      return parsed['version']
    }
  } catch {
    // A missing or malformed package.json is not fatal: version is metadata only.
  }
  return null
}

const countBy = <T extends string>(tokens: readonly TokenDto[], keyOf: (token: TokenDto) => T): Record<T, number> => {
  const counts = {} as Record<T, number>

  for (const token of tokens) {
    const key = keyOf(token)
    counts[key] = (counts[key] ?? 0) + 1
  }

  return counts
}

const zeroedTierCounts = (): Record<TokenTier, number> =>
  Object.fromEntries(TOKEN_TIERS.map((tier) => [tier, 0])) as Record<TokenTier, number>

export interface ExtractTokensOptions {
  /** Overrides UI kit auto-discovery. */
  readonly uiKitRoot?: string
}

export interface ExtractTokensResult {
  readonly artifact: TokensArtifact
  readonly paths: AnalyzerPaths
}

/**
 * Extracts the full token specification of the UI kit.
 *
 * The returned artifact is schema-validated before it is handed back, so a caller that
 * receives a result can write it to disk unconditionally.
 */
export const extractTokens = async (options: ExtractTokensOptions = {}): Promise<ExtractTokensResult> => {
  const paths = resolvePaths(options.uiKitRoot)
  const theme = await loadThemeSource(paths.themeSrcDir)

  const tokens = flattenSlices(buildSlices(theme))
  const scales = buildScales(tokens)
  const reverseIndex = buildReverseIndex(tokens)
  const diagnostics = buildTokenDiagnostics(tokens)

  const componentNames = new Set(tokens.filter((token) => token.tier === 'comp').map((token) => token.component ?? ''))
  componentNames.delete('')

  const artifact: TokensArtifact = {
    $schema: 'ds-analyzer/tokens@1',
    meta: {
      sourceRoot: toKitRelativePath(paths, paths.themeSrcDir),
      themePackageVersion: await readThemeVersion(paths.themePackageJson),
      cssVariablePrefix: CSS_VARIABLE_PREFIX,
      modes: [...THEME_MODES],
      counts: {
        total: tokens.length,
        byTier: { ...zeroedTierCounts(), ...countBy(tokens, (token) => token.tier) },
        byCategory: countBy(tokens, (token) => token.category),
        byKind: countBy(tokens, (token) => token.kind),
        components: componentNames.size,
        cssVariables: tokens.filter((token) => token.cssVariable !== null).length,
        themeDependent: tokens.filter((token) => token.themeDependent).length,
      },
    },
    tokens,
    scales,
    reverseIndex,
    diagnostics,
  }

  return {
    artifact: validateArtifact(tokensArtifactSchema, artifact, 'tokens artifact'),
    paths,
  }
}
