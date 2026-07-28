import { describe, expect, it } from 'vitest'

import { collectCssInJs, cssInJsTagInfo } from './css-in-js.js'

const collect = (parts: string[], startLine = 10, startColumn = 20) =>
  collectCssInJs({
    file: 'src/x.tsx',
    parts: parts.map((text) => ({ text })),
    startLine,
    startColumn,
    selectorName: 'Card',
    source: 'styled-components',
  })

describe('collectCssInJs', () => {
  it('reads declarations out of a template', () => {
    const result = collect(['\n  background: #ff1f78;\n  padding: 13px;\n'])

    expect(result.styleValues.map((value) => `${value.property}: ${value.value}`)).toEqual([
      'background: #ff1f78',
      'padding: 13px',
    ])
  })

  it('maps template lines back to file lines', () => {
    // The backtick sits on line 10, so the template's own line 2 is the file's line 11.
    const result = collect(['\n  background: #ff1f78;\n'])

    expect(result.styleValues[0]?.line).toBe(11)
  })

  it('offsets columns only on the line the backtick shares', () => {
    const first = collect(['background: #ff1f78;'], 10, 20)
    const later = collect(['\n  background: #ff1f78;\n'], 10, 20)

    expect(first.styleValues[0]?.column).toBe(21)
    expect(later.styleValues[0]?.column).toBe(3)
  })

  it('keeps the literal part of an interpolated value and marks it dynamic', () => {
    const result = collect(['\n  padding: ', 'px 4px;\n'])
    const declaration = result.styleValues[0]

    expect(declaration?.dynamic).toBe(true)
    expect(declaration?.property).toBe('padding')
    expect(result.limitations).toHaveLength(1)
    expect(result.limitations[0]?.reason).toBe('dynamic-styles')
  })

  it('records a wholly interpolated value as a limitation and nothing else', () => {
    const result = collect(['\n  background: ', ';\n'])

    expect(result.styleValues[0]?.value).toBe('')
    expect(result.styleValues[0]?.dynamic).toBe(true)
  })

  it('handles nested state selectors the way styled-components writes them', () => {
    const result = collect(['\n  color: #262626;\n  &:hover { opacity: 0.9; }\n'])

    expect(result.styleValues.map((value) => [value.selector, value.property])).toEqual([
      ['Card', 'color'],
      ['&:hover', 'opacity'],
    ])
  })

  it('reports !important', () => {
    const result = collect(['\n  color: #262626 !important;\n'])

    expect(result.styleValues[0]?.important).toBe(true)
  })

  it('reports a malformed template rather than throwing', () => {
    const result = collect(['\n  color: {{{ ;\n'])

    expect(result.limitations.length + result.styleValues.length).toBeGreaterThan(0)
  })
})

describe('cssInJsTagInfo', () => {
  it('recognises the host-element form', () => {
    expect(cssInJsTagInfo('styled.div')).toEqual({ isCssInJs: true, wraps: null, hostTag: 'div' })
  })

  it('recognises a wrapped component, which is the hidden-fork case', () => {
    expect(cssInJsTagInfo('styled(Button)')).toEqual({ isCssInJs: true, wraps: 'Button', hostTag: null })
  })

  it('recognises attrs chains', () => {
    expect(cssInJsTagInfo("styled.button.attrs({ type: 'button' })").isCssInJs).toBe(true)
  })

  it('recognises emotion’s bare css tag', () => {
    expect(cssInJsTagInfo('css').isCssInJs).toBe(true)
  })

  it('rejects unrelated tags', () => {
    expect(cssInJsTagInfo('gql').isCssInJs).toBe(false)
    expect(cssInJsTagInfo('String.raw').isCssInJs).toBe(false)
  })
})
