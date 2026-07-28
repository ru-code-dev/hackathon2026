import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { KitIconsArtifact } from '../domain/kit-icons.js'
import { kitIconsArtifactSchema } from '../domain/kit-icons.js'
import { compareStrings } from '../shared/sort.js'

/** What a fingerprint resolves to: the kit icon to use, plus its geometric twins if any. */
export interface IconMatch {
  readonly name: string
  readonly size: number
  readonly viewBox: string | null
  /** Other kit icons with identical geometry — the kit has a few genuine duplicates. */
  readonly alternatives: readonly string[]
}

/**
 * Query facade over `kit-icons.json`.
 *
 * Separate from {@link KitSpec} for the same reason as `A11ySpec`: different availability.
 * When the artifact has not been built, {@link available} is `false` and the icon rules
 * record a limitation instead of reporting nothing — silence that reads as "clean" is the
 * failure mode this project refuses.
 */
export class IconSpec {
  private readonly byFingerprint: ReadonlyMap<string, IconMatch>
  private readonly previews: ReadonlyMap<string, { viewBox: string | null; shapes: readonly string[] }>

  private constructor(private readonly artifact: KitIconsArtifact) {
    const grouped = new Map<string, { name: string; size: number; viewBox: string | null }[]>()
    const previews = new Map<string, { viewBox: string | null; shapes: readonly string[] }>()

    for (const icon of artifact.icons) {
      for (const variant of icon.variants) {
        const bucket = grouped.get(variant.fingerprint) ?? []
        bucket.push({ name: icon.name, size: variant.size, viewBox: variant.viewBox })
        grouped.set(variant.fingerprint, bucket)

        // Smallest size wins as the preview; the geometry is the same by construction.
        if (!previews.has(icon.name)) {
          previews.set(icon.name, { viewBox: variant.viewBox, shapes: variant.paths })
        }
      }
    }

    const byFingerprint = new Map<string, IconMatch>()
    for (const [fingerprint, entries] of grouped.entries()) {
      const names = [...new Set(entries.map((entry) => entry.name))].sort(compareStrings)
      const primary = entries
        .filter((entry) => entry.name === names[0])
        .sort((left, right) => left.size - right.size)[0]
      if (primary === undefined) {
        continue
      }
      byFingerprint.set(fingerprint, {
        name: primary.name,
        size: primary.size,
        viewBox: primary.viewBox,
        alternatives: names.slice(1),
      })
    }

    this.byFingerprint = byFingerprint
    this.previews = previews
  }

  /** The degraded spec: every query answers "unknown", {@link available} is `false`. */
  static unavailable(): IconSpec {
    return new IconSpec({
      $schema: 'ds-analyzer/kit-icons@1',
      meta: { counts: { icons: 0, files: 0, unreadable: 0 } },
      icons: [],
      legacyComponents: [],
    })
  }

  /** For tests and callers that already hold the artifact. */
  static from(artifact: KitIconsArtifact): IconSpec {
    return new IconSpec(kitIconsArtifactSchema.parse(artifact))
  }

  static load(artifactsDir: string): IconSpec {
    const file = join(artifactsDir, 'kit-icons.json')

    if (!existsSync(file)) {
      return IconSpec.unavailable()
    }

    return new IconSpec(kitIconsArtifactSchema.parse(JSON.parse(readFileSync(file, 'utf8'))))
  }

  get available(): boolean {
    return this.artifact.icons.length > 0
  }

  get iconCount(): number {
    return this.artifact.meta.counts.icons
  }

  /** Exact geometry lookup; `null` means "the kit has no icon drawing these shapes". */
  match(fingerprint: string): IconMatch | null {
    return this.byFingerprint.get(fingerprint) ?? null
  }

  /** Drawing data for rendering a kit icon in the report. */
  preview(name: string): { viewBox: string | null; shapes: readonly string[] } | null {
    return this.previews.get(name) ?? null
  }
}
