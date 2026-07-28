import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { analyze } from '../analyze.js'
import { analysisArtifactSchema } from '../domain/findings.js'
import { observationsSchema } from '../domain/observations.js'
import { projectProfileSchema } from '../domain/profile.js'
import { validateArtifact } from '../domain/validate.js'
import { A11ySpec } from '../kit/a11y-spec.js'
import { KitSpec } from '../kit/spec.js'
import { defaultArtifactsDir } from '../config.js'
import { scanProject } from '../scanner/scan.js'
import { loadDsConfig } from '../scanner/ds-config.js'
import { renderDashboard } from '../report/render.js'
import { writeJsonFile } from '../shared/fs.js'

/**
 * `tsx src/cli/analyze.ts <path> [--out <dir>] [--exclude <glob>]… [--no-dashboard]`
 *
 * Needs the committed artifacts and nothing else — no checkout of the UI kit.
 *
 * Runs the whole non-visual pipeline — profile, collect, analyse — and writes the three
 * artifacts the dashboard renders.
 */

interface CliArguments {
  readonly path: string
  readonly artifactsDir: string | undefined
  readonly outputDirectory: string | null
  readonly exclude: string[]
  readonly kitPackages: string[]
  readonly skipDashboard: boolean
}

const parseArguments = (argv: readonly string[]): CliArguments => {
  const positional: string[] = []
  const exclude: string[] = []
  const kitPackages: string[] = []
  let artifactsDir: string | undefined
  let outputDirectory: string | null = null
  let skipDashboard = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    const value = argv[index + 1]

    switch (argument) {
      case '--artifacts':
        artifactsDir = value
        index += 1
        break
      case '--out':
        outputDirectory = value ?? null
        index += 1
        break
      case '--exclude':
        if (value !== undefined) {
          exclude.push(value)
          index += 1
        }
        break
      case '--no-dashboard':
        skipDashboard = true
        break
      case '--kit-package':
        if (value !== undefined) {
          kitPackages.push(value)
          index += 1
        }
        break
      default:
        positional.push(argument)
    }
  }

  return { path: positional[0] ?? process.cwd(), artifactsDir, outputDirectory, exclude, kitPackages, skipDashboard }
}

const percent = (value: number): string => `${String(Math.round(value * 100))}%`

const main = async (): Promise<void> => {
  const args = parseArguments(process.argv.slice(2))
  const started = Date.now()

  const artifactsDir = args.artifactsDir ?? defaultArtifactsDir
  const kit = KitSpec.load(artifactsDir)
  const a11y = A11ySpec.load(artifactsDir)

  const { profile, observations } = scanProject({
    path: args.path,
    exclude: args.exclude,
    ...(args.kitPackages.length > 0 ? { kitPackages: args.kitPackages } : {}),
  })

  const dsConfig = loadDsConfig(profile.root).config
  const disabledRules = new Set(
    Object.entries(dsConfig.rules ?? {})
      .filter(([, setting]) => setting === 'off')
      .map(([rule]) => rule),
  )

  const analysis = analyze({
    kit,
    a11y,
    profile,
    observations,
    disabledRules,
    ignoredFindings: new Set(dsConfig.ignoreFindings ?? []),
  })

  validateArtifact(projectProfileSchema, profile, 'project-profile.json')
  validateArtifact(observationsSchema, observations, 'observations.json')
  validateArtifact(analysisArtifactSchema, analysis, 'analysis artifacts')

  const outputDirectory = args.outputDirectory ?? join(profile.root, 'ui-analyzer')
  await writeJsonFile(join(outputDirectory, 'project-profile.json'), profile)
  await writeJsonFile(join(outputDirectory, '.cache', 'observations.json'), observations)
  await writeJsonFile(join(outputDirectory, 'findings.json'), analysis.findings)
  await writeJsonFile(join(outputDirectory, 'usage.json'), analysis.usage)
  await writeJsonFile(join(outputDirectory, 'summary.json'), analysis.summary)

  // The dashboard is optional: the JSON artifacts are the product, and a missing template
  // must not fail a run that has already produced everything a machine needs.
  let dashboardPath: string | null = null
  if (!args.skipDashboard) {
    try {
      const html = await renderDashboard({ profile, analysis, generatedAt: new Date().toISOString().slice(0, 10) })
      dashboardPath = join(outputDirectory, 'dashboard.html')
      await mkdir(outputDirectory, { recursive: true })
      await writeFile(dashboardPath, html, 'utf8')
    } catch (error) {
      dashboardPath = null
      console.error(`\n  Дашборд не собран: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const { summary } = analysis
  const elapsed = ((Date.now() - started) / 1000).toFixed(2)

  console.log(`\n  ${profile.name ?? profile.root} · health ${String(summary.healthScore)}/100 · ${elapsed}s\n`)
  console.log(`  Adoption        ${percent(summary.adoption)}`)
  console.log(`  Token coverage  ${percent(summary.tokenCoverage)}`)
  console.log(`  Чистых файлов   ${String(summary.files.clean)} из ${String(summary.files.scanned)}`)
  console.log(
    `  Отклонений      ${String(summary.findings.total)}  (${String(summary.findings.bySeverity.error ?? 0)} error · ${String(summary.findings.bySeverity.warning ?? 0)} warning · ${String(summary.findings.bySeverity.info ?? 0)} info)`,
  )
  console.log(`  Авто-фиксится   ${String(summary.findings.autoFixable)}\n`)

  for (const [rule, count] of Object.entries(summary.findings.byRule).sort((left, right) => right[1] - left[1])) {
    console.log(`    ${rule.padEnd(28)} ${String(count)}`)
  }

  if (summary.kitGaps.length > 0) {
    console.log(`\n  Пробелы кита: ${String(summary.kitGaps.length)} цвет(а) без семантической роли`)
  }
  if (summary.limitations.length > 0) {
    console.log(`  Не проанализировано: ${String(summary.limitations.length)} мест`)
  }

  console.log(`\n  → ${outputDirectory}`)
  if (dashboardPath !== null) {
    console.log(`  → ${dashboardPath}  ← откройте двойным кликом`)
  }
}

await main()
