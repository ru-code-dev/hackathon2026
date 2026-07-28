import { readFileSync } from 'node:fs'

import { dimensionScaleOf } from '../css/properties.js'
import { extractValueLiterals } from '../css/value.js'
import type { JsxElement, Observations, StyleValue } from '../domain/observations.js'
import type { ProjectProfile } from '../domain/profile.js'
import { A11ySpec } from '../kit/a11y-spec.js'
import { IconSpec } from '../kit/icon-spec.js'
import { KnowledgeSpec } from '../kit/knowledge-spec.js'
import type { KitSpec } from '../kit/spec.js'
import { fromProjectPath } from '../shared/path.js'
import { parseDimension } from '../tokens/dimension.js'
import type { FrequencyIndex, RuleContext } from './types.js'

/**
 * Assembling everything the rules are allowed to know.
 *
 * Built once per run. The two derived structures are worth explaining.
 *
 * **Sources.** Findings carry a code snippet, and a snippet needs the file. Reading each
 * file once here keeps the rules pure: they receive lines, they do not open anything.
 *
 * **Spacing frequency.** The kit publishes no spacing scale — padding, margin and gap live
 * inside `@v-uik` component implementations rather than in tokens. So "is `13px` a magic
 * number?" cannot be answered against the kit and has to be answered against the project's
 * own habits: a value used twice among a hundred multiples of four is an outlier; the same
 * value used sixty times is that team's spacing unit, and calling it a mistake is noise.
 */

/**
 * Values at or below this share of all spacing declarations are treated as outliers.
 *
 * Five per cent is low enough that a genuine spacing step — which will appear far more
 * often — never trips it, and high enough to catch a value pasted from a mock-up.
 */
const MAGIC_SHARE = 0.05

/** Below this many spacing declarations there is no distribution to reason about. */
const MIN_SAMPLE = 12

/** Occurrences at or below this count are outliers regardless of project size. */
const ALWAYS_MAGIC_AT_OR_BELOW = 2

const readSources = (root: string, files: readonly string[]): Map<string, string[]> => {
  const sources = new Map<string, string[]>()

  for (const file of files) {
    try {
      sources.set(file, readFileSync(fromProjectPath(root, file), 'utf8').split(/\r?\n/))
    } catch {
      // A file that vanished between scanning and analysis costs a snippet, not the run.
    }
  }

  return sources
}

/** Counts pixel values declared on properties the kit publishes no scale for. */
export const buildSpacingIndex = (styleValues: readonly StyleValue[]): FrequencyIndex => {
  const counts = new Map<number, number>()
  let total = 0

  for (const styleValue of styleValues) {
    // Only properties the kit publishes no ramp for; everything else is judged against
    // the ramp rather than against the project's habits.
    if (dimensionScaleOf(styleValue.property)?.scale !== null) {
      continue
    }

    for (const literal of extractValueLiterals(styleValue.value)) {
      if (literal.kind !== 'dimension') {
        continue
      }
      const px = parseDimension(literal.raw)?.px ?? null
      if (px === null || px === 0) {
        continue
      }
      counts.set(px, (counts.get(px) ?? 0) + 1)
      total += 1
    }
  }

  const threshold = Math.max(ALWAYS_MAGIC_AT_OR_BELOW, Math.floor(total * MAGIC_SHARE))

  return {
    counts,
    total,
    isMagic: (px) => {
      const count = counts.get(px) ?? 0

      // Too little data to distinguish habit from accident: say nothing rather than guess.
      return total >= MIN_SAMPLE && count > 0 && count <= threshold
    },
  }
}

/** `./x.svg?url` and `#fragment` suffixes are bundler syntax, not part of the path. */
const stripReferenceSuffix = (reference: string): string => reference.split(/[?#]/)[0] ?? reference

/** Pure POSIX path resolution over project-relative paths; no filesystem involved. */
const resolveReference = (fromFile: string, reference: string): string | null => {
  const cleaned = stripReferenceSuffix(reference)

  if (cleaned.startsWith('/')) {
    return cleaned.slice(1)
  }
  if (!cleaned.startsWith('.')) {
    // A package or alias specifier: not resolvable from here, and guessing would read the
    // wrong file. The rule still reports, it just cannot match geometry.
    return null
  }

  const segments = fromFile.split('/').slice(0, -1)
  for (const part of cleaned.split('/')) {
    if (part === '' || part === '.') {
      continue
    }
    if (part === '..') {
      if (segments.length === 0) {
        return null
      }
      segments.pop()
      continue
    }
    segments.push(part)
  }

  return segments.join('/')
}

/**
 * Cached reader for `.svg` files referenced from source or styles.
 *
 * Lives here for the same reason as {@link readSources}: rules receive answers, not file
 * handles. The cache is keyed by the resolved path, so ten imports of one icon cost one
 * read.
 */
const buildSvgReader = (root: string): ((fromFile: string, reference: string) => string | null) => {
  const cache = new Map<string, string | null>()

  return (fromFile, reference) => {
    const cleaned = stripReferenceSuffix(reference)
    if (!cleaned.endsWith('.svg')) {
      return null
    }

    const resolved = resolveReference(fromFile, cleaned)
    if (resolved === null) {
      return null
    }

    const cached = cache.get(resolved)
    if (cached !== undefined) {
      return cached
    }

    let content: string | null
    try {
      content = readFileSync(fromProjectPath(root, resolved), 'utf8')
    } catch {
      content = null
    }
    cache.set(resolved, content)

    return content
  }
}

const groupElementsByFile = (elements: readonly JsxElement[]): Map<string, JsxElement[]> => {
  const byFile = new Map<string, JsxElement[]>()

  for (const element of elements) {
    const bucket = byFile.get(element.file)
    if (bucket) {
      bucket.push(element)
    } else {
      byFile.set(element.file, [element])
    }
  }

  return byFile
}

export const buildRuleContext = (input: {
  readonly kit: KitSpec
  readonly profile: ProjectProfile
  readonly observations: Observations
  /** Omitted by callers that have not built `kit-a11y.json`; degrades, never throws. */
  readonly a11y?: A11ySpec
  /** Omitted by callers that have not built `kit-icons.json`; degrades, never throws. */
  readonly icons?: IconSpec
  /** Omitted by callers that have not built `kit-signatures.json`; degrades, never throws. */
  readonly knowledge?: KnowledgeSpec
}): RuleContext => ({
  kit: input.kit,
  a11y: input.a11y ?? A11ySpec.unavailable(),
  icons: input.icons ?? IconSpec.unavailable(),
  knowledge: input.knowledge ?? KnowledgeSpec.unavailable(),
  profile: input.profile,
  observations: input.observations,
  sources: readSources(input.profile.root, input.observations.files),
  spacing: buildSpacingIndex(input.observations.styleValues),
  elementsByFile: groupElementsByFile(input.observations.jsxElements),
  svg: buildSvgReader(input.profile.root),
})
