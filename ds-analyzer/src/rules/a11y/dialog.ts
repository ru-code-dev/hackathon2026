import type { Declaration, JsxElement } from '../../domain/observations.js'
import type { RawFinding, Rule, RuleContext } from '../types.js'

/**
 * Hand-rolled dialogs that trap nothing and close on nothing.
 *
 * A modal has three obligations beyond its markup, and none of them are visible to a tool
 * that inspects attributes or a rendered snapshot: `Escape` closes it, focus stays inside
 * while it is open, and focus returns to whatever opened it. `role="dialog"` plus
 * `aria-modal="true"` satisfies every ARIA checker in existence while delivering a dialog
 * that a keyboard user can neither leave nor escape.
 *
 * The evidence is read at the declaration rather than the element, because that is where
 * these obligations are met: `Escape` usually arrives through a `useEffect` listener rather
 * than a JSX prop, and focus is moved through a ref in a hook. An element-level check would
 * report every correctly-built dialog in the project.
 */

const DIALOG_ROLES: ReadonlySet<string> = new Set(['dialog', 'alertdialog'])

/** Names that appear when a component moves focus on purpose. */
const FOCUS_HINTS = ['focus', 'Focus', 'autoFocus', 'tabIndex']

const isDialogElement = (element: JsxElement): boolean => {
  const role = element.props['role']

  return (typeof role === 'string' && DIALOG_ROLES.has(role)) || 'aria-modal' in element.props
}

/** The declaration a dialog element sits inside — the scope its obligations are met at. */
const owningDeclaration = (element: JsxElement, declarations: readonly Declaration[]): Declaration | null => {
  const candidates = declarations.filter(
    (declaration) => declaration.file === element.file && declaration.line <= element.line,
  )

  // The closest declaration above the element is the one that renders it.
  return candidates.sort((left, right) => right.line - left.line)[0] ?? null
}

export const dialogFocusRule: Rule = {
  id: 'a11y.pattern.focus',
  category: 'a11y',
  description: 'Диалог не закрывается по Escape или не удерживает фокус',
  run: (context: RuleContext): RawFinding[] => {
    const findings: RawFinding[] = []
    const seen = new Set<string>()

    for (const element of context.observations.jsxElements) {
      if (!isDialogElement(element) || element.kitComponent !== null) {
        continue
      }

      const owner = owningDeclaration(element, context.observations.declarations)

      // Without an owning declaration there is no scope to judge: the obligations may be
      // met anywhere, and a finding would be a guess.
      if (owner === null) {
        continue
      }

      const key = `${owner.file}:${owner.name}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)

      const handlesEscape = owner.keysHandled.includes('Escape')
      const movesFocus =
        owner.props.some((prop) => FOCUS_HINTS.some((hint) => prop.includes(hint))) ||
        owner.ariaAttributes.includes('aria-activedescendant') ||
        owner.eventHandlers.includes('onFocus') ||
        owner.eventHandlers.includes('onBlur')

      const missing: string[] = []
      if (!handlesEscape) {
        missing.push('закрытие по Escape')
      }
      if (!movesFocus) {
        missing.push('удержание и возврат фокуса')
      }

      if (missing.length === 0) {
        continue
      }

      const equivalent = context.a11y.available ? context.a11y.canonicalComponentFor('dialog') : null

      findings.push({
        rule: 'a11y.pattern.focus',
        subkind: handlesEscape ? 'noFocusTrap' : 'noEscape',
        category: 'a11y',
        severity: 'error',
        confidence: 0.85,
        file: element.file,
        line: element.propLines['role'] ?? element.line,
        column: element.column,
        actual: `<${element.name} role="dialog">`,
        expected:
          equivalent === null
            ? null
            : { token: null, cssVar: null, component: equivalent.component, value: `<${equivalent.component} …>` },
        why:
          `Диалог ${owner.name} объявлен ролью, но в нём не найдено: ${missing.join(', ')}. ` +
          'Пользователь клавиатуры откроет его и не сможет ни выйти, ни вернуться к тому, что открыл.' +
          (equivalent === null ? '' : ` Компонент кита ${equivalent.component} это делает.`),
        note: 'Признаки читаются синтаксически: фокус, перенесённый через внешний хук, отсюда не виден.',
        rootCause: { file: owner.file, line: owner.line, name: owner.name },
        appliedTo: null,
        autoFixable: false,
        needsAgent: true,
        candidates:
          equivalent === null
            ? []
            : [
                {
                  component: equivalent.component,
                  score: 0.85,
                  reasons: [
                    'рендерит role="dialog"',
                    ...(equivalent.keysHandled.includes('Escape') ? ['закрывается по Escape'] : []),
                    ...(equivalent.managesFocus ? ['управляет фокусом'] : []),
                  ],
                },
              ],
        a11y: {
          wcag: handlesEscape ? ['2.1.2'] : ['2.1.2', '2.4.3'],
          pattern: 'dialog-modal',
          impact: 'Фокус остаётся заперт вне диалога или не возвращается: пользователь клавиатуры теряет управление.',
          fix:
            equivalent === null
              ? `Допишите недостающее: ${missing.join(', ')}.`
              : `Возьмите ${equivalent.component} из кита — он закрывается по Escape и сам управляет фокусом.`,
        },
        impactKey: 'a11y.pattern.focus',
        replaceWith: null,
      })
    }

    return findings
  },
}
