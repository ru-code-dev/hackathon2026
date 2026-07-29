import { defaultArtifactsDir } from '../config.js'
import { runAnalyze } from './run-analyze.js'

/**
 * `tsx src/cli/analyze.ts <path> [--out <dir>] [--exclude <glob>]… [--no-dashboard]`
 *
 * Needs the committed artifacts and nothing else — no checkout of the UI kit.
 *
 * Thin argument shell over {@link runAnalyze}, which the Qwen-skill bundle also calls —
 * one pipeline, two entry points.
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

const args = parseArguments(process.argv.slice(2))

await runAnalyze({
  path: args.path,
  artifactsDir: args.artifactsDir ?? defaultArtifactsDir,
  outputDirectory: args.outputDirectory,
  exclude: args.exclude,
  kitPackages: args.kitPackages,
  skipDashboard: args.skipDashboard,
})
