import { type Node, Project, SyntaxKind, ts } from 'ts-morph'
import { describe, expect, it } from 'vitest'

import { collectStyleObject } from './style-object.js'

const objectFrom = (code: string): Node => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, noResolve: true },
  })
  const sourceFile = project.createSourceFile('/x.tsx', code)
  const object = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression)

  if (!object) {
    throw new Error('fixture contains no object literal')
  }

  return object
}

const collect = (code: string) =>
  collectStyleObject({
    file: 'src/x.tsx',
    object: objectFrom(code),
    source: 'inline-style',
    selector: 'div',
    classNames: [],
  })

const pairs = (code: string) => collect(code).styleValues.map((value) => `${value.property}: ${value.value}`)

describe('collectStyleObject', () => {
  it('converts camelCase keys to CSS spelling', () => {
    expect(pairs("const s = { backgroundColor: '#ff1f78' }")).toEqual(['background-color: #ff1f78'])
  })

  it('appends px to a bare number, as React does', () => {
    expect(pairs('const s = { padding: 21 }')).toEqual(['padding: 21px'])
  })

  it('leaves unitless properties unitless', () => {
    expect(pairs('const s = { fontWeight: 500, opacity: 0.9, zIndex: 10, lineHeight: 1.5 }')).toEqual([
      'font-weight: 500',
      'opacity: 0.9',
      'z-index: 10',
      'line-height: 1.5',
    ])
  })

  it('leaves a zero alone, since 0px and 0 are the same decision', () => {
    expect(pairs('const s = { margin: 0 }')).toEqual(['margin: 0'])
  })

  it('handles a negative number', () => {
    expect(pairs('const s = { marginTop: -4 }')).toEqual(['margin-top: -4px'])
  })

  it('walks both branches of a conditional, each of which is a real decision', () => {
    expect(pairs("const s = { borderBottom: on ? '2px solid #2969e3' : 'none' }")).toEqual([
      'border-bottom: 2px solid #2969e3',
      'border-bottom: none',
    ])
  })

  it('takes the authored default from a nullish or logical fallback', () => {
    expect(pairs("const s = { color: theme ?? '#262626' }")).toEqual(['color: #262626'])
  })

  it('records a computed value as dynamic instead of dropping it', () => {
    const result = collect('const s = { background: compute(props) }')

    expect(result.styleValues).toEqual([])
    expect(result.dynamicProperties).toEqual([{ property: 'background', line: 1 }])
  })

  it('descends into nested rule objects, attributing them to their key', () => {
    const result = collect("const s = { root: { color: '#262626' }, '&:hover': { color: '#ff1f78' } }")

    expect(result.styleValues.map((value) => [value.selector, value.property, value.value])).toEqual([
      ['root', 'color', '#262626'],
      ['&:hover', 'color', '#ff1f78'],
    ])
  })

  it('treats a nested rule key as a class but leaves state selectors on the parent class', () => {
    const result = collectStyleObject({
      file: 'src/x.ts',
      object: objectFrom("const s = { card: { '&:hover': { color: '#fff' } } }"),
      source: 'jss',
      selector: null,
      classNames: [],
    })

    expect(result.styleValues[0]?.classNames).toEqual(['card'])
  })

  it('ignores spreads, which carry no literal of their own', () => {
    expect(pairs("const s = { ...base, color: '#262626' }")).toEqual(['color: #262626'])
  })

  it('reads quoted keys', () => {
    expect(pairs("const s = { 'font-size': '15px' }")).toEqual(['font-size: 15px'])
  })

  it('records coordinates on the value, not the key', () => {
    const result = collect('const s = {\n  padding: 21,\n}')

    expect(result.styleValues[0]?.line).toBe(2)
  })
})
