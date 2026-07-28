import { describe, expect, it } from 'vitest'

import { isBlank, signatureOf, splitIdentifierWords } from './string.js'

describe('splitIdentifierWords', () => {
  it('splits camelCase and PascalCase', () => {
    expect(splitIdentifierWords('colorBackground')).toEqual(['color', 'background'])
    expect(splitIdentifierWords('ButtonIconSize')).toEqual(['button', 'icon', 'size'])
  })

  it('splits acronym boundaries', () => {
    expect(splitIdentifierWords('HTMLElement')).toEqual(['html', 'element'])
    expect(splitIdentifierWords('DNUComponent')).toEqual(['dnu', 'component'])
  })

  it('separates digit runs into their own words', () => {
    expect(splitIdentifierWords('gray900')).toEqual(['gray', '900'])
    expect(splitIdentifierWords('lh20')).toEqual(['lh', '20'])
    expect(splitIdentifierWords('backBase1')).toEqual(['back', 'base', '1'])
  })

  it('normalises other separators', () => {
    expect(splitIdentifierWords('shadow-on')).toEqual(['shadow', 'on'])
    expect(splitIdentifierWords('some_key.path')).toEqual(['some', 'key', 'path'])
  })

  it('returns an empty list for empty or separator-only input', () => {
    expect(splitIdentifierWords('')).toEqual([])
    expect(splitIdentifierWords('---')).toEqual([])
  })

  it('lowercases every word', () => {
    expect(splitIdentifierWords('FOO')).toEqual(['foo'])
  })
})

describe('isBlank', () => {
  it('treats whitespace-only strings as blank', () => {
    expect(isBlank('')).toBe(true)
    expect(isBlank('  \n ')).toBe(true)
    expect(isBlank(' x ')).toBe(false)
  })
})

describe('signatureOf', () => {
  it('is order-insensitive and de-duplicating', () => {
    expect(signatureOf(['b', 'a', 'b'])).toBe('a|b')
    expect(signatureOf(['a', 'b'])).toBe(signatureOf(['b', 'a']))
  })

  it('is empty for no values', () => {
    expect(signatureOf([])).toBe('')
  })
})
