import { z } from 'zod'

/**
 * Wire contract for `ui-analyzer/project-profile.json` (architecture.md §3bis).
 *
 * Everything the analyser knows about the *shape* of a consumer project lives here, and
 * nothing downstream is allowed to re-derive it. That separation is what keeps the
 * scanner structure-agnostic: there is exactly one module that can be wrong about where
 * the project root is, and one place to look when it is.
 *
 * Three properties of this contract are load-bearing:
 *
 *  - `kitSources` is a *computed closure*, not a constant. A project that re-exports the
 *    kit through its own barrel still counts as using the kit (§3bis.4).
 *  - `limitations` is never empty by accident. A file that failed to parse appears here
 *    rather than silently contributing nothing, because a silent skip reads as "clean".
 *  - `styleSyntaxes` records what was actually found, so a project without SCSS never
 *    pays for the SCSS collector.
 */

export const packageManagerSchema = z.enum(['npm', 'yarn', 'pnpm', 'bun', 'unknown'])

export const aliasSourceSchema = z.enum([
  'tsconfig',
  'vite',
  'webpack',
  'craco',
  'package-imports',
  'next',
  'babel-module-resolver',
  'ds-config',
])

export const styleSyntaxSchema = z.enum([
  'css',
  'css-modules',
  'scss',
  'scss-modules',
  'less',
  'styled-components',
  'emotion',
  'inline-style',
  'jss',
  /**
   * A design literal sitting in a plain TypeScript string — a colour map, a padding
   * table. Not a style syntax as such, but the same decision written somewhere the CSS
   * collectors cannot see, and the rules treat it as having no property context.
   */
  'ts-literal',
])

export const limitationReasonSchema = z.enum([
  /** The file could not be parsed at all. */
  'parse-error',
  /** A style value depends on runtime data and has no literal to check. */
  'dynamic-styles',
  /** A construct the collectors knowingly do not model. */
  'unsupported-syntax',
  /** A module specifier could not be resolved to a file or a package. */
  'unresolved-import',
  /** A configuration file was found but could not be read statically. */
  'unreadable-config',
])

export const limitationSchema = z.object({
  /** Project-relative POSIX path. */
  file: z.string(),
  line: z.number().int().positive().nullable(),
  reason: limitationReasonSchema,
  detail: z.string(),
})

export const aliasSchema = z.object({
  /** Pattern as authored, e.g. `@/*`. */
  pattern: z.string().min(1),
  /** Project-relative POSIX targets, e.g. `["src/*"]`. */
  resolvesTo: z.array(z.string()),
  source: aliasSourceSchema,
})

export const tsconfigSchema = z.object({
  /** Project-relative POSIX path. */
  path: z.string(),
  /** Directory the config governs, project-relative; `""` for the root. */
  directory: z.string(),
  baseUrl: z.string().nullable(),
  /** Configs reached through `extends`, in resolution order. */
  extendsChain: z.array(z.string()),
})

export const kitSourceSchema = z.object({
  /** Module specifier or project-relative file that yields kit symbols. */
  specifier: z.string().min(1),
  kind: z.enum([
    /** A configured kit package, e.g. `@sds-eng/base`. */
    'package',
    /** The upstream the kit wraps — importing it directly bypasses the kit. */
    'wrapped-upstream',
    /** A module inside the project that re-exports one of the above. */
    'project-barrel',
  ]),
  /** How this source was reached, for explainability in the report. */
  via: z.array(z.string()),
  /** Kit symbols known to be reachable through it; empty for star re-exports. */
  names: z.array(z.string()),
})

export const projectProfileSchema = z.object({
  $schema: z.literal('ds-analyzer/project-profile@1'),
  /** Absolute path; the only absolute path in any artifact. */
  root: z.string(),
  /** Project-relative POSIX path that was requested, `""` for the whole project. */
  scope: z.string(),
  name: z.string().nullable(),
  packageManager: packageManagerSchema,
  monorepo: z.object({
    detected: z.boolean(),
    workspaces: z.array(z.string()),
  }),
  tsconfigs: z.array(tsconfigSchema),
  aliases: z.array(aliasSchema),
  kitSources: z.array(kitSourceSchema),
  /** Version of the kit package declared in `package.json`, when present. */
  kitVersion: z.string().nullable(),
  /**
   * `false` when no kit import could be found anywhere. The report must say so instead
   * of presenting a perfect score for a project that simply does not use the kit.
   */
  usesKit: z.boolean(),
  styleSyntaxes: z.array(styleSyntaxSchema),
  files: z.object({
    scanned: z.number().int().nonnegative(),
    ignored: z.number().int().nonnegative(),
    unparseable: z.number().int().nonnegative(),
    byExtension: z.record(z.string(), z.number().int().nonnegative()),
  }),
  limitations: z.array(limitationSchema),
})

export type PackageManager = z.infer<typeof packageManagerSchema>
export type AliasSource = z.infer<typeof aliasSourceSchema>
export type StyleSyntax = z.infer<typeof styleSyntaxSchema>
export type LimitationReason = z.infer<typeof limitationReasonSchema>
export type Limitation = z.infer<typeof limitationSchema>
export type Alias = z.infer<typeof aliasSchema>
export type TsconfigInfo = z.infer<typeof tsconfigSchema>
export type KitSource = z.infer<typeof kitSourceSchema>
export type ProjectProfile = z.infer<typeof projectProfileSchema>
