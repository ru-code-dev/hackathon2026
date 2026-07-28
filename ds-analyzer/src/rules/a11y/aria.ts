import {
  implicitRoleOf,
  isAbstractRole,
  isKnownAriaAttribute,
  isKnownRole,
  prohibitedPropsOf,
  requiredPropsOf,
  roleSupports,
} from '../../a11y/aria-model.js'
import type { JsxElement } from '../../domain/observations.js'
import type { RawFinding, Rule, RuleContext } from '../types.js'

/**
 * ARIA that the specification itself rejects.
 *
 * Everything here is decided from the ARIA 1.2 role model rather than from an opinion, so
 * there is no threshold to tune and no judgement to disagree with: `role="buton"` names
 * nothing, `aria-labeledby` is not an attribute, a `checkbox` without `aria-checked` has no
 * state to announce. A screen reader either ignores these or announces something wrong, and
 * both failures are invisible to everyone who does not use one.
 *
 * Deliberately confined to what the specification calls illegal. "This role is unusual
 * here" is a different, softer claim, and mixing the two would let a debatable warning
 * discredit the ones that are simply facts.
 */

const ariaAttributesOf = (element: JsxElement): string[] =>
  Object.keys(element.props).filter((name) => name.startsWith('aria-'))

/** A component may forward `role` to any element, so only host tags can be judged. */
const isHostElement = (element: JsxElement): boolean => /^[a-z]/.test(element.name)

const lineOf = (element: JsxElement, prop: string): number => element.propLines[prop] ?? element.line

const base = (
  element: JsxElement,
  prop: string,
): Pick<
  RawFinding,
  'category' | 'file' | 'line' | 'column' | 'rootCause' | 'appliedTo' | 'candidates' | 'replaceWith'
> => ({
  category: 'a11y',
  file: element.file,
  line: lineOf(element, prop),
  column: element.column,
  rootCause: null,
  appliedTo: null,
  candidates: [],
  replaceWith: null,
})

export const invalidAriaRule: Rule = {
  id: 'a11y.aria.invalid',
  category: 'a11y',
  description: 'Роль или ARIA-атрибут, которых нет в спецификации',
  run: (context: RuleContext): RawFinding[] => {
    const findings: RawFinding[] = []

    for (const element of context.observations.jsxElements) {
      const role = element.props['role']

      if (typeof role === 'string' && !isKnownRole(role)) {
        findings.push({
          ...base(element, 'role'),
          rule: 'a11y.aria.invalid',
          subkind: isAbstractRole(role) ? 'abstractRole' : 'unknownRole',
          severity: 'error',
          confidence: 1,
          actual: `role="${role}"`,
          expected: null,
          why: isAbstractRole(role)
            ? `role="${role}" — абстрактная роль. Спецификация запрещает ставить её в разметку: ` +
              'она существует только как основа для других ролей, и вспомогательные технологии её игнорируют.'
            : `role="${role}" нет в ARIA 1.2. Атрибут будет проигнорирован, и элемент останется тем, ` +
              'чем был по своему тегу.',
          note: null,
          autoFixable: false,
          needsAgent: false,
          a11y: {
            wcag: ['4.1.2'],
            pattern: null,
            impact: 'Скринридер объявит элемент не тем, чем он выглядит, либо не объявит вовсе.',
          },
          impactKey: `a11y.aria.invalid:role:${role}`,
        })
      }

      for (const attribute of ariaAttributesOf(element)) {
        if (!isKnownAriaAttribute(attribute)) {
          findings.push({
            ...base(element, attribute),
            rule: 'a11y.aria.invalid',
            subkind: 'unknownAttribute',
            severity: 'error',
            confidence: 1,
            actual: attribute,
            expected: null,
            why:
              `${attribute} нет в ARIA 1.2 — скорее всего опечатка. Атрибут молча игнорируется, ` +
              'поэтому состояние, которое он должен был передать, не передаётся вообще.',
            note: null,
            autoFixable: false,
            needsAgent: false,
            a11y: {
              wcag: ['4.1.2'],
              pattern: null,
              impact: 'Состояние элемента не доходит до вспомогательных технологий.',
            },
            impactKey: `a11y.aria.invalid:attr:${attribute}`,
          })
          continue
        }

        // Only meaningful against a role we actually know: without one there is nothing to
        // check support against, and guessing the implicit role of a custom component
        // would produce confident nonsense.
        if (typeof role !== 'string' || !isKnownRole(role)) {
          continue
        }

        if (prohibitedPropsOf(role).includes(attribute)) {
          findings.push({
            ...base(element, attribute),
            rule: 'a11y.aria.invalid',
            subkind: 'prohibitedAttribute',
            severity: 'error',
            confidence: 1,
            actual: `${attribute} на role="${role}"`,
            expected: null,
            why: `Спецификация запрещает ${attribute} на role="${role}".`,
            note: null,
            autoFixable: false,
            needsAgent: false,
            a11y: {
              wcag: ['4.1.2'],
              pattern: null,
              impact: 'Запрещённый атрибут игнорируется или ломает объявление элемента.',
            },
            impactKey: `a11y.aria.invalid:prohibited:${role}:${attribute}`,
          })
        } else if (!roleSupports(role, attribute)) {
          findings.push({
            ...base(element, attribute),
            rule: 'a11y.aria.invalid',
            subkind: 'unsupportedAttribute',
            severity: 'warning',
            confidence: 0.9,
            actual: `${attribute} на role="${role}"`,
            expected: null,
            why: `role="${role}" не поддерживает ${attribute}: атрибут не будет прочитан.`,
            note: null,
            autoFixable: false,
            needsAgent: false,
            a11y: {
              wcag: ['4.1.2'],
              pattern: null,
              impact: 'Атрибут не даёт ничего — состояние остаётся необъявленным.',
            },
            impactKey: `a11y.aria.invalid:unsupported:${role}:${attribute}`,
          })
        }
      }
    }

    return findings
  },
}

