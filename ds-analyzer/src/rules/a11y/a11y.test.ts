import { describe, expect, it } from 'vitest'

import { resolvePaths } from '../../config.js'
import type { JsxElement, Observations, StyleValue } from '../../domain/observations.js'
import { OBSERVATIONS_SCHEMA_ID } from '../../domain/observations.js'
import type { KitA11yArtifact } from '../../domain/kit-a11y.js'
import type { ProjectProfile } from '../../domain/profile.js'
import { A11ySpec } from '../../kit/a11y-spec.js'
import { IconSpec } from '../../kit/icon-spec.js'
import { KitSpec } from '../../kit/spec.js'
import { buildSpacingIndex } from '../context.js'
import type { RuleContext } from '../types.js'
import { suppressedFocusRule } from './focus.js'
import { patternKeyboardRule } from './pattern-keyboard.js'

/**
 * The accessibility rules in isolation.
 *
 * What these pin is not "the rule fires" but the two judgement calls that decide whether
 * the report is worth reading: when the rule stays quiet, and what it offers instead.
 */

const kit = KitSpec.load(resolvePaths().artifactsDir)

const a11yArtifact = (patterns: KitA11yArtifact['patterns']): KitA11yArtifact => ({
  $schema: 'ds-analyzer/kit-a11y@1',
  meta: { upstreamVersion: '1.23.0', packagesScanned: 2, upstreamAvailable: true },
  patterns,
  spacing: { steps: [], offGridSteps: [], totalDeclarations: 0, coverage: 0, gridBase: 4, gridCoverage: 0 },
  diagnostics: [],
})

const tabsPattern: KitA11yArtifact['patterns'][number] = {
  component: 'Tabs',
  packages: ['@v-uik/tabs'],
  matchedBy: 'wraps',
  roles: ['tab', 'tablist'],
  ariaAttributes: ['aria-selected'],
  keysHandled: ['ArrowLeft', 'ArrowRight'],
  managesFocus: true,
}

const browserTabsPattern: KitA11yArtifact['patterns'][number] = {
  ...tabsPattern,
  component: 'BrowserTabs',
  packages: ['@v-uik/browser-tabs'],
}

const styleValue = (overrides: Partial<StyleValue> & Pick<StyleValue, 'property' | 'value'>): StyleValue => ({
  authored: null,
  file: 'src/a.scss',
  line: 4,
  column: 3,
  source: 'scss',
  selector: '.a',
  classNames: ['a'],
  important: false,
  dynamic: false,
  rootCause: null,
  appliedTo: null,
  ...overrides,
})

const jsxElement = (overrides: Partial<JsxElement> & Pick<JsxElement, 'name'>): JsxElement => ({
  resolvedFrom: null,
  kitComponent: null,
  props: {},
  propExpressions: {},
  eventHandlers: [],
  keysHandled: [],
  content: { text: false, expression: false, component: false },
  hasLabelAncestor: false,
  propLines: {},
  styleRefs: [],
  hasInlineStyle: false,
  file: 'src/Widget.tsx',
  line: 10,
  column: 5,
  ...overrides,
})

const profile: ProjectProfile = {
  $schema: 'ds-analyzer/project-profile@1',
  root: '/tmp/x',
  scope: '',
  name: 'x',
  packageManager: 'unknown',
  monorepo: { detected: false, workspaces: [] },
  tsconfigs: [],
  aliases: [],
  kitSources: [{ specifier: '@sds-eng/base', kind: 'package', via: [], names: [] }],
  kitVersion: null,
  usesKit: true,
  styleSyntaxes: ['scss'],
  files: { scanned: 1, ignored: 0, unparseable: 0, byExtension: {} },
  limitations: [],
}

const contextFor = (extra: Partial<Observations>, a11y: A11ySpec = A11ySpec.from(a11yArtifact([tabsPattern]))) => {
  const observations: Observations = {
    $schema: OBSERVATIONS_SCHEMA_ID,
    styleValues: [],
    jsxElements: [],
    imports: [],
    reExports: [],
    declarations: [],
    lintMessages: [],
    files: ['src/a.scss'],
    limitations: [],
    ...extra,
  }

  return {
    kit,
    icons: IconSpec.unavailable(),
    svg: () => null,
    a11y,
    profile,
    observations,
    sources: new Map(),
    spacing: buildSpacingIndex(observations.styleValues),
    elementsByFile: new Map(),
  } satisfies RuleContext
}

