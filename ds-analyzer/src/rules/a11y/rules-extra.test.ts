import { describe, expect, it } from 'vitest'

import { resolvePaths } from '../../config.js'
import type { Declaration, JsxElement, Observations, StyleValue } from '../../domain/observations.js'
import { OBSERVATIONS_SCHEMA_ID } from '../../domain/observations.js'
import type { KitA11yArtifact } from '../../domain/kit-a11y.js'
import type { ProjectProfile } from '../../domain/profile.js'
import { A11ySpec } from '../../kit/a11y-spec.js'
import { IconSpec } from '../../kit/icon-spec.js'
import { KnowledgeSpec } from '../../kit/knowledge-spec.js'
import { KitSpec } from '../../kit/spec.js'
import { buildSpacingIndex } from '../context.js'
import type { Rule, RuleContext } from '../types.js'
import { invalidAriaRule, redundantRoleRule, requiredAriaRule } from './aria.js'
import { textContrastRule } from './contrast.js'
import { dialogFocusRule } from './dialog.js'
import { missingAccessibleNameRule } from './name.js'
import { ariaRelationsRule } from './relations.js'
import { jsxA11yLintRule } from './lint.js'

/**
 * The remaining accessibility rules.
 *
 * Each block pins both halves of the decision: the case the rule must catch, and the
 * lookalike it must leave alone. The second half is the one that decides whether a report
 * gets read twice — a rule that fires on correct code costs more than one that misses.
 */

const kit = KitSpec.load(resolvePaths().artifactsDir)

const dialogSpec = A11ySpec.from({
  $schema: 'ds-analyzer/kit-a11y@1',
  meta: { upstreamVersion: '1.23.0', packagesScanned: 1, upstreamAvailable: true },
  patterns: [
    {
      component: 'Modal',
      packages: ['@v-uik/modal'],
      matchedBy: 'name',
      roles: ['dialog'],
      ariaAttributes: ['aria-labelledby'],
      keysHandled: ['Escape'],
      managesFocus: true,
    },
  ],
  spacing: { steps: [], offGridSteps: [], totalDeclarations: 0, coverage: 0, gridBase: 4, gridCoverage: 0 },
  diagnostics: [],
} satisfies KitA11yArtifact)

