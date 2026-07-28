import type { JsxElement } from '../../domain/observations.js'
import type { RawFinding, Rule, RuleContext } from '../types.js'

/**
 * ARIA relations that point at nothing.
 *
 * `aria-controls`, `aria-labelledby` and `aria-describedby` are id references. A reference
 * to an id that no element in the file carries is silently dropped by every browser, so the
 * markup looks wired up, reviews clean, and the relationship simply does not exist. Nothing
 * about the rendered DOM reveals it either, which is why a snapshot checker cannot see it.
 *
 * The interesting case is the one that made this rule need its own collector field. Real
 * widgets build ids from data:
 *
 *     <button aria-controls={`panel-${item.id}`} />
 *     <div id={`panel-${item.id}`} />
 *
 * Neither value is knowable statically, but they do not need to be: the reference is
 * satisfied when some element builds its `id` from *the same expression*. Comparing source
 * text answers the question without evaluating anything, and it is why `propExpressions`
 * records text rather than a guessed value.
 */

const REFERENCE_ATTRIBUTES = ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns'] as const

/** Normalised so that formatting differences do not read as different expressions. */
const normaliseExpression = (text: string): string => text.replace(/\s+/g, '')

interface IdIndex {
  readonly literals: ReadonlySet<string>
  readonly expressions: ReadonlySet<string>
}

const indexIdsByFile = (elements: readonly JsxElement[]): ReadonlyMap<string, IdIndex> => {
  const literals = new Map<string, Set<string>>()
  const expressions = new Map<string, Set<string>>()

  for (const element of elements) {
    const literal = element.props['id']
    if (typeof literal === 'string') {
      const bucket = literals.get(element.file) ?? new Set<string>()
      bucket.add(literal)
      literals.set(element.file, bucket)
    }

    const expression = element.propExpressions['id']
    if (expression !== undefined) {
      const bucket = expressions.get(element.file) ?? new Set<string>()
      bucket.add(normaliseExpression(expression))
      expressions.set(element.file, bucket)
    }
  }

  const files = new Set([...literals.keys(), ...expressions.keys()])

  return new Map(
    [...files].map((file) => [
      file,
      { literals: literals.get(file) ?? new Set<string>(), expressions: expressions.get(file) ?? new Set<string>() },
    ]),
  )
}

export const ariaRelationsRule: Rule = {
  id: 'a11y.pattern.relations',
  category: 'a11y',
  description: 'ARIA-связь ссылается на id, которого нет',
  run: (context: RuleContext): RawFinding[] => {
    const idsByFile = indexIdsByFile(context.observations.jsxElements)
    const findings: RawFinding[] = []

    for (const element of context.observations.jsxElements) {
      // A kit component receives ids through props and wires them internally; the target
      // is genuinely not in this file, and reporting it would be wrong every time.
      if (element.kitComponent !== null) {
        continue
      }

      const index = idsByFile.get(element.file) ?? { literals: new Set<string>(), expressions: new Set<string>() }

      for (const attribute of REFERENCE_ATTRIBUTES) {
        const literal = element.props[attribute]
        const expression = element.propExpressions[attribute]

        if (typeof literal === 'string') {
          // An id list may name several targets; every one of them has to exist.
          const missing = literal
            .trim()
            .split(/\s+/)
            .filter((id) => id.length > 0 && !index.literals.has(id))

          if (missing.length === 0) {
            continue
          }

          findings.push({
            rule: 'a11y.pattern.relations',
            subkind: 'danglingId',
            category: 'a11y',
            severity: 'error',
            confidence: 0.9,
            file: element.file,
            line: element.propLines[attribute] ?? element.line,
            column: element.column,
            actual: `${attribute}="${literal}"`,
            expected: null,
            why:
              `${attribute} ссылается на id ${missing.join(', ')}, которого нет ни на одном элементе этого файла. ` +
              'Браузер молча отбрасывает такую ссылку: разметка выглядит связанной, но связи нет.',
            note: 'Если целевой элемент объявлен в другом файле, правило этого не видит — проверьте вручную.',
            rootCause: null,
            appliedTo: null,
            autoFixable: false,
            needsAgent: false,
            candidates: [],
            a11y: {
              wcag: ['1.3.1', '4.1.2'],
              pattern: null,
              impact: 'Связь между элементами не существует: скринридер не свяжет вкладку с панелью, поле с подписью.',
            },
            impactKey: `a11y.pattern.relations:${attribute}`,
            replaceWith: null,
          })
          continue
        }

        if (expression === undefined) {
          continue
        }

        if (index.expressions.has(normaliseExpression(expression))) {
          continue
        }

        findings.push({
          rule: 'a11y.pattern.relations',
          subkind: 'unmatchedExpression',
          category: 'a11y',
          severity: 'warning',
          confidence: 0.6,
          file: element.file,
          line: element.propLines[attribute] ?? element.line,
          column: element.column,
          actual: `${attribute}={${expression}}`,
          expected: null,
          why:
            `${attribute} собран из выражения, но ни один элемент этого файла не строит свой id так же. ` +
            'Скорее всего связь не сходится — но выражение не вычисляется, поэтому это подозрение, а не факт.',
          note: 'Требует ручной проверки либо разбора на стадии ИИ.',
          rootCause: null,
          appliedTo: null,
          autoFixable: false,
          needsAgent: true,
          candidates: [],
          a11y: {
            wcag: ['1.3.1'],
            pattern: null,
            impact: 'Если выражения действительно расходятся, связь между элементами не существует.',
          },
          impactKey: `a11y.pattern.relations:${attribute}:expression`,
          replaceWith: null,
        })
      }
    }

    return findings
  },
}
