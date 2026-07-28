import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

/**
 * Optional per-project configuration.
 *
 * Everything works without it. It exists for the cases static analysis provably cannot
 * reach: a kit published under a different name, an alias computed at build time, a
 * generated directory the project does not gitignore.
 *
 * Deliberately small. A configuration file that has to be filled in before the tool works
 * is a tool nobody adopts, so every field here is an escape hatch rather than a setting.
 */
export const dsConfigSchema = z.object({
  /** Package names that are the design system, when it is not `@sds-eng/*`. */
  kitPackages: z.array(z.string()).optional(),
  /** Extra ignore patterns, gitignore syntax. */
  exclude: z.array(z.string()).optional(),
  /** Aliases the config parsers could not recover, in tsconfig `paths` shape. */
  aliases: z.record(z.string(), z.array(z.string())).optional(),
  /** Rules to disable, by rule id. */
  rules: z.record(z.string(), z.enum(['off'])).optional(),
  /** Finding ids to suppress, e.g. after a deliberate exception. */
  ignoreFindings: z.array(z.string()).optional(),
})

export type DsConfig = z.infer<typeof dsConfigSchema>

export const DS_CONFIG_FILENAME = 'ds.config.json'

export interface DsConfigLoadResult {
  readonly config: DsConfig
  /** Human-readable problem with the file, when there was one. */
  readonly error: string | null
}

const EMPTY: DsConfig = {}

/**
 * Reads `ds.config.json` from `root`.
 *
 * A malformed config is reported and then ignored. Refusing to run because an optional
 * file has a typo would be the wrong trade: the audit is still useful without it.
 */
export const loadDsConfig = (root: string): DsConfigLoadResult => {
  const configPath = join(root, DS_CONFIG_FILENAME)

  if (!existsSync(configPath)) {
    return { config: EMPTY, error: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (error) {
    return {
      config: EMPTY,
      error: `${DS_CONFIG_FILENAME} is not valid JSON: ${error instanceof Error ? error.message : ''}`,
    }
  }

  const result = dsConfigSchema.safeParse(parsed)

  if (!result.success) {
    const issue = result.error.issues[0]
    return {
      config: EMPTY,
      error: `${DS_CONFIG_FILENAME} does not match the expected shape: ${issue ? `${issue.path.join('.')} — ${issue.message}` : 'unknown issue'}`,
    }
  }

  return { config: result.data, error: null }
}
