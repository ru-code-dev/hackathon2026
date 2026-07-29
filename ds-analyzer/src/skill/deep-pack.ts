import type { Finding, Usage } from '../domain/findings.js'
import type { KitCard, KitCardsArtifact } from '../domain/kit-knowledge.js'

/**
 * Context packs for the AI stage of the Qwen skill (`/ds-deep`).
 *
 * The model that will read these is assumed weak, so the pack is the whole world: the
 * custom component's source, the static scorer's candidates with their T1 cards, the T0
 * catalogue of the entire kit, and the answer template — one file, one component, one
 * verdict. The model never assembles context itself and never opens project files.
 *
 * Budget discipline: architecture.md §8 allots ~8k tokens per agent call. The caps below
 * (source lines, candidates, props, examples) keep a pack near 20–24k characters; when a
 * component's source alone blows past that, the source is cut harder rather than letting
 * one giant file starve the candidates section, which is the half the verdict needs most.
 */

const MAX_SOURCE_LINES = 150
const REDUCED_SOURCE_LINES = 60
const MAX_CANDIDATES = 3
const MAX_PROPS_PER_CARD = 15
const MAX_EXAMPLES_PER_CARD = 5
const PACK_CHAR_BUDGET = 24_000

type CustomComponent = Usage['customComponents'][number]

export interface DeepPackEntry {
  readonly component: string
  readonly file: string
  readonly line: number
  readonly usages: number
  readonly bestCandidate: { component: string; score: number } | null
  /** File name for the pack, unique per declaration site. */
  readonly packName: string
  readonly markdown: string
}

/** The component finding produced for this exact declaration, when the scorer made one. */
export const findingFor = (component: CustomComponent, findings: readonly Finding[]): Finding | null => {
  for (const finding of findings) {
    if (!finding.rule.startsWith('component.')) continue
    if (finding.file !== component.file) continue
    if (finding.line === component.line || finding.actual === component.name) return finding
  }
  return null
}

/**
 * Components worth an AI pass, most valuable first: ones the scorer matched to the kit
 * (there is something concrete to verify), then by how much code depends on them.
 */
export const rankForDeepAnalysis = (
  usage: Usage,
  findings: readonly Finding[],
): { component: CustomComponent; finding: Finding | null }[] =>
  usage.customComponents
    .map((component) => ({ component, finding: findingFor(component, findings) }))
    .sort((left, right) => {
      const leftScore = left.finding?.candidates[0]?.score ?? 0
      const rightScore = right.finding?.candidates[0]?.score ?? 0
      return rightScore - leftScore || right.component.usages - left.component.usages
    })

const TOKEN_VERDICT_LABEL: Record<CustomComponent['tokenVerdict'], string> = {
  tokens: 'стили только на токенах ДС',
  mixed: 'токены + хардкод',
  hardcode: 'только хардкод',
  'no-styles': 'собственных стилей нет',
}

const codeFence = (language: string, code: string): string => `\`\`\`${language}\n${code}\n\`\`\``

const cardSection = (card: KitCard, index: number, score: number | null, reasons: readonly string[]): string => {
  const props = card.t1.props
    .slice(0, MAX_PROPS_PER_CARD)
    .map((prop) => {
      const values = prop.values.length > 0 ? ` = ${prop.values.join(' | ')}` : ''
      const doc = prop.doc === null ? '' : ` — ${prop.doc}`
      return `  - \`${prop.name}\`${prop.type === null ? '' : `: ${prop.type}`}${values}${doc}`
    })
    .join('\n')

  const variants = Object.entries(card.t1.variants)
    .map(([prop, values]) => `  - ${prop}: ${values.join(', ')}`)
    .join('\n')

  const lines = [
    `### Кандидат ${String(index + 1)}: ${card.name}${score === null ? '' : ` · score ${String(score)}`}`,
    reasons.length > 0 ? `- Признаки совпадения: ${reasons.join('; ')}` : null,
    `- Импорт: \`${card.t1.import}\``,
    props.length > 0 ? `- Пропы (топ ${String(MAX_PROPS_PER_CARD)}):\n${props}` : '- Пропы: нет данных',
    variants.length > 0 ? `- Варианты:\n${variants}` : null,
    card.t1.slots.length > 0 ? `- Слоты: ${card.t1.slots.join(', ')}` : null,
    card.t1.subcomponents.length > 0 ? `- Субкомпоненты: ${card.t1.subcomponents.join(', ')}` : null,
    card.t1.examples.length > 0
      ? `- Примеры в ките: ${card.t1.examples.slice(0, MAX_EXAMPLES_PER_CARD).join(', ')}`
      : null,
  ].filter((line): line is string => line !== null)

  return lines.join('\n')
}

