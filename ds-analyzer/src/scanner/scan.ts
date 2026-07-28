import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import { Project, ts } from 'ts-morph'

import type { Declaration, JsxElement, LintMessage, Observations, StyleValue } from '../domain/observations.js'
import { OBSERVATIONS_SCHEMA_ID } from '../domain/observations.js'
import { collectJsxA11yLint } from './collectors/jsx-a11y-lint.js'
import type { Alias, Limitation, ProjectProfile, StyleSyntax } from '../domain/profile.js'
import { fromProjectPath } from '../shared/path.js'
import { compareStrings, sortStrings } from '../shared/sort.js'
import { collectStylesheet, styleSyntaxOf } from './collectors/stylesheet.js'
import { ScssVariableIndex } from './collectors/scss-variables.js'
import { collectTypeScript } from './collectors/typescript.js'
import { loadDsConfig } from './ds-config.js'
import { aliasSourceForFile, mergeAliases, readConfigAliases, readPackageImports } from './profile/aliases.js'
import { computeKitClosure, DEFAULT_KIT_PACKAGES, kitComponentFor, type KitClosure } from './profile/kit-sources.js'
import { detectPackageManager, detectWorkspaces, locateProject, readPackageManifest } from './profile/root.js'
import { isTsconfigFile, scanTsconfigs } from './profile/tsconfig.js'
import { packageNameOf, resolveSpecifier, type ResolverContext } from './resolve.js'
import { isCodeFile, isStyleFile, walkProject } from './walk.js'

/**
 * Stage B0 + B: profile the project, then collect facts from it.
 *
 * The two stages are one function because the second cannot start without the first and
 * the first is worthless on its own. What they produce — a profile and a set of
 * observations — is everything the analysis stage is allowed to know. No rule may read a
 * file.
 *
 * The whole tree below the project root is walked even when a narrower scope was
 * requested. Configuration lives at the root, and a `tsconfig.json` that was never read is
 * an alias that never resolves, which shows up much later as a mysteriously missing
 * finding. Files outside the scope are dropped after the walk, not during it.
 */

export interface ScanOptions {
  /** File, directory, or repository root to analyse. */
  readonly path: string
  /** Extra ignore patterns, gitignore syntax. */
  readonly exclude?: readonly string[]
  /** Overrides the default kit package list. */
  readonly kitPackages?: readonly string[]
}

export interface ScanResult {
  readonly profile: ProjectProfile
  readonly observations: Observations
}

const readFileSafely = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Module key a JSX element's origin is known by.
 *
 * Local modules use their project path so that every spelling of the same file collapses
 * to one key; packages use their package name so that a deep import still points at the
 * package it reaches into.
 */
const moduleKeyOf = (resolution: { file: string | null }, specifier: string): string | null =>
  resolution.file ?? packageNameOf(specifier)

/** Attaches origin and kit identity to every rendered element. */
const classifyJsxElements = (
  elements: readonly JsxElement[],
  importsByFile: ReadonlyMap<string, { specifier: string; local: string; imported: string; file: string | null }[]>,
  closure: KitClosure,
): JsxElement[] =>
  elements.map((element) => {
    // `Button.Icon` is provided by whatever provides `Button`.
    const rootName = element.name.split('.')[0] ?? element.name
    const binding = importsByFile.get(element.file)?.find((entry) => entry.local === rootName)

    if (!binding) {
      return element
    }

    const moduleKey = moduleKeyOf({ file: binding.file }, binding.specifier)

    return {
      ...element,
      resolvedFrom: binding.specifier,
      kitComponent: kitComponentFor(closure, moduleKey, binding.imported),
    }
  })

/**
 * Resolves where each style declaration ends up.
 *
 * Without this a repaint of a kit component is indistinguishable from styling one's own
 * `<div>`, and §5.6 — the rule that keeps four out of five overrides out of the report —
 * has nothing to work with.
 */
const linkAppliedTo = (styleValues: readonly StyleValue[], elements: readonly JsxElement[]): StyleValue[] => {
  interface Target {
    readonly kind: 'kit-component' | 'local-component' | 'host-element'
    readonly name: string
    readonly slot: string | null
  }

  const byClass = new Map<string, Target>()

  for (const element of elements) {
    const kind: Target['kind'] = element.kitComponent
      ? 'kit-component'
      : /^[a-z]/.test(element.name)
        ? 'host-element'
        : 'local-component'

    for (const ref of element.styleRefs) {
      const key = `${ref.module}::${ref.className}`
      // First writer wins; a class applied to two different components is rare and the
      // first use is the one the report points at.
      if (!byClass.has(key)) {
        byClass.set(key, { kind, name: element.kitComponent ?? element.name, slot: ref.slot })
      }
    }
  }

  return styleValues.map((styleValue) => {
    if (styleValue.classNames.length === 0) {
      return styleValue
    }

    for (const className of styleValue.classNames) {
      const target = byClass.get(`${styleValue.file}::${className}`)
      if (target) {
        return { ...styleValue, appliedTo: { kind: target.kind, name: target.name, slot: target.slot } }
      }
    }

    return { ...styleValue, appliedTo: { kind: 'unused', name: null, slot: null } }
  })
}

