import { svgFingerprint } from '../../icons/fingerprint.js'
import type { IconMatch } from '../../kit/icon-spec.js'
import type { RawFinding, Rule, RuleContext } from '../types.js'
import { overElements, overImports, overStyleValues } from '../types.js'

/**
 * Icons that bypass the kit's icon set.
 *
 * Three ways an icon enters a project past the design system, three rules:
 *
 *  - `icon.inline-svg`   — `<svg>` markup pasted into a component;
 *  - `icon.foreign-file` — an imported `.svg` file, or one referenced from CSS `url()`;
 *  - `icon.foreign-pack` — a third-party icon library.
 *
 * The verdict is two-tier, matching the colour rules' philosophy. When the kit draws
 * exactly this geometry, the finding is a warning with the kit icon named — a deviation
 * with a known replacement. When it does not, the finding is a `candidate`: input for the
 * design-system team, not debt for the product team. Matching is exact-on-geometry only;
 * "visually similar" is a claim static analysis cannot make honestly.
 *
 * All three rules stay silent when `kit-icons.json` has not been built — an icon verdict
 * without the icon set behind it would be noise pretending to be knowledge.
 */

/** How far past the opening line an inline `<svg>` is allowed to stretch. */
const MAX_INLINE_SVG_LINES = 80

const ICON_PACKAGES = [
  'react-icons',
  '@mui/icons-material',
  '@material-ui/icons',
  'lucide-react',
  '@tabler/icons',
  '@heroicons/react',
  '@ant-design/icons',
  'react-feather',
  '@phosphor-icons/react',
  '@radix-ui/react-icons',
] as const

