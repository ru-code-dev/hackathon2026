import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolvePaths } from '../config.js'
import { componentsArtifactSchema } from '../domain/components.js'
import { kitA11yArtifactSchema } from '../domain/kit-a11y.js'
import { validateArtifact } from '../domain/validate.js'
import { extractKitA11y } from '../kit-a11y/extract.js'
import { writeJsonFile } from '../shared/fs.js'

/**
 * Builds `artifacts/kit-a11y.json` from the installed `@v-uik`.
 *
 * Runs after `extract:components`, which supplies the component → upstream package mapping.
 * Without `@v-uik` installed it still writes a valid artifact — one that says so — because
 * a consumer that has to distinguish "not installed" from "nothing found" needs the file to
 * exist either way.
 */
const main = async (): Promise<void> => {
  const paths = resolvePaths()

  const components = componentsArtifactSchema.parse(
    JSON.parse(readFileSync(join(paths.artifactsDir, 'components.json'), 'utf8')),
  )

  const artifact = extractKitA11y({ paths, components })

  validateArtifact(kitA11yArtifactSchema, artifact, 'kit-a11y.json')
  await writeJsonFile(join(paths.artifactsDir, 'kit-a11y.json'), artifact)

  const upstream = artifact.meta.upstreamAvailable
    ? `@v-uik ${artifact.meta.upstreamVersion}, пакетов ${String(artifact.meta.packagesScanned)}`
    : '@v-uik не установлен'

  process.stdout.write(
    `kit-a11y.json — ${upstream}\n` +
      `  паттернов с a11y-признаками: ${String(artifact.patterns.length)}\n` +
      `  шкала отступов: ${artifact.spacing.steps.map((step) => String(step.px)).join(', ') || '—'}\n` +
      `  покрытие шкалы: ${String(Math.round(artifact.spacing.coverage * 100))}% ` +
      `из ${String(artifact.spacing.totalDeclarations)} объявлений\n`,
  )
}

await main()
