import { describe, expect, it } from 'vitest'

import { createSourceFile, testLocate } from '../testing/source.js'

import { findVariantSets } from './variants.js'

const extract = (code: string) =>
  findVariantSets([createSourceFile('components/Button/constants.ts', code)], testLocate)

describe('findVariantSets', () => {
  it('reads the kit convention of mapping public keys to internal values', () => {
    const [variant] = extract(`
      export const views = {
        primary: 'primary',
        secondary: 'secondary',
        negative: 'error',
      } as const
    `)

    expect(variant).toMatchObject({
      name: 'views',
      kind: 'constObject',
      keys: ['primary', 'secondary', 'negative'],
      values: { primary: 'primary', secondary: 'secondary', negative: 'error' },
      deprecatedKeys: [],
    })
  })

  it('records numeric and boolean values', () => {
    const [variant] = extract(`export const TagInputIconSize = { xs: 16, sm: 20, on: true } as const`)

    expect(variant?.values).toEqual({ xs: 16, sm: 20, on: true })
  })

  it('keeps keys of nested objects even though they have no scalar value', () => {
    const [variant] = extract(`
      export const ButtonIconSize = {
        xxs: { size: 'xxs' },
        xs: { size: 'sm' },
      } as const
    `)

    expect(variant?.keys).toEqual(['xxs', 'xs'])
    expect(variant?.values).toEqual({})
  })

  it('flags deprecated keys, including the misspelled tag', () => {
    const [variant] = extract(`
      export const TagInputElementSize = {
        xs: 'xs',
        /**
         * @depreated Размер \`lg\` больше не поддерживается.
         */
        lg: 'lg',
      } as const
    `)

    expect(variant?.deprecatedKeys).toEqual(['lg'])
  })

  it('unquotes string-literal keys', () => {
    const [variant] = extract(`export const map = { 'shadow-on': 'a' } as const`)

    expect(variant?.keys).toEqual(['shadow-on'])
  })

  it('reads negative numeric values', () => {
    const [variant] = extract(`export const offsets = { up: -4 } as const`)

    expect(variant?.values).toEqual({ up: -4 })
  })

  it('reads string-literal union type aliases', () => {
    const [variant] = extract(`export type Size = 'sm' | 'md' | 'lg'`)

    expect(variant).toMatchObject({ name: 'Size', kind: 'literalUnion', keys: ['sm', 'md', 'lg'], values: {} })
  })

  it('ignores unions that are not purely string literals', () => {
    expect(extract(`export type Mixed = 'sm' | number`)).toEqual([])
  })

  it('ignores objects without `as const`', () => {
    expect(extract(`export const views = { primary: 'primary' }`)).toEqual([])
  })

  it('ignores non-exported declarations', () => {
    expect(extract(`const views = { primary: 'primary' } as const`)).toEqual([])
  })

  it('ignores empty objects', () => {
    expect(extract(`export const empty = {} as const`)).toEqual([])
  })

  it('records the declaration location and sorts by name', () => {
    const variants = extract(`
      export const zeta = { a: 'a' } as const
      export const alpha = { b: 'b' } as const
    `)

    expect(variants.map((variant) => variant.name)).toEqual(['alpha', 'zeta'])
    expect(variants[0]?.location.file).toBe('packages/base/src/components/Button/constants.ts')
  })
})
