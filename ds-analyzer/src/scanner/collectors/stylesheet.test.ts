import { describe, expect, it } from 'vitest'

import { classNamesInSelector, collectStylesheet, styleSyntaxOf } from './stylesheet.js'

const collect = (file: string, content: string) => collectStylesheet({ file, content, variables: null })

const pairs = (file: string, content: string) =>
  collect(file, content).styleValues.map((value) => `${value.selector ?? '-'} ${value.property}: ${value.value}`)

describe('styleSyntaxOf', () => {
  it('distinguishes modules from global stylesheets', () => {
    expect(styleSyntaxOf('a/b.module.scss')).toBe('scss-modules')
    expect(styleSyntaxOf('a/b.scss')).toBe('scss')
    expect(styleSyntaxOf('a/b.module.css')).toBe('css-modules')
    expect(styleSyntaxOf('a/b.css')).toBe('css')
    expect(styleSyntaxOf('a/b.less')).toBe('less')
  })
})

describe('classNamesInSelector', () => {
  it('reads every class in a compound selector', () => {
    expect(classNamesInSelector('.card .title')).toEqual(['card', 'title'])
  })

  it('attributes a state selector to the class it decorates', () => {
    expect(classNamesInSelector('.close:hover')).toEqual(['close'])
  })

  it('ignores classes that only appear inside a pseudo-class argument', () => {
    expect(classNamesInSelector('.item:not(.active)')).toEqual(['item'])
  })

  it('returns nothing for a bare element selector', () => {
    expect(classNamesInSelector('button')).toEqual([])
  })
})

describe('collectStylesheet', () => {
  it('parses SCSS comments that plain CSS would reject', () => {
    const result = collect('a.scss', '// a comment\n.card { color: #262626; }')

    expect(result.limitations).toEqual([])
    expect(result.styleValues).toHaveLength(1)
  })

  it('collects declarations inside at-rules', () => {
    // A hard-coded colour behind a breakpoint is still a hard-coded colour.
    expect(pairs('a.css', '@media (min-width: 900px) { .card { background: #ff1f78; } }')).toEqual([
      '.card background: #ff1f78',
    ])
  })

  it('records coordinates', () => {
    const result = collect('a.css', '.card {\n  color: #262626;\n}')

    expect(result.styleValues[0]?.line).toBe(2)
    expect(result.styleValues[0]?.column).toBe(3)
  })

  it('reports !important', () => {
    const result = collect('a.css', '.card { color: #262626 !important; }')

    expect(result.styleValues[0]?.important).toBe(true)
  })

  it('skips variable declarations, which are reported through their usages', () => {
    expect(pairs('a.scss', '$brand: #ff1f78;\n:root { --x: 1px; }\n.card { color: $brand; }')).toEqual([
      '.card color: $brand',
    ])
  })

  it('marks an unresolvable Sass value as dynamic and records the limitation', () => {
    const result = collect('a.scss', '.card { color: darken($brand, 10%); }')

    expect(result.styleValues[0]?.dynamic).toBe(true)
    expect(result.limitations[0]?.reason).toBe('dynamic-styles')
  })

  it('turns a malformed stylesheet into a limitation instead of an exception', () => {
    const result = collect('a.css', '.card { color: ')

    expect(result.styleValues).toEqual([])
    expect(result.limitations[0]?.reason).toBe('parse-error')
  })

  it('lower-cases property names so rules can match on one spelling', () => {
    expect(pairs('a.css', '.card { COLOR: #262626; }')).toEqual(['.card color: #262626'])
  })
})
