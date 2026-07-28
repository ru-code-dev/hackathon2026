import { join } from 'node:path'

import { extractKnowledge } from '../kit-knowledge/extract.js'
import { resolvePaths } from '../config.js'
import { writeJsonFile } from '../shared/fs.js'

import { reportFailure } from './report.js'

const main = async (): Promise<void> => {
  const started = performance.now()
  const paths = resolvePaths()
  const { signatures, cards } = extractKnowledge(paths)

  await writeJsonFile(join(paths.artifactsDir, 'kit-signatures.json'), signatures)
  await writeJsonFile(join(paths.artifactsDir, 'kit-cards.json'), cards)

  const elapsed = Math.round(performance.now() - started)
  console.log(`✔ kit-signatures.json  ${signatures.meta.counts.components} components in ${elapsed}ms`)
  if (signatures.meta.counts.withoutSource > 0) {
    console.log(`  [warn] without source declaration: ${signatures.meta.counts.withoutSource}`)
  }
  console.log(`✔ kit-cards.json       ${cards.meta.counts.components} cards · ${cards.meta.counts.examples} examples`)
  console.log(`  → ${paths.artifactsDir}`)
}

main().catch((error: unknown) => {
  reportFailure('extract-knowledge', error)
  process.exitCode = 1
})
