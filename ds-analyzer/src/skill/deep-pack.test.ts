import { describe, expect, it } from 'vitest'

import type { KitCardsArtifact } from '../domain/kit-knowledge.js'
import { buildDeepPackMarkdown, packNameFor, rankForDeepAnalysis } from './deep-pack.js'
import { customComponent, finding, usage } from './fixtures.js'

/**
 * A pack is the entire world of one AI verdict: everything must be inside, nothing may
 * require the model to open another file, and the size must respect the prompt budget.
 */

const cards: KitCardsArtifact = {
  $schema: 'ds-analyzer/kit-cards@1',
  meta: { counts: { components: 2, examples: 3 } },
  cards: [
    {
      name: 'Button',
      t0: 'Button — кнопка действия; варианты kind/size; слот children.',
      t1: {
        import: "import { Button } from '@sds/base'",
        props: [
          { name: 'kind', type: 'string', values: ['contained', 'outlined'], doc: 'вид кнопки' },
          { name: 'size', type: 'string', values: ['sm', 'md', 'lg'], doc: null },
        ],
        variants: { kind: ['contained', 'outlined'] },
        slots: ['children'],
        subcomponents: [],
        wraps: [],
        examples: ['Basic', 'WithIcon'],
      },
    },
    {
      name: 'Modal',
      t0: 'Modal — модальный диалог; управляет фокусом; onClose.',
      t1: {
        import: "import { Modal } from '@sds/base'",
        props: [{ name: 'onClose', type: '() => void', values: [], doc: null }],
        variants: {},
        slots: ['children'],
        subcomponents: [],
        wraps: [],
        examples: ['Basic'],
      },
    },
  ],
}

describe('buildDeepPackMarkdown', () => {
  const component = customComponent({ name: 'MyButton', file: 'src/MyButton.tsx', line: 5 })
  const componentFinding = finding({
    file: 'src/MyButton.tsx',
    line: 5,
    rule: 'component.custom',
    actual: 'MyButton',
    autoFixable: false,
    candidates: [{ component: 'Button', score: 0.87, reasons: ['совпадение имени'] }],
  })

  it('contains the source, the candidate card, the full T0 catalogue and the answer template', () => {
    const markdown = buildDeepPackMarkdown({
      component,
      finding: componentFinding,
      cards,
      sourceText: 'export const MyButton = () => <button/>',
    })
    expect(markdown).toContain('MyButton')
    expect(markdown).toContain('Кандидат 1: Button · score 0.87')
    expect(markdown).toContain('`kind`')
    expect(markdown).toContain('Modal — модальный диалог')
    expect(markdown).toContain('Шаблон ответа')
    expect(markdown).toContain('вердикт: заменить на')
  })

  it('says explicitly when the scorer found no candidates', () => {
    const markdown = buildDeepPackMarkdown({ component, finding: null, cards, sourceText: 'const a = 1' })
    expect(markdown).toContain('Статический скоринг не нашёл похожего компонента')
  })

  it('cuts the source harder when the pack blows the prompt budget', () => {
    const hugeSource = Array.from(
      { length: 3_000 },
      (_, index) => `const line${String(index)} = '${'x'.repeat(190)}'`,
    ).join('\n')
    const markdown = buildDeepPackMarkdown({ component, finding: componentFinding, cards, sourceText: hugeSource })
    expect(markdown).toContain('первые 60 строк')
    expect(markdown.length).toBeLessThan(30_000)
  })

  it('degrades to the stored snippet when the source file is unreadable', () => {
    const markdown = buildDeepPackMarkdown({ component, finding: null, cards, sourceText: null })
    expect(markdown).toContain(component.snippet)
  })
})

describe('rankForDeepAnalysis', () => {
  it('puts a scored component above a more-used unscored one', () => {
    const scored = customComponent({ name: 'MyButton', file: 'src/MyButton.tsx', line: 5, usages: 2 })
    const popular = customComponent({ name: 'Helper', file: 'src/Helper.tsx', line: 1, usages: 50 })
    const ranked = rankForDeepAnalysis(usage({ customComponents: [popular, scored] }), [
      finding({
        file: 'src/MyButton.tsx',
        line: 5,
        rule: 'component.custom',
        actual: 'MyButton',
        autoFixable: false,
        candidates: [{ component: 'Button', score: 0.9, reasons: [] }],
      }),
    ])
    expect(ranked.map((entry) => entry.component.name)).toEqual(['MyButton', 'Helper'])
  })
})

describe('packNameFor', () => {
  it('keeps names unique across duplicate component names', () => {
    const taken = new Set<string>()
    const first = packNameFor(customComponent({ name: 'Card', file: 'a.tsx' }), taken)
    const second = packNameFor(customComponent({ name: 'Card', file: 'b.tsx' }), taken)
    expect(first).toBe('Card.md')
    expect(second).toBe('Card-2.md')
  })
})
