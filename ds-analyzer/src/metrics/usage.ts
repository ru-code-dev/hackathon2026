import { extractValueLiterals } from '../css/value.js'
import type { Finding, Usage } from '../domain/findings.js'
import type { Observations } from '../domain/observations.js'
import type { KitSpec } from '../kit/spec.js'
import { compareStrings, sortStrings } from '../shared/sort.js'

/**
 * Component and token usage statistics.
 *
 * This is the half of the report that is not a complaint. A design-system audit that only
 * lists violations gets read once; one that also shows what is working — which components
 * carry the product, which variants are actually needed, which parts of the kit nobody
 * uses — is something a team comes back to.
 *
 * The variant histogram in particular answers a question the kit's own maintainers cannot
 * answer from their side: `negative` used thirteen times against `primary`'s two hundred,
 * with four attempts at a `danger` that does not exist, is a naming problem in the kit.
 */

interface ComponentStats {
  usages: number
  readonly files: Set<string>
  findings: number
  overrides: number
  readonly props: Map<string, Map<string, number>>
}

const emptyStats = (): ComponentStats => ({ usages: 0, files: new Set(), findings: 0, overrides: 0, props: new Map() })

const toRecord = (props: ReadonlyMap<string, Map<string, number>>): Record<string, Record<string, number>> => {
  const result: Record<string, Record<string, number>> = {}

  for (const key of sortStrings(props.keys())) {
    const values = props.get(key)
    if (values === undefined) {
      continue
    }
    const inner: Record<string, number> = {}
    for (const value of sortStrings(values.keys())) {
      inner[value] = values.get(value) ?? 0
    }
    result[key] = inner
  }

  return result
}

export const buildUsage = (observations: Observations, findings: readonly Finding[], kit: KitSpec): Usage => {
  const components = new Map<string, ComponentStats>()
  const foreign = new Map<string, number>()

  for (const element of observations.jsxElements) {
    if (element.kitComponent === null) {
      // Host elements are not components in the sense that matters here; a `<div>` is not
      // a missed opportunity to use the design system.
      if (/^[A-Z]/.test(element.name)) {
        foreign.set(element.name, (foreign.get(element.name) ?? 0) + 1)
      }
      continue
    }

    const stats = components.get(element.kitComponent) ?? emptyStats()
    stats.usages += 1
    stats.files.add(element.file)

    for (const [prop, value] of Object.entries(element.props)) {
      // Only literal values say anything about which variants are needed.
      if (value === null || kit.variantValues(element.kitComponent, prop) === null) {
        continue
      }
      const byValue = stats.props.get(prop) ?? new Map<string, number>()
      byValue.set(value, (byValue.get(value) ?? 0) + 1)
      stats.props.set(prop, byValue)
    }

    components.set(element.kitComponent, stats)
  }

  for (const finding of findings) {
    const component = finding.appliedTo?.component ?? finding.expected?.component
    if (component === undefined || component === null) {
      continue
    }
    const stats = components.get(component)
    if (stats === undefined) {
      continue
    }
    stats.findings += 1
    if (finding.category === 'override') {
      stats.overrides += 1
    }
  }

  const tokenUsage: Record<string, number> = {}
  for (const styleValue of observations.styleValues) {
    for (const literal of extractValueLiterals(styleValue.value)) {
      if (literal.kind !== 'var') {
        continue
      }
      const token = kit.tokenByCssVariable(literal.name)
      if (token !== null) {
        tokenUsage[token.id] = (tokenUsage[token.id] ?? 0) + 1
      }
    }
  }

  const used = new Set(components.keys())

  return {
    components: [...components.entries()]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([name, stats]) => ({
        name,
        usages: stats.usages,
        files: stats.files.size,
        findings: stats.findings,
        overrides: stats.overrides,
        props: toRecord(stats.props),
      })),
    unusedComponents: kit.componentNames().filter((name) => !used.has(name)),
    foreignComponents: [...foreign.entries()]
      .map(([name, usages]) => ({ name, usages }))
      .sort((left, right) => right.usages - left.usages || compareStrings(left.name, right.name)),
    tokenUsage: Object.fromEntries(sortStrings(Object.keys(tokenUsage)).map((id) => [id, tokenUsage[id] ?? 0])),
  }
}
