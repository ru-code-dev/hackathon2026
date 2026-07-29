import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import { defaultArtifactsDir } from '../config.js'
import { findingSchema, usageSchema, summarySchema, type Finding } from '../domain/findings.js'
import { kitCardsArtifactSchema } from '../domain/kit-knowledge.js'
import { projectProfileSchema } from '../domain/profile.js'
import { DASHBOARD_TEMPLATE } from '../report/render.js'
import { buildBrief } from '../skill/brief.js'
import { buildDeepPackMarkdown, packNameFor, rankForDeepAnalysis } from '../skill/deep-pack.js'
import { buildPatches, buildSelection } from '../skill/patches.js'
import { writeJsonFile } from '../shared/fs.js'
import { runAnalyze } from './run-analyze.js'

/**
 * Entry point of the Qwen-skill bundle: `node ds.cjs <subcommand> <project-dir> [flags]`.
 *
 * Five subcommands, one contract: every command prints machine-readable JSON to stdout
 * (except `analyze`, whose human output ends with the success-marker line the skill
 * watches for), fails loudly with exit code 1, and resolves the kit knowledge and the
 * dashboard template FROM ITS OWN LOCATION — the model driving the skill never passes
 * asset paths, because a path it has to compute is a path it will get wrong.
 *
 * Asset resolution order:
 *   1. `DS_SKILL_ASSETS` env var — tests and unusual layouts;
 *   2. `<dir-of-this-script>/../assets` — the bundle layout (`scripts/ds.cjs` + `assets/`);
 *   3. the repo checkout — `artifacts/` and `dashboard/dist/index.html` (dev runs via tsx).
 */

const scriptDir = dirname(fileURLToPath(import.meta.url))

interface SkillAssets {
  readonly artifactsDir: string
  /** `undefined` = let the renderer use the repo default. */
  readonly templatePath: string | undefined
}

const resolveAssets = (): SkillAssets => {
  const fromEnv = process.env['DS_SKILL_ASSETS']
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return { artifactsDir: join(fromEnv, 'artifacts'), templatePath: join(fromEnv, 'dashboard.html') }
  }

  const bundled = resolve(scriptDir, '..', 'assets')
  if (existsSync(join(bundled, 'artifacts', 'tokens.json'))) {
    return { artifactsDir: join(bundled, 'artifacts'), templatePath: join(bundled, 'dashboard.html') }
  }

  return {
    artifactsDir: defaultArtifactsDir,
    templatePath: existsSync(DASHBOARD_TEMPLATE) ? DASHBOARD_TEMPLATE : undefined,
  }
}

const readJson = async (path: string): Promise<unknown> => {
  if (!existsSync(path)) {
    throw new Error(`Файл не найден: ${path}. Сначала выполните подкоманду analyze.`)
  }
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

const reportsDir = (projectDir: string): string => join(projectDir, 'ui-analyzer')

const loadFindings = async (projectDir: string): Promise<Finding[]> =>
  z.array(findingSchema).parse(await readJson(join(reportsDir(projectDir), 'findings.json')))

/** stdout is the API: exactly one JSON document, nothing else on that stream. */
const emit = (value: unknown): void => {
  console.log(JSON.stringify(value, null, 2))
}

interface ParsedArguments {
  readonly positional: string[]
  readonly flags: Map<string, string | true>
}

const parseArguments = (argv: readonly string[]): ParsedArguments => {
  const positional: string[] = []
  const flags = new Map<string, string | true>()

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    if (!argument.startsWith('--')) {
      positional.push(argument)
      continue
    }
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(argument, next)
      index += 1
    } else {
      flags.set(argument, true)
    }
  }

  return { positional, flags }
}

const projectDirOf = (args: ParsedArguments): string => {
  const dir = args.positional[0]
  if (dir === undefined || dir.length === 0) {
    throw new Error('Не указан каталог проекта: node ds.cjs <подкоманда> <каталог-проекта>')
  }
  const absolute = resolve(dir)
  if (!existsSync(absolute)) {
    throw new Error(`Каталог проекта не существует: ${absolute}`)
  }
  return absolute
}

const commandAnalyze = async (args: ParsedArguments): Promise<void> => {
  const assets = resolveAssets()
  const excludeFlag = args.flags.get('--exclude')
  const outFlag = args.flags.get('--out')

  await runAnalyze({
    path: projectDirOf(args),
    artifactsDir: assets.artifactsDir,
    outputDirectory: typeof outFlag === 'string' ? outFlag : null,
    exclude: typeof excludeFlag === 'string' ? [excludeFlag] : [],
    kitPackages: [],
    skipDashboard: false,
    templatePath: assets.templatePath,
  })
}