const ANSWER_TEMPLATE = [
  '## Шаблон ответа — заполни строго его, ничего не добавляя',
  '',
  codeFence(
    'text',
    [
      'компонент: <имя>',
      'вердикт: заменить на <КомпонентКита> | форк <КомпонентКита> | оставить кастомным | кандидат в ДС',
      'уверенность: high | medium | low',
      'линзы: API — да/нет · поведение — да/нет · стили — да/нет   (high = минимум 2 «да»)',
      'обоснование: <2–3 предложения, только по фактам из этого файла>',
      'план: <3–5 шагов; если уверенность low — без кода, только шаги проверки>',
    ].join('\n'),
  ),
].join('\n')

export const buildDeepPackMarkdown = (input: {
  component: CustomComponent
  finding: Finding | null
  cards: KitCardsArtifact
  /** Full source of the component's file; `null` degrades to the stored snippet. */
  sourceText: string | null
}): string => {
  const { component, finding, cards } = input

  const cardByName = new Map(cards.cards.map((card) => [card.name, card]))
  const candidates = (finding?.candidates ?? []).slice(0, MAX_CANDIDATES)

  const renderSource = (maxLines: number): string => {
    const text = input.sourceText ?? component.snippet
    const lines = text.split('\n')
    const shown = lines.slice(0, maxLines)
    const truncated = lines.length > shown.length
    return [
      `### Исходник (${component.file}${truncated ? `, первые ${String(shown.length)} строк из ${String(lines.length)}` : ''})`,
      codeFence('tsx', shown.join('\n')),
    ].join('\n')
  }

  const candidateSections =
    candidates.length === 0
      ? [
          '## Кандидаты из кита',
          'Статический скоринг не нашёл похожего компонента. Твоя задача — проверить по каталогу T0 ниже,',
          'что аналога действительно нет, и решить: это кандидат в дизайн-систему или локальная деталь.',
        ].join('\n')
      : [
          '## Кандидаты из кита (по статическому скорингу)',
          ...candidates.map((candidate, index) => {
            const card = cardByName.get(candidate.component)
            const score = Math.round(candidate.score * 100) / 100
            return card === undefined
              ? `### Кандидат ${String(index + 1)}: ${candidate.component} · score ${String(score)} (карточка не найдена)`
              : cardSection(card, index, score, candidate.reasons)
          }),
        ].join('\n\n')

  const catalogue = ['## Каталог кита (T0, весь)', ...cards.cards.map((card) => `- ${card.t0}`)].join('\n')

  const build = (sourceLines: number): string =>
    [
      `# Разбор кастомного компонента: ${component.name}`,
      '',
      'Ты — ревьюер дизайн-системы sds-eng. По материалам НИЖЕ (и только по ним) реши, чем должен стать',
      'этот кастомный компонент. Не выдумывай пропы, которых нет в карточках.',
      '',
      '## Компонент проекта',
      `- Объявлен: ${component.file}:${String(component.line)}`,
      `- Использований: ${String(component.usages)} в ${String(component.files)} файлах`,
      `- Токены: ${TOKEN_VERDICT_LABEL[component.tokenVerdict]} (var() — ${String(component.tokenRefs)}, хардкод — ${String(component.hardcodedValues)})`,
      component.props.length > 0 ? `- Пропы: ${component.props.join(', ')}` : '- Пропы: нет',
      component.kitComponentsUsed.length > 0 ? `- Уже использует кит: ${component.kitComponentsUsed.join(', ')}` : null,
      finding !== null ? `- Вердикт статического анализа: ${finding.rule} — ${finding.why}` : null,
      '',
      renderSource(sourceLines),
      '',
      candidateSections,
      '',
      catalogue,
      '',
      ANSWER_TEMPLATE,
    ]
      .filter((line): line is string => line !== null)
      .join('\n')

  const full = build(MAX_SOURCE_LINES)
  return full.length > PACK_CHAR_BUDGET ? build(REDUCED_SOURCE_LINES) : full
}

/** `OrderDialog` at src/dialogs/OrderDialog.tsx → `OrderDialog.md`; collisions get a suffix. */
export const packNameFor = (component: CustomComponent, taken: Set<string>): string => {
  const base = component.name.replace(/[^\p{L}\p{N}_-]/gu, '_')
  let name = `${base}.md`
  let suffix = 2
  while (taken.has(name)) {
    name = `${base}-${String(suffix)}.md`
    suffix += 1
  }
  taken.add(name)
  return name
}