/** Records which kit components each local declaration composes. */
const linkKitUsage = (declarations: readonly Declaration[], elements: readonly JsxElement[]): Declaration[] => {
  const byFile = new Map<string, JsxElement[]>()

  for (const element of elements) {
    const bucket = byFile.get(element.file)
    if (bucket) {
      bucket.push(element)
    } else {
      byFile.set(element.file, [element])
    }
  }

  return declarations.map((declaration) => {
    const used = new Set<string>()

    for (const element of byFile.get(declaration.file) ?? []) {
      if (element.kitComponent !== null && element.line >= declaration.line) {
        used.add(element.kitComponent)
      }
    }

    return { ...declaration, kitComponentsUsed: sortStrings(used) }
  })
}

/** Walks, profiles and collects. */
export const scanProject = (options: ScanOptions): ScanResult => {
  const location = locateProject(options.path)
  const { root, scope, targetIsFile } = location

  const dsConfig = loadDsConfig(root)
  const limitations: Limitation[] = []

  if (dsConfig.error !== null) {
    limitations.push({ file: 'ds.config.json', line: null, reason: 'unreadable-config', detail: dsConfig.error })
  }

  const extraIgnores = [...(options.exclude ?? []), ...(dsConfig.config.exclude ?? [])]
  const walk = walkProject({ root, extraIgnores })

  // --- Profile -----------------------------------------------------------------------
  const manifest = readPackageManifest(root)
  const tsconfigPaths = walk.configFiles
    .filter((file) => isTsconfigFile(basename(file)))
    .map((file) => fromProjectPath(root, file))
  const tsconfigScan = scanTsconfigs(root, tsconfigPaths)
  limitations.push(...tsconfigScan.limitations)

  const configAliases: Alias[] = []
  for (const configFile of walk.configFiles) {
    const source = aliasSourceForFile(basename(configFile))
    if (source !== null) {
      configAliases.push(...readConfigAliases(root, fromProjectPath(root, configFile), source, limitations))
    }
  }

  const declaredAliases: Alias[] = Object.entries(dsConfig.config.aliases ?? {}).map(([pattern, resolvesTo]) => ({
    pattern,
    resolvesTo,
    source: 'ds-config' as const,
  }))

  const aliases = mergeAliases(declaredAliases, tsconfigScan.aliases, configAliases, readPackageImports(root))
  const resolverContext: ResolverContext = { root, aliases }

  // --- Files in scope ----------------------------------------------------------------
  const inScope = (file: string): boolean =>
    scope.length === 0 || file === scope || file.startsWith(targetIsFile ? scope : `${scope}/`)

  const files = walk.files.filter(inScope)
  const styleFiles = files.filter(isStyleFile)
  const codeFiles = files.filter(isCodeFile)

  // Variables are resolved against *every* stylesheet in the project, not only those in
  // scope: `_vars.scss` routinely sits outside the folder being audited.
  const stylesheetContents = new Map<string, string>()
  for (const file of walk.files.filter(isStyleFile)) {
    const content = readFileSafely(fromProjectPath(root, file))
    if (content !== null) {
      stylesheetContents.set(file, content)
    }
  }
  const variables = ScssVariableIndex.build(stylesheetContents)

  // --- Collect -----------------------------------------------------------------------
  const styleValues: StyleValue[] = []
  const jsxElements: JsxElement[] = []
  const imports: Observations['imports'] = []
  const reExports: Observations['reExports'] = []
  const declarations: Declaration[] = []
  const lintMessages: LintMessage[] = []
  const scannedFiles: string[] = []
  const byExtension: Record<string, number> = {}
  const syntaxes = new Set<StyleSyntax>()
  let unparseable = 0

  for (const file of styleFiles) {
    const content = stylesheetContents.get(file)
    if (content === undefined) {
      unparseable += 1
      limitations.push({ file, line: null, reason: 'parse-error', detail: 'file could not be read' })
      continue
    }

    const result = collectStylesheet({ file, content, variables })
    styleValues.push(...result.styleValues)
    limitations.push(...result.limitations)
    scannedFiles.push(file)
    if (result.styleValues.length > 0) {
      syntaxes.add(styleSyntaxOf(file))
    }
    if (result.limitations.some((entry) => entry.reason === 'parse-error')) {
      unparseable += 1
    }
  }

  const project = new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      allowJs: true,
      noResolve: true,
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.Latest,
    },
  })

  for (const file of codeFiles) {
    const content = readFileSafely(fromProjectPath(root, file))
    if (content === null) {
      unparseable += 1
      limitations.push({ file, line: null, reason: 'parse-error', detail: 'file could not be read' })
      continue
    }

    const result = collectTypeScript({
      file,
      content,
      project,
      resolveModule: (specifier) => resolveSpecifier(resolverContext, specifier, file),
    })

    // The canonical JSX accessibility rules, run on the same content the collectors just
    // read. Kept here rather than in a rule so that syntax stays confined to this stage.
    const lint = collectJsxA11yLint({ file, content })
    lintMessages.push(...lint.messages)
    limitations.push(...lint.limitations)

    styleValues.push(...result.styleValues)
    jsxElements.push(...result.jsxElements)
    imports.push(...result.imports)
    reExports.push(...result.reExports)
    declarations.push(...result.declarations)
    limitations.push(...result.limitations)
    scannedFiles.push(file)

    for (const styleValue of result.styleValues) {
      syntaxes.add(styleValue.source)
    }
    if (result.limitations.some((entry) => entry.reason === 'parse-error')) {
      unparseable += 1
    }
  }

  for (const file of files) {
    const extension = file.slice(file.lastIndexOf('.'))
    byExtension[extension] = (byExtension[extension] ?? 0) + 1
  }

  // --- Join --------------------------------------------------------------------------
  // Re-exports are read from the whole project so that a barrel outside the requested
  // scope still makes the kit visible inside it.
  const closure = computeKitClosure({
    reExports,
    imports,
    kitPackages: options.kitPackages ?? dsConfig.config.kitPackages ?? [...DEFAULT_KIT_PACKAGES],
  })

  const importsByFile = new Map<string, { specifier: string; local: string; imported: string; file: string | null }[]>()
  for (const record of imports) {
    const bucket = importsByFile.get(record.file) ?? []
    for (const name of record.names) {
      bucket.push({
        specifier: record.specifier,
        local: name.local,
        imported: name.imported,
        file: record.resolution.file,
      })
    }
    if (record.defaultImport !== null) {
      bucket.push({
        specifier: record.specifier,
        local: record.defaultImport,
        imported: 'default',
        file: record.resolution.file,
      })
    }
    importsByFile.set(record.file, bucket)
  }

  const classifiedElements = classifyJsxElements(jsxElements, importsByFile, closure)
  const linkedStyleValues = linkAppliedTo(styleValues, classifiedElements)
  const linkedDeclarations = linkKitUsage(declarations, classifiedElements)

  const kitPackageName = closure.sources.find((source) => source.kind === 'package')?.specifier ?? null

  const profile: ProjectProfile = {
    $schema: 'ds-analyzer/project-profile@1',
    root,
    scope,
    name: manifest.name,
    packageManager: detectPackageManager(root),
    monorepo: (() => {
      const workspaces = detectWorkspaces(root, manifest)
      return { detected: workspaces.length > 0, workspaces }
    })(),
    tsconfigs: tsconfigScan.configs,
    aliases,
    kitSources: closure.sources,
    kitVersion: kitPackageName === null ? null : (manifest.dependencies[kitPackageName] ?? null),
    usesKit: closure.usesKit,
    styleSyntaxes: [...syntaxes].sort(compareStrings),
    files: {
      scanned: scannedFiles.length,
      ignored: walk.ignoredCount,
      unparseable,
      byExtension,
    },
    limitations: limitations.sort(
      (left, right) => compareStrings(left.file, right.file) || (left.line ?? 0) - (right.line ?? 0),
    ),
  }

  const observations: Observations = {
    $schema: OBSERVATIONS_SCHEMA_ID,
    styleValues: linkedStyleValues,
    jsxElements: classifiedElements,
    imports,
    reExports,
    declarations: linkedDeclarations,
    lintMessages: lintMessages.sort(
      (left, right) =>
        compareStrings(left.file, right.file) ||
        left.line - right.line ||
        left.column - right.column ||
        compareStrings(left.rule, right.rule),
    ),
    files: sortStrings(scannedFiles),
    limitations: profile.limitations,
  }

  return { profile, observations }
}
