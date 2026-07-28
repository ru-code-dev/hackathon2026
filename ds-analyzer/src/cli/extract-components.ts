import { join } from 'node:path'

import { extractComponents } from '../components/extract.js'
import { writeJsonFile } from '../shared/fs.js'

import { reportFailure } from './report.js'

const main = async (): Promise<void> => {
  const started = performance.now()
  const { artifact, paths } = await extractComponents()
  const outputPath = join(paths.artifactsDir, 'components.json')

  await writeJsonFile(outputPath, artifact)

  const { counts } = artifact.meta
  console.log(
    `✔ components.json  ${counts.componentDirectories} directories ` +
      `(${counts.publicComponentDirectories} public) in ${Math.round(performance.now() - started)}ms`,
  )
  console.log(
    `  react components: ${counts.reactComponents}  ·  props: ${counts.props} across ${counts.propsTypes} types` +
      `  ·  variants: ${counts.variantSets}  ·  slots: ${counts.slots}`,
  )
  console.log(`  public symbols: ${counts.publicSymbols}  ·  deprecated: ${counts.deprecatedSymbols}`)
  for (const diagnostic of artifact.diagnostics) {
    console.log(`  [${diagnostic.severity}] ${diagnostic.code} (${diagnostic.count})`)
  }
  console.log(`  → ${outputPath}`)
}

main().catch((error: unknown) => {
  reportFailure('extract-components', error)
  process.exitCode = 1
})
