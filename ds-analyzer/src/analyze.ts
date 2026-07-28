import type { AnalysisArtifact } from './domain/findings.js'
import type { Observations } from './domain/observations.js'
import type { ProjectProfile } from './domain/profile.js'
import type { A11ySpec } from './kit/a11y-spec.js'
import type { IconSpec } from './kit/icon-spec.js'
import type { KnowledgeSpec } from './kit/knowledge-spec.js'
import type { KitSpec } from './kit/spec.js'
import { buildSummary } from './metrics/health.js'
import { buildUsage } from './metrics/usage.js'
import { buildRuleContext } from './rules/context.js'
import { collectRuleLimitations, runRules } from './rules/index.js'

/**
 * Stage C: facts × specification → deviations.
 *
 * A pure composition. The only thing it touches outside its inputs is reading source files
 * for snippets, which happens once inside the context builder.
 */

export interface AnalyzeInput {
  readonly kit: KitSpec
  readonly profile: ProjectProfile
  readonly observations: Observations
  /** Kit accessibility evidence; omitted when `kit-a11y.json` has not been built. */
  readonly a11y?: A11ySpec
  /** Kit icon geometry; omitted when `kit-icons.json` has not been built. */
  readonly icons?: IconSpec
  /** Kit component signatures; omitted when `kit-signatures.json` has not been built. */
  readonly knowledge?: KnowledgeSpec
  /** Rule ids switched off in `ds.config.json`. */
  readonly disabledRules?: ReadonlySet<string>
  /** Finding ids the project has decided to live with. */
  readonly ignoredFindings?: ReadonlySet<string>
}

export const analyze = (input: AnalyzeInput): AnalysisArtifact => {
  const context = buildRuleContext(input)

  const findings = runRules(context, { ...(input.disabledRules ? { disabledRules: input.disabledRules } : {}) }).filter(
    (finding) => !(input.ignoredFindings?.has(finding.id) ?? false),
  )

  // Rule limitations join the scanner's, because to the reader they are the same fact:
  // something was not checked. Where the gap came from is an implementation detail.
  const ruleLimitations = collectRuleLimitations(context, {
    ...(input.disabledRules ? { disabledRules: input.disabledRules } : {}),
  })

  const profile =
    ruleLimitations.length === 0
      ? input.profile
      : { ...input.profile, limitations: [...input.profile.limitations, ...ruleLimitations] }

  const usage = buildUsage(input.observations, findings, input.kit, context.sources)
  const summary = buildSummary({ profile, observations: input.observations, findings, usage })

  return { $schema: 'ds-analyzer/analysis@1', findings, usage, summary }
}