const commandBrief = async (args: ParsedArguments): Promise<void> => {
  const projectDir = projectDirOf(args)
  const output = reportsDir(projectDir)

  const summary = summarySchema.parse(await readJson(join(output, 'summary.json')))
  const usage = usageSchema.parse(await readJson(join(output, 'usage.json')))
  const findings = await loadFindings(projectDir)
  const profile = projectProfileSchema.parse(await readJson(join(output, 'project-profile.json')))

  const dashboardPath = join(output, 'dashboard.html')
  emit(
    buildBrief({
      summary,
      usage,
      findings,
      projectName: profile.name,
      projectRoot: profile.root,
      outputDirectory: output,
      dashboardPath: existsSync(dashboardPath) ? dashboardPath : null,
    }),
  )
}

const commandPatches = async (args: ParsedArguments): Promise<void> => {
  const projectDir = projectDirOf(args)
  const artifact = buildPatches(await loadFindings(projectDir))
  const path = join(reportsDir(projectDir), 'patches.json')
  await writeJsonFile(path, artifact)
  emit({ path, totals: artifact.totals, recommendedKeys: artifact.recommendedKeys })
}

const commandDeepPack = async (args: ParsedArguments): Promise<void> => {
  const projectDir = projectDirOf(args)
  const assets = resolveAssets()

  const usage = usageSchema.parse(await readJson(join(reportsDir(projectDir), 'usage.json')))
  const findings = await loadFindings(projectDir)
  const cards = kitCardsArtifactSchema.parse(await readJson(join(assets.artifactsDir, 'kit-cards.json')))

  const topFlag = args.flags.get('--top')
  const all = args.flags.get('--all') === true
  const limit = all ? Number.POSITIVE_INFINITY : typeof topFlag === 'string' ? Number.parseInt(topFlag, 10) : 5
  if (!all && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error(`Неверное значение --top: ${String(topFlag)}`)
  }

  const deepDir = join(reportsDir(projectDir), 'deep')
  await mkdir(deepDir, { recursive: true })

  const taken = new Set<string>()
  const packs = []
  for (const { component, finding } of rankForDeepAnalysis(usage, findings).slice(0, all ? undefined : limit)) {
    const sourcePath = join(projectDir, component.file)
    const sourceText = existsSync(sourcePath) ? await readFile(sourcePath, 'utf8') : null

    const packName = packNameFor(component, taken)
    const packFile = join(deepDir, packName)
    await writeFile(packFile, buildDeepPackMarkdown({ component, finding, cards, sourceText }), 'utf8')

    const top = finding?.candidates[0]
    packs.push({
      component: component.name,
      file: component.file,
      usages: component.usages,
      packFile,
      bestCandidate: top === undefined ? null : { component: top.component, score: Math.round(top.score * 100) / 100 },
    })
  }

  emit({ total: usage.customComponents.length, generated: packs.length, packs })
}

const commandSelectPatch = async (args: ParsedArguments): Promise<void> => {
  const projectDir = projectDirOf(args)
  const keysFlag = args.flags.get('--keys')
  if (typeof keysFlag !== 'string' || keysFlag.length === 0) {
    throw new Error('Укажите группы: node ds.cjs select-patch <каталог> --keys key1,key2')
  }
  const keys = keysFlag
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0)

  const selection = buildSelection(await loadFindings(projectDir), keys)
  if (selection.diff.length === 0) {
    throw new Error(
      `Ни одной применимой правки для ключей: ${keys.join(', ')}. Неизвестные ключи: ${selection.unknownKeys.join(', ') || 'нет'}.`,
    )
  }

  const path = join(reportsDir(projectDir), 'selected.patch')
  await writeFile(path, selection.diff, 'utf8')
  emit({
    path,
    files: selection.files,
    changedLines: selection.changedLines,
    skipped: selection.skipped,
    unknownKeys: selection.unknownKeys,
  })
}

const COMMANDS: Readonly<Record<string, (args: ParsedArguments) => Promise<void>>> = {
  analyze: commandAnalyze,
  brief: commandBrief,
  patches: commandPatches,
  'deep-pack': commandDeepPack,
  'select-patch': commandSelectPatch,
}

const main = async (): Promise<void> => {
  const [subcommand, ...rest] = process.argv.slice(2)
  const command = subcommand === undefined ? undefined : COMMANDS[subcommand]

  if (command === undefined) {
    throw new Error(`Неизвестная подкоманда: ${subcommand ?? '(нет)'}. Доступны: ${Object.keys(COMMANDS).join(', ')}.`)
  }

  await command(parseArguments(rest))
}

try {
  await main()
} catch (error) {
  console.error(`Ошибка: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
