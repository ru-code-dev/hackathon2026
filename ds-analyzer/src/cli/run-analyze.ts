import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { analyze } from '../analyze.js'
import { analysisArtifactSchema, type AnalysisArtifact } from '../domain/findings.js'
import { observationsSchema } from '../domain/observations.js'
import { projectProfileSchema, type ProjectProfile } from '../domain/profile.js'
import { validateArtifact } from '../domain/validate.js'
import { A11ySpec } from '../kit/a11y-spec.js'
import { IconSpec } from '../kit/icon-spec.js'
import { KnowledgeSpec } from '../kit/knowledge-spec.js'
import { KitSpec } from '../kit/spec.js'
import { scanProject } from '../scanner/scan.js'
import { loadDsConfig } from '../scanner/ds-config.js'
import { renderDashboard } from '../report/render.js'
import { writeJsonFile } from '../shared/fs.js'
import { detectGitBranch, detectGitRemote } from '../shared/git.js'

/**
 * The whole analyze pipeline behind one function, so `npm run analyze` and the Qwen-skill
 * bundle run *the same code* — the skill is a packaging of the CLI, not a fork of it.
 * Console output included: the success marker line («откройте двойным кликом») is part of
 * the contract — the skill instructions tell the model to look for it.
 */

export interface RunAnalyzeOptions {
  readonly path: string
  readonly artifactsDir: string
  readonly outputDirectory: string | null
  readonly exclude: readonly string[]
  readonly kitPackages: readonly string[]
  readonly skipDashboard: boolean
  /** Bundle passes its own template copy; `undefined` means the repo default. */
  readonly templatePath?: string | undefined
}

export interface RunAnalyzeResult {
  readonly profile: ProjectProfile
  readonly analysis: AnalysisArtifact
  readonly outputDirectory: string
  readonly dashboardPath: string | null
}

const percent = (value: number): string => `${String(Math.round(value * 100))}%`

export const runAnalyze = async (options: RunAnalyzeOptions): Promise<RunAnalyzeResult> => {
  const started = Date.now()

  const kit = KitSpec.load(options.artifactsDir)
  const a11y = A11ySpec.load(options.artifactsDir)
  const icons = IconSpec.load(options.artifactsDir)
  const knowledge = KnowledgeSpec.load(options.artifactsDir)

  const { profile, observations } = scanProject({
    path: options.path,
    exclude: [...options.exclude],
    ...(options.kitPackages.length > 0 ? { kitPackages: [...options.kitPackages] } : {}),
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
    icons,
    knowledge,
    profile,
    observations,
    disabledRules,
    ignoredFindings: new Set(dsConfig.ignoreFindings ?? []),
  })

  validateArtifact(projectProfileSchema, profile, 'project-profile.json')
  validateArtifact(observationsSchema, observations, 'observations.json')
  validateArtifact(analysisArtifactSchema, analysis, 'analysis artifacts')

  const outputDirectory = options.outputDirectory ?? join(profile.root, 'ui-analyzer')
  await writeJsonFile(join(outputDirectory, 'project-profile.json'), profile)
  await writeJsonFile(join(outputDirectory, '.cache', 'observations.json'), observations)
  await writeJsonFile(join(outputDirectory, 'findings.json'), analysis.findings)
  await writeJsonFile(join(outputDirectory, 'usage.json'), analysis.usage)
  await writeJsonFile(join(outputDirectory, 'summary.json'), analysis.summary)

  // The dashboard is optional: the JSON artifacts are the product, and a missing template
  // must not fail a run that has already produced everything a machine needs.
  let dashboardPath: string | null = null
  if (!options.skipDashboard) {
    try {
      // The PR target is the analyzed repository itself: remote and branch are read off
      // its checkout, with `ds.config.json` as an explicit override for the odd setup.
      // Drawing data for every kit icon the findings point at, so the gallery renders the
      // icon itself rather than naming it.
      const iconPreviews = Object.fromEntries(
        [
          ...new Set(
            analysis.findings
              .filter((finding) => finding.category === 'icon')
              .map((finding) => finding.expected?.component)
              .filter((name): name is string => typeof name === 'string'),
          ),
        ]
          .sort()
          .flatMap((name) => {
            const preview = icons.preview(name)
            return preview === null ? [] : [[name, preview] as const]
          }),
      )

      const html = await renderDashboard({
        profile,
        analysis,
        generatedAt: new Date().toISOString().slice(0, 10),
        ci: {
          ...(dsConfig.ci ?? {}),
          repositoryUrl: dsConfig.ci?.repositoryUrl ?? detectGitRemote(profile.root) ?? undefined,
          targetBranch: dsConfig.ci?.targetBranch ?? detectGitBranch(profile.root) ?? undefined,
        },
        iconPreviews,
        templatePath: options.templatePath,
      })
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

  return { profile, analysis, outputDirectory, dashboardPath }
}
