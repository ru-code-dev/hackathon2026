import { join } from 'node:path'

import { extractComponents } from '../components/extract.js'
import { extractIcons } from '../icons/extract.js'
import { writeJsonFile } from '../shared/fs.js'
import { extractTokens } from '../tokens/extract.js'

import { reportFailure } from './report.js'

/**
 * Runs every extractor and writes a run summary alongside the artifacts.
 *
 * The artifacts themselves are deliberately timestamp-free so they diff cleanly in
 * version control; all non-deterministic run metadata lives here instead.
 */
const main = async (): Promise<void> => {
  const started = performance.now()

  const tokensStarted = performance.now()
  const tokens = await extractTokens()
  const tokensMs = Math.round(performance.now() - tokensStarted)

  const componentsStarted = performance.now()
  const components = await extractComponents()
  const componentsMs = Math.round(performance.now() - componentsStarted)

  const iconsStarted = performance.now()
  const icons = extractIcons(tokens.paths)
  const iconsMs = Math.round(performance.now() - iconsStarted)

  const { artifactsDir, uiKitRoot } = tokens.paths

  await writeJsonFile(join(artifactsDir, 'tokens.json'), tokens.artifact)
  await writeJsonFile(join(artifactsDir, 'components.json'), components.artifact)
  await writeJsonFile(join(artifactsDir, 'kit-icons.json'), icons)

  const summary = {
    $schema: 'ds-analyzer/summary@1',
    generatedAt: new Date().toISOString(),
    uiKitRoot,
    durationsMs: {
      tokens: tokensMs,
      components: componentsMs,
      icons: iconsMs,
      total: Math.round(performance.now() - started),
    },
    artifacts: {
      'tokens.json': tokens.artifact.meta.counts,
      'components.json': components.artifact.meta.counts,
      'kit-icons.json': icons.meta.counts,
    },
    diagnostics: {
      tokens: tokens.artifact.diagnostics.map(({ code, severity, count }) => ({ code, severity, count })),
      components: components.artifact.diagnostics.map(({ code, severity, count }) => ({ code, severity, count })),
    },
  }

  await writeJsonFile(join(artifactsDir, 'extraction-summary.json'), summary)

  console.log(`✔ tokens.json                ${tokens.artifact.meta.counts.total} tokens (${tokensMs}ms)`)
  console.log(
    `✔ components.json            ${components.artifact.meta.counts.componentDirectories} components, ` +
      `${components.artifact.meta.counts.publicSymbols} public symbols (${componentsMs}ms)`,
  )
  console.log(`✔ kit-icons.json             ${icons.meta.counts.icons} icons (${iconsMs}ms)`)
  console.log(`✔ extraction-summary.json`)
  console.log(`  → ${artifactsDir}`)
}

main().catch((error: unknown) => {
  reportFailure('extract', error)
  process.exitCode = 1
})
