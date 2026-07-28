import { describe, expect, it } from 'vitest'

import type { Declaration } from '../../domain/observations.js'
import type { KitSignature } from '../../domain/kit-knowledge.js'
import { kitApiCoverage, namesIdentical, scoreAgainst } from './score.js'

/**
 * The scoring boundaries the verdicts hang on. Each test pins one judgement call that a
 * wrong answer turned into a real false positive during calibration — these are the
 * regressions, encoded.
 */

const declaration = (overrides: Partial<Declaration>): Declaration => ({
  name: 'Widget',
  kind: 'component',
  props: [],
  ariaRoles: [],
  ariaAttributes: [],
  nativeTags: [],
  jsxShape: [],
  kitComponentsUsed: [],
  cssProperties: [],
  hasInlineSvg: false,
  astSignature: [],
  eventHandlers: [],
  keysHandled: [],
  elementCount: 3,
  file: 'src/Widget.tsx',
  line: 1,
  column: 1,
  ...overrides,
})

const signature = (overrides: Partial<KitSignature>): KitSignature => ({
  name: 'Modal',
  propSignature: [],
  propWeights: {},
  ariaRoles: [],
  ariaAttributes: [],
  nativeTags: [],
  domShape: [],
  cssProperties: [],
  astSignature: [],
  synonyms: ['Dialog', 'Popup'],
  subcomponents: [],
  wraps: [],
  ...overrides,
})

describe('scoreAgainst', () => {
  it('combines name and ARIA evidence into a custom-grade score', () => {
    const result = scoreAgainst(
      declaration({
        name: 'OrderDialog',
        ariaRoles: ['dialog'],
        ariaAttributes: ['aria-modal'],
        props: ['open', 'onClose'],
      }),
      signature({ ariaRoles: ['dialog'], ariaAttributes: ['aria-modal', 'aria-labelledby'] }),
      null,
      null,
    )

    expect(result.score).toBeGreaterThanOrEqual(0.6)
    expect(result.parts.map((part) => part.heuristic)).toEqual(['name', 'aria'])
  })

  it('ignores generic ARIA — a shared aria-label matched a dialog to a pagination', () => {
    const result = scoreAgainst(
      declaration({ ariaAttributes: ['aria-label'] }),
      signature({ name: 'Pagination', synonyms: [], ariaAttributes: ['aria-label'] }),
      null,
      null,
    )

    expect(result.parts.some((part) => part.heuristic === 'aria')).toBe(false)
  })

  it('requires two shared props — `size` alone matched a spinner to a form label', () => {
    const one = scoreAgainst(
      declaration({ props: ['size'] }),
      signature({ name: 'LabelControl', synonyms: [], propSignature: ['size'], propWeights: { size: 0.5 } }),
      null,
      null,
    )
    const two = scoreAgainst(
      declaration({ name: 'MyButton', props: ['size', 'view', 'onClick'] }),
      signature({
        name: 'Button',
        synonyms: [],
        propSignature: ['size', 'view', 'classes'],
        propWeights: { size: 0.5, view: 2.1, classes: 0.05 },
      }),
      null,
      null,
    )

    expect(one.parts.some((part) => part.heuristic === 'props')).toBe(false)
    expect(two.parts.some((part) => part.heuristic === 'props')).toBe(true)
    expect(two.score).toBeGreaterThanOrEqual(0.6)
  })

  it('ignores generic and svg-gut tags — div overlap scored 0.6 on its own', () => {
    const result = scoreAgainst(
      declaration({ nativeTags: ['div', 'svg', 'path'] }),
      signature({ name: 'FileUploader', synonyms: [], nativeTags: ['div', 'svg', 'path'] }),
      null,
      null,
    )

    expect(result.parts).toHaveLength(0)
    expect(result.score).toBe(0)
  })

  it('strips name noise: MyButton is Button, OldCard is Card', () => {
    expect(namesIdentical('MyButton', signature({ name: 'Button', synonyms: [] }))).toBe(true)
    expect(namesIdentical('OldCard', signature({ name: 'Card', synonyms: [] }))).toBe(true)
    expect(namesIdentical('OrderCard', signature({ name: 'Card', synonyms: [] }))).toBe(false)
  })
})

describe('kitApiCoverage', () => {
  it('measures how much of the kit API the local component reproduces', () => {
    const result = kitApiCoverage(
      declaration({ props: ['accent', 'classes', 'draggable', 'elevation', 'header'] }),
      signature({
        name: 'Card',
        propSignature: ['accent', 'classes', 'draggable', 'elevation'],
        propWeights: { accent: 2.9, classes: 0.05, draggable: 2.9, elevation: 2.9 },
      }),
    )

    expect(result.coverage).toBe(1)
    expect(result.shared).toEqual(['accent', 'classes', 'draggable', 'elevation'])
  })
})