const element = (overrides: Partial<JsxElement> & Pick<JsxElement, 'name'>): JsxElement => ({
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

const declaration = (overrides: Partial<Declaration> & Pick<Declaration, 'name'>): Declaration => ({
  kind: 'component',
  props: [],
  ariaRoles: [],
  ariaAttributes: [],
  nativeTags: [],
  jsxShape: [],
  kitComponentsUsed: [],
  cssProperties: [],
  hasInlineSvg: false,
  eventHandlers: [],
  keysHandled: [],
  astSignature: [],
  elementCount: 1,
  file: 'src/Widget.tsx',
  line: 1,
  column: 1,
  ...overrides,
})

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

const runRule = (rule: Rule, extra: Partial<Observations>, a11y: A11ySpec = dialogSpec) => {
  const observations: Observations = {
    $schema: OBSERVATIONS_SCHEMA_ID,
    styleValues: [],
    jsxElements: [],
    imports: [],
    reExports: [],
    declarations: [],
    lintMessages: [],
    files: ['src/Widget.tsx'],
    limitations: [],
    ...extra,
  }

  const context: RuleContext = {
    kit,
    icons: IconSpec.unavailable(),
    knowledge: KnowledgeSpec.unavailable(),
    svg: () => null,
    a11y,
    profile,
    observations,
    sources: new Map(),
    spacing: buildSpacingIndex(observations.styleValues),
    elementsByFile: new Map(),
  }

  return rule.run(context)
}

describe('a11y.aria.invalid', () => {
  const run = (elements: readonly JsxElement[]) => runRule(invalidAriaRule, { jsxElements: [...elements] })

  it('reports a role that does not exist', () => {
    const findings = run([element({ name: 'div', props: { role: 'buton' } })])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('unknownRole')
  })

  it('reports an abstract role, which markup may never name', () => {
    expect(run([element({ name: 'div', props: { role: 'widget' } })])[0]?.subkind).toBe('abstractRole')
  })

  it('reports a misspelled aria attribute', () => {
    // `aria-labeledby` — one `l` short, silently ignored by every browser.
    const findings = run([element({ name: 'div', props: { 'aria-labeledby': 'x' } })])

    expect(findings[0]?.subkind).toBe('unknownAttribute')
  })

  it('reports an attribute the role does not support', () => {
    expect(run([element({ name: 'div', props: { role: 'tab', 'aria-valuenow': '3' } })])[0]?.subkind).toBe(
      'unsupportedAttribute',
    )
  })

  it('accepts a global attribute on any role', () => {
    expect(run([element({ name: 'div', props: { role: 'tab', 'aria-hidden': 'true' } })])).toHaveLength(0)
  })

  it('accepts valid markup', () => {
    expect(run([element({ name: 'div', props: { role: 'tab', 'aria-selected': 'true' } })])).toHaveLength(0)
  })

  it('says nothing about attributes when the role is unknown to it', () => {
    // A custom component may forward `role` anywhere; judging support against a role we
    // could not resolve would be inventing a contract.
    expect(run([element({ name: 'MyThing', props: { 'aria-valuenow': '3' } })])).toHaveLength(0)
  })
})

describe('a11y.aria.required', () => {
  const run = (elements: readonly JsxElement[]) => runRule(requiredAriaRule, { jsxElements: [...elements] })

  it('reports a checkbox with no checked state to announce', () => {
    const findings = run([element({ name: 'div', props: { role: 'checkbox' } })])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.why).toContain('aria-checked')
  })

  it('accepts the same role once the state is there', () => {
    expect(run([element({ name: 'div', props: { role: 'checkbox', 'aria-checked': 'false' } })])).toHaveLength(0)
  })

  it('leaves the kit’s own components to the kit', () => {
    expect(run([element({ name: 'Checkbox', kitComponent: 'Checkbox', props: { role: 'checkbox' } })])).toHaveLength(0)
  })
})

describe('a11y.aria.redundant', () => {
  const run = (elements: readonly JsxElement[]) => runRule(redundantRoleRule, { jsxElements: [...elements] })

  it('reports a role the tag already has', () => {
    expect(run([element({ name: 'button', props: { role: 'button' } })])).toHaveLength(1)
  })

  it('says nothing when the role changes what the tag means', () => {
    expect(run([element({ name: 'div', props: { role: 'button' } })])).toHaveLength(0)
    expect(run([element({ name: 'button', props: { role: 'tab' } })])).toHaveLength(0)
  })
})

describe('a11y.pattern.relations', () => {
  const run = (elements: readonly JsxElement[]) => runRule(ariaRelationsRule, { jsxElements: [...elements] })

  it('reports a reference to an id nothing carries', () => {
    const findings = run([element({ name: 'button', props: { 'aria-controls': 'panel-missing' } })])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('danglingId')
  })

  it('accepts a reference that resolves in the same file', () => {
    expect(
      run([
        element({ name: 'button', props: { 'aria-controls': 'panel-1' } }),
        element({ name: 'div', props: { id: 'panel-1' } }),
      ]),
    ).toHaveLength(0)
  })

  it('accepts an id built from the same expression on both sides', () => {
    // The case the collector's `propExpressions` field exists for: neither value is
    // knowable, but the relation is still verifiable.
    expect(
      run([
        element({ name: 'button', propExpressions: { 'aria-controls': '`panel-${item.id}`' } }),
        element({ name: 'div', propExpressions: { id: '`panel-${item.id}`' } }),
      ]),
    ).toHaveLength(0)
  })

  it('ignores formatting differences between the two expressions', () => {
    expect(
      run([
        element({ name: 'button', propExpressions: { 'aria-controls': '`panel-${ item.id }`' } }),
        element({ name: 'div', propExpressions: { id: '`panel-${item.id}`' } }),
      ]),
    ).toHaveLength(0)
  })

  it('downgrades an expression that matches nothing, rather than asserting', () => {
    const findings = run([element({ name: 'button', propExpressions: { 'aria-controls': '`panel-${other}`' } })])

    expect(findings[0]?.subkind).toBe('unmatchedExpression')
    expect(findings[0]?.severity).toBe('warning')
    expect(findings[0]?.needsAgent).toBe(true)
  })

  it('requires every id in a list to exist', () => {
    expect(
      run([
        element({ name: 'div', props: { 'aria-labelledby': 'a b' } }),
        element({ name: 'span', props: { id: 'a' } }),
      ]),
    ).toHaveLength(1)
  })

  it('accepts an id handed to a component through a prop object', () => {
    // `<Popover dropdownProps={{ id: 'popover-1' }}>` renders the id inside the component.
    // It is plainly in the file, so claiming the reference dangles would be wrong.
    expect(
      run([
        element({ name: 'Popover', propExpressions: { dropdownProps: "{ id: 'popover-1', action }" } }),
        element({ name: 'button', props: { 'aria-describedby': 'popover-1' } }),
      ]),
    ).toHaveLength(0)
  })

  it('leaves kit components alone, since they wire ids internally', () => {
    expect(
      run([element({ name: 'Modal', kitComponent: 'Modal', props: { 'aria-labelledby': 'nowhere' } })]),
    ).toHaveLength(0)
  })
})

describe('a11y.pattern.focus', () => {
  const run = (elements: readonly JsxElement[], declarations: readonly Declaration[]) =>
    runRule(dialogFocusRule, { jsxElements: [...elements], declarations: [...declarations] })

  const dialogElement = element({ name: 'div', props: { role: 'dialog', 'aria-modal': 'true' }, line: 20 })

  it('reports a dialog that handles neither Escape nor focus', () => {
    const findings = run([dialogElement], [declaration({ name: 'OrderDialog', line: 5 })])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('noEscape')
    expect(findings[0]?.a11y?.pattern).toBe('dialog-modal')
    expect(findings[0]?.expected?.component).toBe('Modal')
  })

  it('blames the declaration, not the element, so the fix has one home', () => {
    const findings = run([dialogElement], [declaration({ name: 'OrderDialog', line: 5 })])

    expect(findings[0]?.rootCause).toStrictEqual({ file: 'src/Widget.tsx', line: 5, name: 'OrderDialog' })
  })

  it('accepts a dialog that closes on Escape and moves focus', () => {
    expect(
      run(
        [dialogElement],
        [declaration({ name: 'OrderDialog', line: 5, keysHandled: ['Escape'], eventHandlers: ['onFocus'] })],
      ),
    ).toHaveLength(0)
  })

  it('still reports a dialog that closes but never traps focus', () => {
    const findings = run([dialogElement], [declaration({ name: 'OrderDialog', line: 5, keysHandled: ['Escape'] })])

    expect(findings[0]?.subkind).toBe('noFocusTrap')
  })

  it('reports one finding per component, not per element', () => {
    const findings = run(
      [dialogElement, { ...dialogElement, line: 30 }],
      [declaration({ name: 'OrderDialog', line: 5 })],
    )

    expect(findings).toHaveLength(1)
  })

  it('leaves the kit’s own dialog alone', () => {
    expect(
      run(
        [element({ name: 'Modal', kitComponent: 'Modal', props: { role: 'dialog' }, line: 20 })],
        [declaration({ name: 'Page', line: 5 })],
      ),
    ).toHaveLength(0)
  })
})

describe('a11y.name.missing', () => {
  const run = (elements: readonly JsxElement[]) => runRule(missingAccessibleNameRule, { jsxElements: [...elements] })

  const named = (element: JsxElement) => run([element]).length === 0

  describe('reports only what it can prove has no name', () => {
    it('an icon-only button', () => {
      const findings = run([element({ name: 'button' })])

      expect(findings).toHaveLength(1)
      expect(findings[0]?.subkind).toBe('iconOnly')
    })

    it('a button holding nothing but a glyph', () => {
      expect(
        run([element({ name: 'button', content: { text: false, expression: false, component: false } })]),
      ).toHaveLength(1)
    })

    it('an input with no label anywhere', () => {
      expect(run([element({ name: 'textarea' })])).toHaveLength(1)
    })

    it('a tabpanel with content but no label', () => {
      // `tabpanel` takes no name from its contents, so text does not save it.
      const findings = run([
        element({
          name: 'div',
          props: { role: 'tabpanel' },
          content: { text: true, expression: false, component: false },
        }),
      ])

      expect(findings).toHaveLength(1)
      expect(findings[0]?.subkind).toBe('unlabelled')
    })
  })

  describe('accepts every name source the syntax shows', () => {
    it('direct text', () => {
      expect(named(element({ name: 'button', content: { text: true, expression: false, component: false } }))).toBe(
        true,
      )
    })

    it('aria-label, title, alt and placeholder', () => {
      for (const attribute of ['aria-label', 'title', 'alt', 'placeholder']) {
        expect(named(element({ name: 'button', props: { [attribute]: 'Закрыть' } }))).toBe(true)
      }
    })

    it('aria-labelledby', () => {
      expect(named(element({ name: 'div', props: { role: 'tabpanel', 'aria-labelledby': 'tab-1' } }))).toBe(true)
    })

    it('an enclosing <label>', () => {
      expect(named(element({ name: 'textarea', hasLabelAncestor: true }))).toBe(true)
    })

    it('a <label htmlFor> pointing at it from the same file', () => {
      expect(
        run([
          element({ name: 'label', props: { htmlFor: 'body' } }),
          element({ name: 'textarea', props: { id: 'body' } }),
        ]),
      ).toHaveLength(0)
    })

    it('the legacy `for` spelling', () => {
      expect(
        run([
          element({ name: 'label', props: { for: 'body' } }),
          element({ name: 'input', props: { id: 'body', role: 'textbox' } }),
        ]),
      ).toHaveLength(0)
    })
  })

  describe('stays silent where the name is undecidable', () => {
    it('an expression child, which usually renders text', () => {
      expect(named(element({ name: 'button', content: { text: false, expression: true, component: false } }))).toBe(
        true,
      )
    })

    it('a child component that is not a recognisable icon', () => {
      expect(named(element({ name: 'button', content: { text: false, expression: false, component: true } }))).toBe(
        true,
      )
    })

    it('a label in another file — not visible, not guessed at', () => {
      expect(
        run([element({ name: 'textarea', props: { id: 'body' }, file: 'src/Other.tsx' })]).map((f) => f.file),
      ).toStrictEqual(['src/Other.tsx'])
      // …but a label for that id in the *same* file silences it, which is the pair above.
    })
  })

  describe('leaves alone what it has no business judging', () => {
    it('roles that need no name', () => {
      expect(named(element({ name: 'div' }))).toBe(true)
      expect(named(element({ name: 'span', props: { role: 'presentation' } }))).toBe(true)
    })

    it('custom components, which may label themselves internally', () => {
      expect(named(element({ name: 'IconButton', props: { icon: 'close' } }))).toBe(true)
    })

    it('the kit’s own components', () => {
      expect(named(element({ name: 'Button', kitComponent: 'Button' }))).toBe(true)
    })
  })
})

describe('a11y.contrast.text', () => {
  const run = (values: readonly StyleValue[]) => runRule(textContrastRule, { styleValues: [...values] })

  it('reports white text on the demo project’s teal', () => {
    const findings = run([
      styleValue({ property: 'color', value: '#ffffff' }),
      styleValue({ property: 'background', value: '#00d4aa' }),
      styleValue({ property: 'font-size', value: '15px' }),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.why).toContain('1.90:1')
    expect(findings[0]?.a11y?.wcag).toStrictEqual(['1.4.3'])
  })

  it('accepts a pair that carries', () => {
    expect(
      run([
        styleValue({ property: 'color', value: '#000000' }),
        styleValue({ property: 'background', value: '#ffffff' }),
      ]),
    ).toHaveLength(0)
  })

  it('resolves colours written as kit custom properties', () => {
    // A project doing the right thing everywhere must not become exempt from the check.
    const findings = run([
      styleValue({ property: 'color', value: 'var(--sds-eng-Background-backBase)' }),
      styleValue({ property: 'background', value: 'var(--sds-eng-Background-backBase)' }),
    ])

    expect(findings).toHaveLength(1)
  })

  it('says nothing when only one half of the pair is in the block', () => {
    // The background could be anything; assuming white manufactures failures on dark themes.
    expect(run([styleValue({ property: 'color', value: '#777777' })])).toHaveLength(0)
  })

  it('does not pair declarations from different blocks', () => {
    expect(
      run([
        styleValue({ property: 'color', value: '#ffffff', selector: '.a' }),
        styleValue({ property: 'background', value: '#00d4aa', selector: '.b' }),
      ]),
    ).toHaveLength(0)
  })

  it('skips values it could not read', () => {
    expect(
      run([
        styleValue({ property: 'color', value: '#ffffff', dynamic: true }),
        styleValue({ property: 'background', value: '#00d4aa' }),
      ]),
    ).toHaveLength(0)
  })
})

describe('a11y.lint', () => {
  const run = (messages: { rule: string; message: string; line?: number }[]) =>
    runRule(jsxA11yLintRule, {
      lintMessages: messages.map((entry) => ({
        rule: entry.rule,
        message: entry.message,
        file: 'src/Widget.tsx',
        line: entry.line ?? 3,
        column: 5,
      })),
    })

  it('carries the plugin’s rule name as the subkind, so it can be looked up', () => {
    const findings = run([{ rule: 'alt-text', message: 'img elements must have an alt prop' }])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.rule).toBe('a11y.lint')
    expect(findings[0]?.subkind).toBe('alt-text')
  })

  it('grades by rule rather than taking the linter’s single level', () => {
    // A missing `alt` is a certainty; a click handler on a div is sometimes deliberate.
    // One severity for both is how a report earns the reputation that gets it switched off.
    const [alt] = run([{ rule: 'alt-text', message: 'x' }])
    const [click] = run([{ rule: 'click-events-have-key-events', message: 'x' }])
    const [prefer] = run([{ rule: 'prefer-tag-over-role', message: 'x' }])

    expect(alt?.severity).toBe('error')
    expect(click?.severity).toBe('warning')
    expect(prefer?.severity).toBe('info')
  })

  it('attaches the WCAG criterion and a consequence', () => {
    const [finding] = run([{ rule: 'alt-text', message: 'x' }])

    expect(finding?.a11y?.wcag).toStrictEqual(['1.1.1'])
    expect(finding?.a11y?.impact.length ?? 0).toBeGreaterThan(0)
  })

  it('still reports a rule it has not classified yet', () => {
    // A plugin upgrade adding a rule must not make it vanish silently.
    const [finding] = run([{ rule: 'some-future-rule', message: 'x' }])

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe('info')
    expect(finding?.a11y?.wcag).toStrictEqual([])
  })

  it('groups occurrences of one rule together', () => {
    const findings = run([
      { rule: 'alt-text', message: 'x', line: 3 },
      { rule: 'alt-text', message: 'x', line: 9 },
    ])

    expect(new Set(findings.map((finding) => finding.impactKey)).size).toBe(1)
  })
})
