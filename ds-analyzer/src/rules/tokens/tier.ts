import { colorRoleOf } from '../../css/properties.js'
import { extractValueLiterals } from '../../css/value.js'
import { literalColumn } from '../position.js'
import type { RawFinding, Rule, RuleContext } from '../types.js'

/**
 * `token.tier.violation` — a `ref` custom property used where a `sys` one exists.
 *
 * This is the one rule that fires on code doing the right thing. `var(--sds-eng-palette-
 * electric-electric700)` is a token, correctly referenced — and it is still wrong,
 * because `ref` is a colour and `sys` is a role.
 *
 *   ref.palette.electric.electric700   light #2969e3   dark #2969e3
 *   sys.Border.borderAccent            light #2969e3   dark #2a72f8
 *
 * The two are indistinguishable until somebody switches the theme, at which point the
 * `ref` reference silently stays light. Nothing warns, nothing breaks, the border is just
 * quietly wrong.
 *
 * The rule only fires when a `sys` token of the *same role* holds the same value. Without
 * that condition it would demand fixes that cannot be made: the kit has far more palette
 * entries than semantic roles, and a colour with no role cannot be expressed as one.
 */

export const tierViolationRule: Rule = {
  id: 'token.tier.violation',
  category: 'token',
  description: 'ref-переменная там, где есть sys-роль',
  run: (context: RuleContext): RawFinding[] => {
    const findings: RawFinding[] = []

    for (const styleValue of context.observations.styleValues) {
      const role = colorRoleOf(styleValue.property)

      for (const literal of extractValueLiterals(styleValue.value)) {
        if (literal.kind !== 'var') {
          continue
        }

        const token = context.kit.tokenByCssVariable(literal.name)
        if (token?.tier !== 'ref') {
          continue
        }

        const value = token.resolved[context.kit.mode]
        if (typeof value !== 'string') {
          continue
        }

        const semantic = context.kit.semanticTokenFor(value, role)
        const semanticVariable = semantic?.cssVariable ?? null
        if (semantic === null || semanticVariable === null) {
          continue
        }

        const dark = semantic.resolved.dark
        const themeNote =
          typeof dark === 'string' && dark.toLowerCase() !== value.toLowerCase()
            ? `В тёмной теме ${semantic.id} становится ${dark}, а ${token.id} остаётся ${value}.`
            : 'Значения тем сейчас совпадают, но роль переживёт смену палитры, а краска — нет.'

        findings.push({
          rule: 'token.tier.violation',
          subkind: null,
          category: 'token',
          severity: 'error',
          confidence: 1,
          file: styleValue.file,
          line: styleValue.line,
          column: literalColumn(styleValue, literal.offset),
          actual: literal.name,
          expected: {
            token: semantic.id,
            cssVar: semantic.cssVariable,
            component: null,
            value: `var(${semantic.cssVariable})`,
          },
          why: `${literal.name} — это краска (${token.id}), а не роль. ${themeNote}`,
          note: null,
          rootCause: styleValue.rootCause,
          appliedTo:
            styleValue.appliedTo?.kind === 'kit-component' && styleValue.appliedTo.name !== null
              ? { component: styleValue.appliedTo.name, slot: styleValue.appliedTo.slot }
              : null,
          autoFixable: true,
          needsAgent: false,
          candidates: [],
          impactKey: `token.tier.violation:${literal.name}`,
          replaceWith: `var(${semantic.cssVariable})`,
        })
      }
    }

    return findings
  },
}