const CSS_SVG_URL = /url\(\s*['"]?([^'")]+\.svg(?:[?#][^'")]*)?)['"]?\s*\)/gi

const matchNote = (match: IconMatch): string | null =>
  match.alternatives.length > 0 ? `Геометрически идентична также: ${match.alternatives.join(', ')}.` : null

const matchedFinding = (
  base: Pick<RawFinding, 'rule' | 'file' | 'line' | 'column' | 'actual'>,
  match: IconMatch,
): RawFinding => ({
  ...base,
  subkind: 'kit-icon',
  category: 'icon',
  severity: 'warning',
  confidence: 0.95,
  expected: { token: null, cssVar: null, component: match.name, value: match.name },
  why:
    `В ките есть ровно эта иконка — ${match.name} (${String(match.size)}px). ` +
    'Собственная копия не перекрасится токенами темы и разойдётся с набором при его обновлении.',
  note: matchNote(match),
  rootCause: null,
  appliedTo: null,
  autoFixable: false,
  needsAgent: true,
  candidates: [{ component: match.name, score: 1, reasons: ['точное совпадение геометрии'] }],
  impactKey: `${base.rule}:${match.name}`,
  replaceWith: null,
})

const unmatchedFinding = (
  base: Pick<RawFinding, 'rule' | 'file' | 'line' | 'column' | 'actual'>,
  context: RuleContext,
  impactSuffix: string,
): RawFinding => ({
  ...base,
  subkind: 'no-match',
  category: 'icon',
  severity: 'candidate',
  confidence: 0.8,
  expected: null,
  why:
    `Иконка мимо дизайн-системы, и точного совпадения среди ${String(context.icons.iconCount)} иконок кита нет — ` +
    'кандидат на добавление в набор.',
  note: null,
  rootCause: null,
  appliedTo: null,
  autoFixable: false,
  needsAgent: true,
  candidates: [],
  impactKey: `${base.rule}:${impactSuffix}`,
  replaceWith: null,
})

/**
 * Reassembles the inline `<svg>` element's markup from the file it sits in.
 *
 * The collectors record that an `<svg>` exists; its drawing attributes live only in the
 * source text. Reading them here keeps the observation schema out of it — the fingerprint
 * is a per-rule concern, not a fact every stage needs.
 */
const inlineSvgMarkup = (context: RuleContext, file: string, line: number): string | null => {
  const lines = context.sources.get(file)
  if (lines === undefined) {
    return null
  }

  const slice = lines.slice(line - 1, line - 1 + MAX_INLINE_SVG_LINES).join('\n')
  const start = slice.indexOf('<svg')
  if (start === -1) {
    return null
  }
  const end = slice.indexOf('</svg>', start)

  return end === -1 ? slice.slice(start) : slice.slice(start, end + '</svg>'.length)
}

export const inlineSvgRule: Rule = {
  id: 'icon.inline-svg',
  category: 'icon',
  description: 'Инлайновый <svg> вместо иконки кита: kit-icon · no-match',
  run: overElements((element, context) => {
    if (!context.icons.available || element.name !== 'svg') {
      return []
    }

    const base = {
      rule: 'icon.inline-svg',
      file: element.file,
      line: element.line,
      column: element.column,
      actual: '<svg>',
    }

    const markup = inlineSvgMarkup(context, element.file, element.line)
    const geometry = markup === null ? null : svgFingerprint(markup)

    if (geometry === null) {
      // No static geometry — paths built from expressions. Matching is impossible and
      // claiming "not in the kit" would be a guess; the inline icon itself is still worth
      // a card.
      return [unmatchedFinding(base, context, `${element.file}:${String(element.line)}`)]
    }

    const match = context.icons.match(geometry.fingerprint)

    return [match === null ? unmatchedFinding(base, context, geometry.fingerprint) : matchedFinding(base, match)]
  }),
}

export const foreignSvgFileRule: Rule = {
  id: 'icon.foreign-file',
  category: 'icon',
  description: 'SVG-файл мимо набора иконок кита: kit-icon · no-match',
  run: (context) => {
    if (!context.icons.available) {
      return []
    }

    const fromImports = overImports((record, ruleContext) => {
      if (!/\.svg(?:[?#]|$)/.test(record.specifier)) {
        return []
      }

      const base = {
        rule: 'icon.foreign-file',
        file: record.file,
        line: record.line,
        column: record.column,
        actual: record.specifier,
      }

      const content = ruleContext.svg(record.file, record.specifier)
      const geometry = content === null ? null : svgFingerprint(content)

      if (geometry === null) {
        return [unmatchedFinding(base, ruleContext, record.specifier)]
      }

      const match = ruleContext.icons.match(geometry.fingerprint)

      return [match === null ? unmatchedFinding(base, ruleContext, geometry.fingerprint) : matchedFinding(base, match)]
    })

    const fromStyles = overStyleValues((styleValue, ruleContext) => {
      const findings: RawFinding[] = []

      for (const url of styleValue.value.matchAll(CSS_SVG_URL)) {
        const reference = url[1]
        if (reference === undefined) {
          continue
        }

        const base = {
          rule: 'icon.foreign-file',
          file: styleValue.file,
          line: styleValue.line,
          column: styleValue.column,
          actual: reference,
        }

        const content = ruleContext.svg(styleValue.file, reference)
        const geometry = content === null ? null : svgFingerprint(content)

        if (geometry === null) {
          findings.push(unmatchedFinding(base, ruleContext, reference))
          continue
        }

        const match = ruleContext.icons.match(geometry.fingerprint)
        findings.push(
          match === null ? unmatchedFinding(base, ruleContext, geometry.fingerprint) : matchedFinding(base, match),
        )
      }

      return findings
    })

    return [...fromImports(context), ...fromStyles(context)]
  },
}

export const foreignIconPackRule: Rule = {
  id: 'icon.foreign-pack',
  category: 'icon',
  description: 'Импорт стороннего пакета иконок',
  run: overImports((record, context) => {
    if (!context.icons.available) {
      return []
    }

    const pack = ICON_PACKAGES.find(
      (candidate) => record.specifier === candidate || record.specifier.startsWith(`${candidate}/`),
    )
    if (pack === undefined) {
      return []
    }

    return [
      {
        rule: 'icon.foreign-pack',
        subkind: null,
        category: 'icon',
        severity: 'warning',
        confidence: 1,
        file: record.file,
        line: record.line,
        column: record.column,
        actual: record.specifier,
        expected: null,
        why:
          `Иконки из «${pack}» — параллельный набор рядом с дизайн-системой: ` +
          `у кита ${String(context.icons.iconCount)} собственных иконок с токенами темы.`,
        note: null,
        rootCause: null,
        appliedTo: null,
        autoFixable: false,
        needsAgent: true,
        candidates: [],
        impactKey: `icon.foreign-pack:${pack}`,
        replaceWith: null,
      },
    ]
  }),
}