export const requiredAriaRule: Rule = {
  id: 'a11y.aria.required',
  category: 'a11y',
  description: 'Роль без обязательных ARIA-атрибутов',
  run: (context: RuleContext): RawFinding[] => {
    const findings: RawFinding[] = []

    for (const element of context.observations.jsxElements) {
      const role = element.props['role']

      if (typeof role !== 'string' || !isKnownRole(role) || element.kitComponent !== null) {
        continue
      }

      const missing = requiredPropsOf(role).filter((attribute) => !(attribute in element.props))

      if (missing.length === 0) {
        continue
      }

      findings.push({
        ...base(element, 'role'),
        rule: 'a11y.aria.required',
        subkind: role,
        severity: 'error',
        confidence: 0.95,
        actual: `role="${role}"`,
        expected: null,
        why:
          `role="${role}" обязана нести ${missing.join(', ')}. Без этого состояние элемента ` +
          'не объявляется: он выглядит переключаемым, но всегда сообщает одно и то же.',
        note: null,
        autoFixable: false,
        needsAgent: false,
        a11y: {
          wcag: ['4.1.2'],
          pattern: role,
          impact: `Состояние ${role} не передаётся: пользователь скринридера не узнает, включён элемент или нет.`,
        },
        impactKey: `a11y.aria.required:${role}:${missing.join(',')}`,
      })
    }

    return findings
  },
}

export const redundantRoleRule: Rule = {
  id: 'a11y.aria.redundant',
  category: 'a11y',
  description: 'Роль дублирует ту, что у тега уже есть',
  run: (context: RuleContext): RawFinding[] => {
    const findings: RawFinding[] = []

    for (const element of context.observations.jsxElements) {
      const role = element.props['role']

      if (typeof role !== 'string' || !isHostElement(element)) {
        continue
      }

      if (implicitRoleOf(element.name) !== role) {
        continue
      }

      findings.push({
        ...base(element, 'role'),
        rule: 'a11y.aria.redundant',
        subkind: null,
        severity: 'info',
        confidence: 1,
        actual: `<${element.name} role="${role}">`,
        expected: { token: null, cssVar: null, component: null, value: `<${element.name}>` },
        why:
          `<${element.name}> уже имеет роль ${role}. Атрибут ничего не добавляет и создаёт впечатление, ` +
          'что семантика держится на нём, — при рефакторинге тег заменят, а роль оставят.',
        note: null,
        autoFixable: true,
        needsAgent: false,
        a11y: {
          wcag: [],
          pattern: null,
          impact: 'Вреда сейчас нет; риск в том, что явная роль переживёт замену тега.',
        },
        impactKey: `a11y.aria.redundant:${element.name}`,
        replaceWith: null,
      })
    }

    return findings
  },
}
