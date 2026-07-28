import { join } from 'node:path'

import { observationsSchema } from '../domain/observations.js'
import { projectProfileSchema } from '../domain/profile.js'
import { validateArtifact } from '../domain/validate.js'
import { scanProject } from '../scanner/scan.js'
import { writeJsonFile } from '../shared/fs.js'

/**
 * `tsx src/cli/scan.ts <path> [--exclude <glob>]… [--kit-package <name>]… [--out <dir>]`
 *
 * Runs stages B0 and B against a consumer project and writes the two artifacts the
 * analysis stage consumes. Useful on its own for checking that a project is understood
 * correctly before any rule has an opinion about it.
 *
 * `--kit-package` is for teams that publish the design system under their own name. The
 * alternative — guessing from `package.json` — would either miss renamed kits or claim
 * unrelated packages, so the name is asked for rather than inferred.
 */

interface CliArguments {
  readonly path: string
  readonly exclude: string[]
  readonly kitPackages: string[]
  readonly outputDirectory: string | null
}

const REPEATABLE_FLAGS = new Map<string, keyof Pick<CliArguments, 'exclude' | 'kitPackages'>>([
  ['--exclude', 'exclude'],
  ['--kit-package', 'kitPackages'],
])

const parseArguments = (argv: readonly string[]): CliArguments => {
  const positional: string[] = []
  const collected: Record<'exclude' | 'kitPackages', string[]> = { exclude: [], kitPackages: [] }
  let outputDirectory: string | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    const repeatable = REPEATABLE_FLAGS.get(argument)

    if (repeatable !== undefined) {
      const value = argv[index + 1]
      if (value !== undefined) {
        collected[repeatable].push(value)
        index += 1
      }
    } else if (argument === '--out') {
      outputDirectory = argv[index + 1] ?? null
      index += 1
    } else {
      positional.push(argument)
    }
  }

  return {
    path: positional[0] ?? process.cwd(),
    exclude: collected.exclude,
    kitPackages: collected.kitPackages,
    outputDirectory,
  }
}

const main = async (): Promise<void> => {
  const args = parseArguments(process.argv.slice(2))
  const started = Date.now()

  const { profile, observations } = scanProject({
    path: args.path,
    exclude: args.exclude,
    ...(args.kitPackages.length > 0 ? { kitPackages: args.kitPackages } : {}),
  })

  validateArtifact(projectProfileSchema, profile, 'project-profile.json')
  validateArtifact(observationsSchema, observations, 'observations.json')

  const outputDirectory = args.outputDirectory ?? join(profile.root, 'ui-analyzer')
  await writeJsonFile(join(outputDirectory, 'project-profile.json'), profile)
  await writeJsonFile(join(outputDirectory, '.cache', 'observations.json'), observations)

  const elapsed = ((Date.now() - started) / 1000).toFixed(2)

  console.log(`Scanned ${profile.name ?? profile.root} in ${elapsed}s`)
  console.log(`  files          ${profile.files.scanned} scanned · ${profile.files.unparseable} unparseable`)
  console.log(
    `  kit sources    ${profile.kitSources.length > 0 ? profile.kitSources.map((s) => s.specifier).join(', ') : '— none found'}`,
  )
  console.log(`  style syntaxes ${profile.styleSyntaxes.join(', ') || '—'}`)
  console.log(`  aliases        ${profile.aliases.map((a) => a.pattern).join(', ') || '—'}`)
  console.log(
    `  observations   ${observations.styleValues.length} style values · ${observations.jsxElements.length} elements · ${observations.declarations.length} declarations`,
  )
  console.log(`  limitations    ${profile.limitations.length}`)
  console.log(`  → ${outputDirectory}`)

  if (!profile.usesKit) {
    console.log('\n  This project does not import the design system anywhere.')
  }
}

await main()
