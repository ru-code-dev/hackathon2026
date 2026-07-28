import { dimensionScaleOf, type DimensionScaleName } from '../../css/properties.js'
import { extractValueLiterals } from '../../css/value.js'
import type { StyleValue } from '../../domain/observations.js'
import { parseDimension } from '../../tokens/dimension.js'
import { literalColumn } from '../position.js'
import type { RawFinding, Rule, RuleContext } from '../types.js'

/**
 * `token.literal.dimension` — a raw length written where a token belongs.
 *
 * Three outcomes, and the third is the interesting one.
 *
 * - `onScale` — the value is on the kit's ramp. Still a literal, still reported, but at
 *   `info`: the fix is mechanical and the rendering does not change.
 * - `offScale` — a ramp exists and the value is not on it. Somebody typed a number.
 * - `noScale` — **the kit has no ramp for this property at all.** Padding, margin and gap
 *   live inside `@v-uik` component implementations rather than in tokens, so there is
 *   nothing to compare against. The only available evidence is the project's own
 *   distribution, so a value is called magic when it is rare against the team's habits.
 *
 * Which properties take part at all is decided in `css/properties.ts`, and it is
 * deliberately narrow: `min-width: 480px` on a dialog is a layout decision with no token
 * that could replace it, and reporting it would be a finding nobody can act on.
 */

const scaleLabel: Readonly<Record<DimensionScaleName, string>> = {
  borderRadiusPx: 'скруглений',
  borderWidthPx: 'толщин границы',
  fontSizePx: 'кеглей',
  lineHeightPx: 'интерлиньяжа',
}

const findTokenForPx = (context: RuleContext, px: number, scale: DimensionScaleName): string | null => {
  // The scale is derived from the tokens, so a value on it always has a token behind it.
  const match = context.kit.tokens.tokens.find((token) => {
    if (token.cssVariable === null) {
      return false
    }
    if ((token.dimension?.[context.kit.mode]?.px ?? null) !== px) {
      return false
    }
    return scale === 'fontSizePx'
      ? token.kind === 'fontSize'
      : scale === 'lineHeightPx'
        ? token.kind === 'lineHeight'
        : token.pathString.toLowerCase().includes(scale === 'borderRadiusPx' ? 'borderradius' : 'borderwidth')
  })

  return match?.cssVariable ?? null
}

const findingsFor = (styleValue: StyleValue, context: RuleContext): RawFinding[] => {
  // A plain TypeScript literal has no property context, so it falls into the scaleless
  // bucket: the value is real, the ramp that would judge it is unknowable.
  const scale = styleValue.source === 'ts-literal' ? { scale: null } : dimensionScaleOf(styleValue.property)

  if (scale === null) {
    return []
  }

  const findings: RawFinding[] = []

  for (const literal of extractValueLiterals(styleValue.value)) {
    if (literal.kind !== 'dimension') {
      continue
    }

    const dimension = parseDimension(literal.raw)
    const px = dimension?.px ?? null

    // A zero carries no design decision, and a context-dependent unit has no pixel value
    // to compare with anything.
    if (px === null || px === 0) {
      continue
    }

    const common = {
      rule: 'token.literal.dimension',
      category: 'token' as const,
      file: styleValue.file,
      line: styleValue.line,
      column: literalColumn(styleValue, literal.offset),
      actual: literal.raw,
      rootCause: styleValue.rootCause,
      appliedTo:
        styleValue.appliedTo?.kind === 'kit-component' && styleValue.appliedTo.name !== null
          ? { component: styleValue.appliedTo.name, slot: styleValue.appliedTo.slot }
          : null,
      needsAgent: false,
      candidates: [],
      impactKey: `token.literal.dimension:${styleValue.property}:${literal.raw}`,
    }

    if (scale.scale === null) {
      const magic = context.spacing.isMagic(px)

      findings.push({
        ...common,
        subkind: 'noScale',
        severity: magic ? 'warning' : 'info',
        confidence: magic ? 0.7 : 0.5,
        expected: null,
        why: magic
          ? `${literal.raw} встречается в проекте ${String(context.spacing.counts.get(px) ?? 0)} раз(а) на фоне остальных отступов — похоже на число из макета.`
          : `${literal.raw} — сырой отступ. В ките нет шкалы отступов, поэтому проверить его не с чем; значение зафиксировано как есть.`,
        note:
          context.spacing.total < 12
            ? null
            : 'У кита нет шкалы отступов (диагностика spacing-scale-missing) — вердикт опирается на частоту значений в самом проекте.',
        autoFixable: false,
        replaceWith: null,
      })
      continue
    }

    const values = context.kit.scaleValues(scale.scale)
    const onScale = values.includes(px)
    const cssVar = onScale ? findTokenForPx(context, px, scale.scale) : null
    const neighbours = onScale ? [] : context.kit.neighboursOnScale(px, scale.scale)

    findings.push({
      ...common,
      subkind: onScale ? 'onScale' : 'offScale',
      severity: onScale ? 'info' : 'warning',
      confidence: 1,
      expected:
        cssVar === null
          ? null
          : {
              token: context.kit.tokenByCssVariable(cssVar)?.id ?? null,
              cssVar,
              component: null,
              value: `var(${cssVar})`,
            },
      why: onScale
        ? `${literal.raw} есть в шкале ${scaleLabel[scale.scale]}, но записан литералом — при изменении шкалы значение здесь не поедет.`
        : `${literal.raw} нет в шкале ${scaleLabel[scale.scale]} [${values.join(', ')}]${neighbours.length > 0 ? `; ближайшие — ${neighbours.join(' и ')}` : ''}.`,
      note: null,
      autoFixable: onScale && cssVar !== null,
      replaceWith: cssVar === null ? null : `var(${cssVar})`,
    })
  }

  return findings
}

export const dimensionLiteralRule: Rule = {
  id: 'token.literal.dimension',
  category: 'token',
  description: 'Сырой размер вместо токена: onScale · offScale · noScale',
  run: (context: RuleContext): RawFinding[] =>
    context.observations.styleValues.flatMap((styleValue) => findingsFor(styleValue, context)),
}