describe('a11y.focus.suppressed', () => {
  const run = (values: readonly StyleValue[]) => suppressedFocusRule.run(contextFor({ styleValues: [...values] }))

  it('reports a focus ring removed with nothing put back', () => {
    const findings = run([styleValue({ property: 'outline', value: 'none' })])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.a11y?.wcag).toStrictEqual(['2.4.7'])
  })

  it('accepts the reset when the same file draws a :focus-visible ring', () => {
    // Punishing this would penalise exactly the teams that replaced the default ring with
    // a designed one, which is the correct thing to do.
    const findings = run([
      styleValue({ property: 'outline', value: 'none' }),
      styleValue({ property: 'outline', value: '2px solid #2969e3', selector: '.a:focus-visible' }),
    ])

    expect(findings).toHaveLength(0)
  })

  it('still reports a removal aimed at :focus itself, however the file ends', () => {
    const findings = run([
      styleValue({ property: 'outline', value: 'none', selector: '.a:focus' }),
      styleValue({ property: 'outline', value: '2px solid #2969e3', selector: '.a:focus-visible' }),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('onFocus')
  })

  it('accepts a JSS state class drawing its own indicator', () => {
    // The kit styles focus as `&$focused`, not `:focus`. Recognising only the pseudo-class
    // reported nine of the kit's own components.
    const findings = run([
      styleValue({ property: 'outline', value: 'none', selector: '& input' }),
      styleValue({ property: 'box-shadow', value: '0 0 0 2px #2969e3', selector: '&$focused' }),
    ])

    expect(findings).toHaveLength(0)
  })

  it('accepts a data attribute or utility class naming the state', () => {
    for (const selector of ['[data-focused]', '.is-focused', '&:focus-within']) {
      expect(
        run([
          styleValue({ property: 'outline', value: 'none' }),
          styleValue({ property: 'border-color', value: '#2969e3', selector }),
        ]),
      ).toHaveLength(0)
    }
  })

  it('still reports a focus block that removes the ring and draws nothing', () => {
    const findings = run([styleValue({ property: 'outline', value: 'none', selector: '&$focused' })])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('onFocus')
  })

  it('says nothing about an outline that is actually drawn', () => {
    expect(run([styleValue({ property: 'outline', value: '2px solid #2969e3' })])).toHaveLength(0)
    expect(run([styleValue({ property: 'outline-color', value: '#00d4aa' })])).toHaveLength(0)
  })

  it('skips values it could not read', () => {
    expect(run([styleValue({ property: 'outline', value: 'none', dynamic: true })])).toHaveLength(0)
  })

  it('judges every stylesheet dialect, modules included', () => {
    // The project's target stack is `scss-modules`, and an inclusion list that named only
    // `scss` silenced the rule on exactly the code it was written for.
    for (const source of [
      'css',
      'css-modules',
      'scss',
      'scss-modules',
      'less',
      'styled-components',
      'emotion',
    ] as const) {
      expect(run([styleValue({ property: 'outline', value: 'none', source })])).toHaveLength(1)
    }
  })

  it('refuses to judge an object style, where nesting is flattened away', () => {
    // JSS states arrive as `selector: 'useStyles'` with the `focused` key gone, so absence
    // of focus styling cannot be established. Silence here is a declared gap, not a pass.
    for (const source of ['inline-style', 'jss', 'ts-literal'] as const) {
      expect(run([styleValue({ property: 'outline', value: 'none', source, selector: 'useStyles' })])).toHaveLength(0)
    }

    const values = [styleValue({ property: 'outline', value: 'none', source: 'inline-style', selector: 'useStyles' })]

    const limitations = suppressedFocusRule.limitations?.(contextFor({ styleValues: values }))

    expect(limitations).toHaveLength(1)
    expect(limitations?.[0]?.reason).toBe('unsupported-syntax')
  })
})

describe('a11y.pattern.keyboard', () => {
  const run = (elements: readonly JsxElement[], a11y?: A11ySpec) =>
    patternKeyboardRule.run(contextFor({ jsxElements: [...elements] }, a11y))

  const tablist = (overrides: Partial<JsxElement> = {}) =>
    jsxElement({ name: 'div', props: { role: 'tablist' }, propLines: { role: 12 }, ...overrides })

  it('reports a hand-rolled widget that listens for nothing', () => {
    const findings = run([tablist()])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('noHandler')
    expect(findings[0]?.severity).toBe('error')
    expect(findings[0]?.a11y?.wcag).toStrictEqual(['2.1.1'])
    expect(findings[0]?.why).toContain('ArrowLeft, ArrowRight')
    expect(findings[0]?.line).toBe(12)
  })

  it('stays quiet when the widget handles keys itself', () => {
    expect(run([tablist({ eventHandlers: ['onKeyDown'], keysHandled: ['ArrowLeft', 'ArrowRight'] })])).toHaveLength(0)
  })

  it('downgrades rather than guesses when the handler body is elsewhere', () => {
    // `onKeyDown={handleKey}` is unreadable, not absent. Reporting it at full confidence
    // would be a guess wearing a fact's clothes — this is the distinction `observations@2`
    // exists to preserve.
    const findings = run([tablist({ eventHandlers: ['onKeyDown'] })])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('handlerUnreadable')
    expect(findings[0]?.severity).toBe('warning')
    expect(findings[0]?.confidence).toBeLessThan(0.75)
    expect(findings[0]?.needsAgent).toBe(true)
  })

  it('offers the canonical component, not the specialised one', () => {
    // Both render `tablist`; alphabetical order would hand the reader `BrowserTabs`. The
    // same trap catches `Modal` vs `DatePicker` for `dialog`, which is why the choice lives
    // in `A11ySpec` and not in either rule.
    const findings = run([tablist()], A11ySpec.from(a11yArtifact([browserTabsPattern, tabsPattern])))

    expect(findings[0]?.expected?.component).toBe('Tabs')
    expect(findings[0]?.candidates.map((candidate) => candidate.component)).toStrictEqual(['BrowserTabs', 'Tabs'])
  })

  it('agrees with A11ySpec about which component is canonical', () => {
    const spec = A11ySpec.from(a11yArtifact([browserTabsPattern, tabsPattern]))

    expect(spec.canonicalComponentFor('tablist')?.component).toBe('Tabs')
    expect(spec.canonicalComponentFor('nothing-renders-this')).toBeNull()
  })

  it('leaves the kit’s own components alone', () => {
    expect(run([tablist({ name: 'Tabs', kitComponent: 'Tabs' })])).toHaveLength(0)
  })

  it('says nothing about roles that carry no keyboard contract', () => {
    // A dialog needs Escape and a focus trap, but not key handling on the container — a
    // dialog whose buttons are real buttons is navigable already.
    expect(run([jsxElement({ name: 'div', props: { role: 'dialog' } })])).toHaveLength(0)
  })

  it('declares what it could not check when the upstream was never read', () => {
    // The rule going quiet is correct; going quiet *invisibly* is not. Without this the
    // reader sees an empty accessibility section and concludes the widgets are fine.
    const observations: Observations = {
      $schema: OBSERVATIONS_SCHEMA_ID,
      styleValues: [],
      jsxElements: [tablist()],
      imports: [],
      reExports: [],
      declarations: [],
      lintMessages: [],
      files: ['src/Widget.tsx'],
      limitations: [],
    }

    const limitations = patternKeyboardRule.limitations?.({
      kit,
      icons: IconSpec.unavailable(),
      svg: () => null,
      a11y: A11ySpec.unavailable(),
      profile,
      observations,
      sources: new Map(),
      spacing: buildSpacingIndex([]),
      elementsByFile: new Map(),
    })

    expect(limitations).toHaveLength(1)
    expect(limitations?.[0]?.reason).toBe('spec-unavailable')
  })

  it('reports nothing at all when the upstream was never read', () => {
    // Not because the code is clean — because it was not checked. The claim this rule makes
    // is "the kit's equivalent does this"; with no evidence there is no claim to make.
    expect(run([tablist()], A11ySpec.unavailable())).toHaveLength(0)
  })
})
