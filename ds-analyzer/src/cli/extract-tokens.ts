import { join } from 'node:path'

import { extractTokens } from '../tokens/extract.js'
import { writeJsonFile } from '../shared/fs.js'

import { reportFailure } from './report.js'

const main = async (): Promise<void> => {
  const started = performance.now()
  const { artifact, paths } = await extractTokens()
  const outputPath = join(paths.artifactsDir, 'tokens.json')

  await writeJsonFile(outputPath, artifact)

  const { counts } = artifact.meta
  console.log(`✔ tokens.json  ${counts.total} tokens in ${Math.round(performance.now() - started)}ms`)
  console.log(
    `  tiers: ref=${counts.byTier.ref} sys=${counts.byTier.sys} comp=${counts.byTier.comp}` +
      `  ·  css vars: ${counts.cssVariables}  ·  themed: ${counts.themeDependent}`,
  )
  for (const diagnostic of artifact.diagnostics) {
    console.log(`  [${diagnostic.severity}] ${diagnostic.code} (${diagnostic.count})`)
  }
  console.log(`  → ${outputPath}`)
}

main().catch((error: unknown) => {
  reportFailure('extract-tokens', error)
  process.exitCode = 1
})
