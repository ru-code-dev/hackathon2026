import { describe, expect, it } from 'vitest'

import { collectLeaves, getByPath, groupBy, isLeaf, isPlainRecord } from './object.js'

describe('isPlainRecord', () => {
  it('accepts object literals only', () => {
    expect(isPlainRecord({})).toBe(true)
    expect(isPlainRecord([])).toBe(false)
    expect(isPlainRecord(null)).toBe(false)
    expect(isPlainRecord('x')).toBe(false)
    expect(isPlainRecord(undefined)).toBe(false)
  })
})

describe('isLeaf', () => {
  it('accepts JSON primitives including null', () => {
    expect(isLeaf('x')).toBe(true)
    expect(isLeaf(0)).toBe(true)
    expect(isLeaf(false)).toBe(true)
    expect(isLeaf(null)).toBe(true)
    expect(isLeaf({})).toBe(false)
    expect(isLeaf(undefined)).toBe(false)
  })
})

describe('collectLeaves', () => {
  it('walks nested records depth-first with full paths', () => {
    expect(collectLeaves({ a: { b: 1, c: 'x' }, d: true })).toEqual([
      { path: ['a', 'b'], value: 1 },
      { path: ['a', 'c'], value: 'x' },
      { path: ['d'], value: true },
    ])
  })

  it('indexes array items so none are lost', () => {
    expect(collectLeaves({ shadows: ['a', 'b'] })).toEqual([
      { path: ['shadows', '0'], value: 'a' },
      { path: ['shadows', '1'], value: 'b' },
    ])
  })

  it('records unrepresentable values as null leaves rather than dropping them', () => {
    const leaves = collectLeaves({ fn: () => undefined, missing: undefined })
    expect(leaves).toEqual([
      { path: ['fn'], value: null },
      { path: ['missing'], value: null },
    ])
  })

  it('honours a base path', () => {
    expect(collectLeaves({ a: 1 }, ['root'])).toEqual([{ path: ['root', 'a'], value: 1 }])
  })

  it('treats a primitive root as a single leaf', () => {
    expect(collectLeaves('x')).toEqual([{ path: [], value: 'x' }])
  })

  it('returns an empty list for an empty object', () => {
    expect(collectLeaves({})).toEqual([])
  })
})

describe('getByPath', () => {
  const tree = { a: { b: { c: 42 } } }

  it('reads a nested value', () => {
    expect(getByPath(tree, ['a', 'b', 'c'])).toBe(42)
  })

  it('returns the root for an empty path', () => {
    expect(getByPath(tree, [])).toBe(tree)
  })

  it('returns undefined for a missing or non-traversable path', () => {
    expect(getByPath(tree, ['a', 'x'])).toBeUndefined()
    expect(getByPath(tree, ['a', 'b', 'c', 'd'])).toBeUndefined()
    expect(getByPath(null, ['a'])).toBeUndefined()
  })
})

describe('groupBy', () => {
  it('groups preserving insertion order inside each bucket', () => {
    const grouped = groupBy(['apple', 'avocado', 'banana'], (word) => word[0] ?? '')

    expect([...grouped.keys()]).toEqual(['a', 'b'])
    expect(grouped.get('a')).toEqual(['apple', 'avocado'])
  })

  it('returns an empty map for no items', () => {
    expect(groupBy([], () => 'k').size).toBe(0)
  })
})
