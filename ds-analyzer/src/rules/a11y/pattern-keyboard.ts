import { compareStrings } from '../../shared/sort.js'
import type { Rule, RuleContext, RawFinding } from '../types.js'

/**
 * A widget that claims an interactive ARIA role but listens for no keys.
 *
 * This is the finding the whole accessibility layer exists for, and the one no existing
 * tool produces. `eslint-plugin-jsx-a11y` checks attributes on one element and sees nothing
 * wrong; `axe-core` inspects a rendered snapshot and sees a correct `role="tablist"` with
 * correct `aria-selected`. Neither presses a key. A hand-rolled tab strip therefore passes
 * both while being completely unusable without a mouse.
 *
 * The claim is made against the kit rather than against a specification, which is what
 * makes it both checkable and actionable: `kit-a11y.json` records that the kit's `Tabs`
 * handles four arrow keys because that is what `@v-uik/tabs` compiles to. "The kit's
 * equivalent handles these keys and yours handles none" is a statement the reader can
 * verify and act on in one step — and unlike a citation, it comes with the replacement.
 *
 * Roles that carry no keyboard contract of their own are excluded. `role="dialog"` needs
 * `Escape` and a focus trap, but a dialog whose buttons are real buttons needs no key
 * handling on the container itself, and demanding one would be wrong.
 */

/** Roles whose APG contract requires the container itself to handle keys. */
const ROLES_REQUIRING_KEYBOARD: ReadonlySet<string> = new Set([
  'tablist',
  'menu',
  'menubar',
  'listbox',
  'tree',
  'grid',
  'radiogroup',
  'toolbar',
  'combobox',
  'slider',
  'spinbutton',
])

export const patternKeyboardRule: Rule = {
  id: 'a11y.pattern.keyboard',
  category: 'a11y',
  description: 'Виджет объявил интерактивную ARIA-роль, но не обрабатывает клавиатуру',
  run: (context: RuleContext): RawFinding[] => {
    // Without the upstream there is no evidence of what the kit handles, and a finding
    // phrased as "the kit does this and you do not" would be unfounded. The scanner records
    // the gap in `limitations`; silence here is deliberate, not an oversight.
    if (!context.a11y.available) {
      return []
    }

    const findings: RawFinding[] = []

    for (const element of context.observations.jsxElements) {
      const role = element.props['role']

      if (role === null || role === undefined || !ROLES_REQUIRING_KEYBOARD.has(role)) {
        continue
      }

      // A kit component rendering its own role is the kit's business, not the consumer's.
      if (element.kitComponent !== null) {
        continue
      }

      if (element.keysHandled.length > 0) {
        continue
      }

      const hasHandler = element.eventHandlers.some((name) => name.startsWith('onKey'))

      // A handler whose body lives elsewhere is unreadable, not absent. Reporting it as a
      // keyboard failure would be a guess dressed as a fact, so it goes to the agent stage
      // instead — the distinction the `observations@2` schema exists to preserve.
      // Shortest name first, then alphabetical. Both `Tabs` and `BrowserTabs` render
      // `tablist`, and a plain alphabetical pick offers the specialised variant — a
      // qualifier in a component's name is what marks it as the narrower one, so the
      // unqualified name is the canonical answer.
      const equivalents = context.a11y.componentsRendering(role)
      const best = [...equivalents].sort(
        (left, right) =>
          left.component.length - right.component.length || compareStrings(left.component, right.component),
      )[0]

      if (best === undefined || best.keysHandled.length === 0) {
        continue
      }

      const keys = best.keysHandled.join(', ')

      findings.push({
        rule: 'a11y.pattern.keyboard',
        subkind: hasHandler ? 'handlerUnreadable' : 'noHandler',
        category: 'a11y',
        severity: hasHandler ? 'warning' : 'error',
        confidence: hasHandler ? 0.5 : 0.95,
        file: element.file,
        line: element.propLines['role'] ?? element.line,
        column: element.column,
        actual: `role="${role}"`,
        expected: {
          token: null,
          cssVar: null,
          component: best.component,
          value: `<${best.component} …>`,
        },
        why: hasHandler
          ? `Элемент объявляет role="${role}", обработчик клавиатуры есть, но его тело объявлено отдельно — ` +
            `проверить нечем. Компонент кита ${best.component} обрабатывает: ${keys}.`
          : `Элемент объявляет role="${role}", но не обрабатывает ни одной клавиши. ` +
            `Пользователь клавиатуры не сможет им управлять. Компонент кита ${best.component} ` +
            `обрабатывает: ${keys}.`,
        note: hasHandler ? 'Требуется ручная проверка либо разбор обработчика на стадии ИИ.' : null,
        rootCause: null,
        appliedTo: null,
        autoFixable: false,
        needsAgent: true,
        candidates: equivalents.map((pattern) => ({
          component: pattern.component,
          score: pattern.roles.includes(role) ? 0.9 : 0.5,
          reasons: [
            `рендерит role="${role}"`,
            ...(pattern.keysHandled.length > 0 ? [`обрабатывает ${pattern.keysHandled.join(', ')}`] : []),
            ...(pattern.managesFocus ? ['управляет фокусом'] : []),
          ],
        })),
        a11y: {
          wcag: ['2.1.1'],
          pattern: role,
          impact: `Виджет ${role} недоступен с клавиатуры: фокус в него попадает, но управлять им нечем.`,
        },
        impactKey: `a11y.pattern.keyboard:${role}`,
        replaceWith: null,
      })
    }

    return findings
  },
}
