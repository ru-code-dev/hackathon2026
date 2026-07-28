import { implicitRoleOf, namesFromContents, requiresAccessibleName } from '../../a11y/aria-model.js'
import type { JsxElement } from '../../domain/observations.js'
import type { RawFinding, Rule, RuleContext } from '../types.js'

/**
 * Controls a screen reader can only announce as "button".
 *
 * An icon-only control with no text and no label is the most common accessible-name failure
 * in any component library, and it is invisible in review because the icon reads perfectly
 * to anybody looking at the screen.
 *
 * The set of roles that require a name is read from the ARIA model rather than listed here:
 * `button`, `link` and `checkbox` are the obvious ones, and the specification's full set is
 * longer than anyone would write from memory.
 */

/** Attributes any of which supplies an accessible name. */
const NAMING_ATTRIBUTES = ['aria-label', 'aria-labelledby', 'title', 'alt', 'label'] as const

const isHostElement = (element: JsxElement): boolean => /^[a-z]/.test(element.name)

/**
 * The role the element carries, explicit or implicit.
 *
 * Custom components are skipped entirely: `<IconButton icon={…} />` may well render its own
 * label internally, and only the kit's own prop contract can say. Guessing here would put a
 * finding on every wrapper in the project.
 */
const effectiveRoleOf = (element: JsxElement): string | null => {
  const explicit = element.props['role']

  if (typeof explicit === 'string') {
    return explicit
  }

  return isHostElement(element) ? implicitRoleOf(element.name) : null
}

const hasNamingAttribute = (element: JsxElement): boolean =>
  NAMING_ATTRIBUTES.some((attribute) => attribute in element.props)

export const missingAccessibleNameRule: Rule = {
  id: 'a11y.name.missing',
  category: 'a11y',
  description: 'Контрол без доступного имени — скринридер объявит только роль',
  run: (context: RuleContext): RawFinding[] => {
    const findings: RawFinding[] = []

    for (const element of context.observations.jsxElements) {
      const role = effectiveRoleOf(element)

      if (role === null || !requiresAccessibleName(role)) {
        continue
      }

      if (hasNamingAttribute(element)) {
        continue
      }

      // Text counts as a name only for roles the specification says may take one from their
      // contents. A `tabpanel` full of text still has no name.
      if (namesFromContents(role) && element.hasTextChild) {
        continue
      }

      // A kit component names itself from its own props, and the kit's contract — not this
      // rule — is what decides whether it succeeded.
      if (element.kitComponent !== null) {
        continue
      }

      const fromContents = namesFromContents(role)
      const iconOnly = fromContents && (element.props['icon'] !== undefined || element.name === 'svg')

      findings.push({
        rule: 'a11y.name.missing',
        subkind: iconOnly ? 'iconOnly' : fromContents ? 'empty' : 'unlabelled',
        category: 'a11y',
        severity: 'error',
        confidence: 0.8,
        file: element.file,
        line: element.line,
        column: element.column,
        actual: `<${element.name}${typeof element.props['role'] === 'string' ? ` role="${role}"` : ''}>`,
        expected: {
          token: null,
          cssVar: null,
          component: null,
          value: `<${element.name} aria-label="…">`,
        },
        why: fromContents
          ? `У элемента роль ${role}, но нет ни текста, ни aria-label, ни title. ` +
            `Скринридер объявит только «${role}», без указания, что этот элемент делает.`
          : `Роль ${role} не берёт имя из содержимого — только из aria-label или aria-labelledby, ` +
            'и ни того ни другого здесь нет. Сколько бы текста внутри ни было, элемент останется безымянным.',
        note: fromContents
          ? 'Текст, приходящий из выражения, отсюда не виден: если имя задаётся динамически, отметьте находку.'
          : null,
        rootCause: null,
        appliedTo: null,
        autoFixable: false,
        needsAgent: true,
        candidates: [],
        a11y: {
          wcag: ['4.1.2'],
          pattern: null,
          impact: `Пользователь скринридера слышит «${role}» и не узнаёт, что это за элемент.`,
        },
        impactKey: `a11y.name.missing:${role}`,
        replaceWith: null,
      })
    }

    return findings
  },
}
