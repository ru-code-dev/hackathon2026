import type { AnalysisArtifact } from './domain/findings.js'
import type { Observations } from './domain/observations.js'
import type { ProjectProfile } from './domain/profile.js'
import type { KitSpec } from './kit/spec.js'
import { buildSummary } from './metrics/health.js'
import { buildUsage } from './metrics/usage.js'
import { buildRuleContext } from './rules/context.js'
import { runRules } from './rules/index.js'

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

  const usage = buildUsage(input.observations, findings, input.kit)
  const summary = buildSummary({ profile: input.profile, observations: input.observations, findings, usage })

  return { $schema: 'ds-analyzer/analysis@1', findings, usage, summary }
}
