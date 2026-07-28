import { Project, ts } from 'ts-morph'
import { describe, expect, it } from 'vitest'

import { collectTypeScript } from './typescript.js'

/**
 * The three JSX fields the accessibility rules read (`observations@2`).
 *
 * They are collected here rather than derived later because the collectors are the only
 * stage allowed to touch syntax: a rule that re-parsed a handler to find out which keys it
 * names would put syntax back below the boundary the whole pipeline is built around.
 */

const collect = (code: string) => {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      allowJs: true,
      noResolve: true,
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.Latest,
    },
  })

  return collectTypeScript({
    file: 'src/Widget.tsx',
    content: code,
    project,
    resolveModule: () => ({ kind: 'unresolved', file: null }),
  })
}

const elementNamed = (code: string, name: string) => collect(code).jsxElements.find((element) => element.name === name)

describe('JSX accessibility signals', () => {
  it('records which event handlers an element carries', () => {
    const element = elementNamed(
      `export const W = () => <button onClick={handleClick} onKeyDown={handleKey} className="x" />`,
      'button',
    )

    expect(element?.eventHandlers).toStrictEqual(['onClick', 'onKeyDown'])
  })

  it('does not mistake a regular prop for a handler', () => {
    // `only` and `once` start with "on" but are not handlers; the capital letter is the
    // whole convention, and matching a bare `on` prefix would poison the signal.
    const element = elementNamed(`export const W = () => <div only="x" once="y" onBlur={f} />`, 'div')

    expect(element?.eventHandlers).toStrictEqual(['onBlur'])
  })

  it('reads key names out of an inline handler whatever comparison form is used', () => {
    const element = elementNamed(
      `export const W = () => (
         <div
           role="tablist"
           onKeyDown={(event) => {
             if (event.key === 'ArrowRight') next()
             if (['ArrowLeft', 'Home'].includes(event.key)) previous()
             switch (event.key) {
               case 'End':
                 last()
             }
           }}
         />
       )`,
      'div',
    )

    expect(element?.keysHandled).toStrictEqual(['ArrowLeft', 'ArrowRight', 'End', 'Home'])
  })

  it('ignores strings in a handler that are not key names', () => {
    const element = elementNamed(
      `export const W = () => <div onKeyDown={() => track('tab-changed', 'ArrowRight')} />`,
      'div',
    )

    // `ArrowRight` still counts — it is named, and the rule only needs to know that much.
    // `tab-changed` must not, or every analytics call becomes noise.
    expect(element?.keysHandled).toStrictEqual(['ArrowRight'])
  })

  it('leaves keysHandled empty when the handler body lives elsewhere', () => {
    // This is the ambiguity the schema documents: a handler is present but unreadable.
    // Recording it as "no keys" would let a rule report a keyboard failure that may not
    // exist, so the pair (handler present, no keys) has to stay distinguishable.
    const element = elementNamed(`export const W = () => <div role="tablist" onKeyDown={handleKey} />`, 'div')

    expect(element?.eventHandlers).toStrictEqual(['onKeyDown'])
    expect(element?.keysHandled).toStrictEqual([])
  })

  it('keeps the source text of a prop it cannot reduce to a literal', () => {
    const element = elementNamed(
      'export const W = () => <div id={`panel-${item.id}`} aria-controls={`panel-${item.id}`} role="tabpanel" />',
      'div',
    )

    expect(element?.props['role']).toBe('tabpanel')
    expect(element?.props['aria-controls']).toBeNull()
    // Same expression on both attributes — which is what makes the relation checkable
    // without evaluating anything.
    expect(element?.propExpressions['aria-controls']).toBe('`panel-${item.id}`')
    expect(element?.propExpressions['id']).toBe('`panel-${item.id}`')
  })

  it('holds the invariant that propExpressions covers exactly the unreduced props', () => {
    const result = collect(
      `export const W = ({ open, onClose, items }) => (
         <Modal open={open} title="Заказ" aria-modal onClose={onClose} width={640}>
           {items.map((item) => (
             <Row key={item.id} label={item.label} selected={item.id === current} data-x="1" />
           ))}
         </Modal>
       )`,
    )

    expect(result.jsxElements.length).toBeGreaterThan(0)

    for (const element of result.jsxElements) {
      const unreduced = Object.entries(element.props)
        .filter(([, value]) => value === null)
        .map(([key]) => key)
        .sort()

      expect(Object.keys(element.propExpressions).sort()).toStrictEqual(unreduced)
    }
  })

  it('treats a bare attribute as true rather than as an expression', () => {
    const element = elementNamed(`export const W = () => <div aria-modal role="dialog" />`, 'div')

    expect(element?.props['aria-modal']).toBe('true')
    expect(element?.propExpressions['aria-modal']).toBeUndefined()
  })
})
