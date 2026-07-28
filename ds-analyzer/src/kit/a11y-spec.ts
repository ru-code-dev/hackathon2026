import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { KitA11yArtifact, KitPattern } from '../domain/kit-a11y.js'
import { kitA11yArtifactSchema } from '../domain/kit-a11y.js'
import { compareStrings } from '../shared/sort.js'

/**
 * Query facade over `kit-a11y.json`.
 *
 * Loaded separately from {@link KitSpec} rather than folded into it. The two artifacts have
 * different availability: tokens and components are extracted from a bare checkout and are
 * always there, while this one needs `@v-uik` installed. Merging them would have made the
 * whole kit specification fail to load whenever the upstream was missing, turning an
 * optional enrichment into a hard dependency.
 *
 * When the artifact is absent or reports no upstream, every query answers "unknown" and
 * {@link available} is `false`. Rules must branch on that and record a limitation — an
 * empty answer here means "not checked", never "nothing to report".
 */
export class A11ySpec {
  private readonly byComponent: ReadonlyMap<string, KitPattern>
  private readonly byRole: ReadonlyMap<string, KitPattern[]>

  private constructor(private readonly artifact: KitA11yArtifact) {
    this.byComponent = new Map(artifact.patterns.map((pattern) => [pattern.component, pattern]))

    const byRole = new Map<string, KitPattern[]>()
    for (const pattern of artifact.patterns) {
      for (const role of pattern.roles) {
        const bucket = byRole.get(role)
        if (bucket) {
          bucket.push(pattern)
        } else {
          byRole.set(role, [pattern])
        }
      }
    }
    for (const bucket of byRole.values()) {
      bucket.sort((left, right) => compareStrings(left.component, right.component))
    }

    this.byRole = byRole
  }

  /** Loads the artifact, falling back to an unavailable spec when it has not been built. */
  static load(artifactsDir: string): A11ySpec {
    const file = join(artifactsDir, 'kit-a11y.json')

    if (!existsSync(file)) {
      return A11ySpec.unavailable()
    }

    return new A11ySpec(kitA11yArtifactSchema.parse(JSON.parse(readFileSync(file, 'utf8'))))
  }

  static from(artifact: KitA11yArtifact): A11ySpec {
    return new A11ySpec(artifact)
  }

  /** The shape every consumer gets when `@v-uik` was never read. */
  static unavailable(): A11ySpec {
    return new A11ySpec({
      $schema: 'ds-analyzer/kit-a11y@1',
      meta: { upstreamVersion: 'unknown', packagesScanned: 0, upstreamAvailable: false },
      patterns: [],
      spacing: { steps: [], offGridSteps: [], totalDeclarations: 0, coverage: 0, gridBase: 4, gridCoverage: 0 },
      diagnostics: [],
    })
  }

  get available(): boolean {
    return this.artifact.meta.upstreamAvailable
  }

  get upstreamVersion(): string {
    return this.artifact.meta.upstreamVersion
  }

  get spacing(): KitA11yArtifact['spacing'] {
    return this.artifact.spacing
  }

  pattern(component: string): KitPattern | null {
    return this.byComponent.get(component) ?? null
  }

  /**
   * Kit components that render `role`, ranked by name for reproducibility.
   *
   * This is what turns "you hand-rolled a tablist" into "the kit's `Tabs` renders that role
   * and handles four arrow keys, and yours handles none" — a statement backed by the
   * upstream's own code rather than by a specification the reader has to go and trust.
   */
  componentsRendering(role: string): readonly KitPattern[] {
    return this.byRole.get(role) ?? []
  }

  /**
   * The component to actually offer for a role.
   *
   * Shortest name first, then alphabetical. Several components legitimately render the same
   * role — `Tabs` and `BrowserTabs` both render `tablist`, `Modal` and `DatePicker` both
   * render `dialog` — and picking alphabetically hands the reader the specialised one. A
   * qualifier in the name is exactly what marks a component as the narrower case, so the
   * unqualified name is the canonical answer.
   *
   * Lives here rather than in the rules so that two rules answering the same question
   * cannot answer it differently.
   */
  canonicalComponentFor(role: string): KitPattern | null {
    return (
      [...this.componentsRendering(role)].sort(
        (left, right) =>
          left.component.length - right.component.length || compareStrings(left.component, right.component),
      )[0] ?? null
    )
  }

  /** `true` when `px` sits on the grid the upstream's own spacing follows. */
  isOnSpacingGrid(px: number): boolean {
    return px % this.artifact.spacing.gridBase === 0
  }

  /** Steps the upstream actually uses, ascending; empty when the upstream was not read. */
  spacingSteps(): readonly number[] {
    return this.artifact.spacing.steps.map((step) => step.px)
  }
}
