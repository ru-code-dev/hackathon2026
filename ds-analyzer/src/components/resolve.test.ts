import { describe, expect, it } from 'vitest'

import { classifySpecifier, toPackageName } from './resolve.js'

describe('classifySpecifier', () => {
  it('recognises relative specifiers', () => {
    expect(classifySpecifier('./Button')).toBe('relative')
    expect(classifySpecifier('../shared/types')).toBe('relative')
    expect(classifySpecifier('/abs/path')).toBe('relative')
  })

  it('recognises the @src path alias', () => {
    expect(classifySpecifier('@src/shared/constants')).toBe('alias')
  })

  it('treats everything else as an external package', () => {
    expect(classifySpecifier('@v-uik/base')).toBe('external')
    expect(classifySpecifier('react')).toBe('external')
    // A scoped package that merely starts with `@` is not the alias.
    expect(classifySpecifier('@sds-eng/theme')).toBe('external')
  })
})

describe('toPackageName', () => {
  it('keeps both segments of a scoped package', () => {
    expect(toPackageName('@v-uik/base')).toBe('@v-uik/base')
    expect(toPackageName('@v-uik/base/dist/esm/index.js')).toBe('@v-uik/base')
  })

  it('keeps the first segment of an unscoped package', () => {
    expect(toPackageName('react')).toBe('react')
    expect(toPackageName('react-dom/client')).toBe('react-dom')
  })
})
