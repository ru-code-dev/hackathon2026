import { describe, expect, it } from 'vitest'

import { resolvePaths } from '../../config.js'
import type { Declaration, JsxElement, Observations, StyleValue } from '../../domain/observations.js'
import { OBSERVATIONS_SCHEMA_ID } from '../../domain/observations.js'
import type { KitA11yArtifact } from '../../domain/kit-a11y.js'
import type { ProjectProfile } from '../../domain/profile.js'
import { A11ySpec } from '../../kit/a11y-spec.js'
import { KitSpec } from '../../kit/spec.js'
import { buildSpacingIndex } from '../context.js'
import type { Rule, RuleContext } from '../types.js'
import { invalidAriaRule, redundantRoleRule, requiredAriaRule } from './aria.js'
import { textContrastRule } from './contrast.js'
import { dialogFocusRule } from './dialog.js'
import { missingAccessibleNameRule } from './name.js'
import { ariaRelationsRule } from './relations.js'

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
  hasTextChild: false,
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
    files: ['src/Widget.tsx'],
    limitations: [],
    ...extra,
  }

  const context: RuleContext = {
    kit,
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

  it('reports an icon-only button', () => {
    const findings = run([element({ name: 'button' })])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('empty')
  })

  it('accepts a button with visible text', () => {
    expect(run([element({ name: 'button', hasTextChild: true })])).toHaveLength(0)
  })

  it('accepts any of the naming attributes', () => {
    expect(run([element({ name: 'button', props: { 'aria-label': 'Закрыть' } })])).toHaveLength(0)
    expect(run([element({ name: 'button', props: { title: 'Закрыть' } })])).toHaveLength(0)
  })

  it('does not let text stand in for a name on a role that cannot take one', () => {
    // `tabpanel` names itself from `aria-labelledby` only. Telling its author to add text
    // would be advice that cannot work, so the message differs too.
    const findings = run([element({ name: 'div', props: { role: 'tabpanel' }, hasTextChild: true })])

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('unlabelled')
    expect(findings[0]?.why).toContain('aria-labelledby')
  })

  it('says nothing about roles that need no name', () => {
    expect(run([element({ name: 'div' })])).toHaveLength(0)
    expect(run([element({ name: 'span', props: { role: 'presentation' } })])).toHaveLength(0)
  })

  it('leaves custom components alone, since their labelling is internal', () => {
    expect(run([element({ name: 'IconButton', props: { icon: 'close' } })])).toHaveLength(0)
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
