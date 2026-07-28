import { isAnalysableStyleValue, type Rule, type RuleContext, type RawFinding } from '../types.js'

/**
 * `outline: none` with nothing put back in its place.
 *
 * The cheapest accessibility rule worth having, and probably the most frequently violated
 * thing in any real codebase. Removing the focus ring costs a keyboard user the ability to
 * see where they are on the page — the control still works, it is just invisible, which is
 * why the bug survives review by everyone who navigates with a mouse.
 *
 * Deliberately not reported when the same file also styles `:focus-visible`: that is the
 * modern, correct way to replace the default ring with a designed one, and flagging it
 * would punish exactly the teams that did the work. File granularity is the right scope
 * here because the replacement is conventionally written as a sibling rule, not on the same
 * declaration.
 */

const SUPPRESSING_VALUES: ReadonlySet<string> = new Set(['none', '0', '0px'])

const isOutlineSuppression = (property: string, value: string): boolean => {
  const normalised = value.trim().toLowerCase()

  if (property === 'outline' || property === 'outline-style') {
    return SUPPRESSING_VALUES.has(normalised) || normalised.split(/\s+/).includes('none')
  }

  return property === 'outline-width' && SUPPRESSING_VALUES.has(normalised)
}

/**
 * Files that define a focus-visible treatment somewhere.
 *
 * Built from selectors rather than from properties: what matters is that the codebase has
 * an intentional focus style, not which properties it uses to draw it.
 */
const filesWithFocusVisible = (context: RuleContext): ReadonlySet<string> => {
  const files = new Set<string>()

  for (const styleValue of context.observations.styleValues) {
    const selector = styleValue.selector ?? ''
    if (selector.includes(':focus-visible') || selector.includes(':focus-within')) {
      files.add(styleValue.file)
    }
  }

  return files
}

export const suppressedFocusRule: Rule = {
  id: 'a11y.focus.suppressed',
  category: 'a11y',
  description: 'Фокус скрыт через outline: none без замены на :focus-visible',
  run: (context: RuleContext): RawFinding[] => {
    const excused = filesWithFocusVisible(context)
    const findings: RawFinding[] = []

    for (const styleValue of context.observations.styleValues) {
      if (!isAnalysableStyleValue(styleValue) || styleValue.dynamic) {
        continue
      }

      if (!isOutlineSuppression(styleValue.property, styleValue.value)) {
        continue
      }

      const selector = styleValue.selector ?? ''

      // A rule that only targets `:focus` and removes the outline there is the same bug
      // whether or not the file defines `:focus-visible` elsewhere — but a blanket
      // `outline: none` in a file that also draws a focus-visible ring is the standard
      // reset, and reporting it would be noise.
      if (excused.has(styleValue.file) && !selector.includes(':focus')) {
        continue
      }

      findings.push({
        rule: 'a11y.focus.suppressed',
        subkind: selector.includes(':focus') ? 'onFocus' : 'blanket',
        category: 'a11y',
        severity: 'error',
        confidence: excused.has(styleValue.file) ? 0.8 : 1,
        file: styleValue.file,
        line: styleValue.line,
        column: styleValue.column,
        actual: `${styleValue.property}: ${styleValue.value}`,
        expected: null,
        why:
          'Кольцо фокуса убрано, а замена через :focus-visible в этом файле не найдена. ' +
          'Пользователь клавиатуры перестаёт видеть, где он находится: элемент работает, но невидим.',
        note: 'Если фокус оформлен в другом файле или через глобальный стиль, отметьте правило в ds.config.json.',
        rootCause: styleValue.rootCause,
        appliedTo:
          styleValue.appliedTo?.kind === 'kit-component' && styleValue.appliedTo.name !== null
            ? { component: styleValue.appliedTo.name, slot: styleValue.appliedTo.slot }
            : null,
        autoFixable: false,
        needsAgent: false,
        candidates: [],
        a11y: {
          wcag: ['2.4.7'],
          pattern: null,
          impact: 'Навигация с клавиатуры становится невидимой — непонятно, какой элемент сейчас активен.',
        },
        impactKey: 'a11y.focus.suppressed',
        replaceWith: null,
      })
    }

    return findings
  },
}
