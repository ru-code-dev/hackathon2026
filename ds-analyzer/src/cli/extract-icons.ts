import { join } from 'node:path'

import { extractIcons } from '../icons/extract.js'
import { resolvePaths } from '../config.js'
import { writeJsonFile } from '../shared/fs.js'

import { reportFailure } from './report.js'

const main = async (): Promise<void> => {
  const started = performance.now()
  const paths = resolvePaths()
  const artifact = extractIcons(paths)
  const outputPath = join(paths.artifactsDir, 'kit-icons.json')

  await writeJsonFile(outputPath, artifact)

  const { counts } = artifact.meta
  console.log(
    `✔ kit-icons.json  ${counts.icons} icons from ${counts.files} files in ${Math.round(performance.now() - started)}ms`,
  )
  if (counts.unreadable > 0) {
    console.log(`  [warn] unreadable svg files: ${counts.unreadable}`)
  }
  console.log(`  legacy components: ${artifact.legacyComponents.length}`)
  console.log(`  → ${outputPath}`)
}

main().catch((error: unknown) => {
  reportFailure('extract-icons', error)
  process.exitCode = 1
})
