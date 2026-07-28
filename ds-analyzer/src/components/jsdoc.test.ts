import { describe, expect, it } from 'vitest'

import { createSourceFile } from '../testing/source.js'

import { EMPTY_DOC, readDoc } from './jsdoc.js'

const firstInterfaceMember = (code: string) =>
  createSourceFile('components/X/types.ts', code).getInterfaces()[0]?.getMembers()[0]

const firstVariableDeclaration = (code: string) =>
  createSourceFile('components/X/X.ts', code).getVariableDeclarations()[0]

describe('readDoc', () => {
  it('returns the empty doc for undefined and undocumented nodes', () => {
    expect(readDoc(undefined)).toEqual(EMPTY_DOC)
    expect(readDoc(firstVariableDeclaration('export const a = 1'))).toEqual(EMPTY_DOC)
  })

  it('reads the description of a documented member', () => {
    const doc = readDoc(
      firstInterfaceMember(`
        export interface P {
          /** Размер поля */
          size?: string
        }
      `),
    )

    expect(doc.text).toBe('Размер поля')
    expect(doc.deprecated).toBe(false)
    expect(doc.inner).toBe(false)
  })

  it('reads JSDoc from the variable statement, not just the declaration', () => {
    const doc = readDoc(
      firstVariableDeclaration(`
        /** Набор размеров. */
        export const sizes = { sm: 'sm' }
      `),
    )

    expect(doc.text).toBe('Набор размеров.')
  })

  it('detects @deprecated and captures its note', () => {
    const doc = readDoc(
      firstInterfaceMember(`
        export interface P {
          /**
           * @deprecated Свойство не актуально
           */
          fullWidth?: boolean
        }
      `),
    )

    expect(doc.deprecated).toBe(true)
    expect(doc.deprecationNote).toBe('Свойство не актуально')
  })

  it('detects the misspelled @depreated tag the kit contains', () => {
    const doc = readDoc(
      firstInterfaceMember(`
        export interface P {
          /**
           * @depreated Размер \`lg\` больше не поддерживается.
           */
          lg?: string
        }
      `),
    )

    expect(doc.deprecated).toBe(true)
  })

  it('detects @inner, which marks internal-only API', () => {
    const doc = readDoc(
      firstInterfaceMember(`
        export interface P {
          /**
           * Стиль, применяемый к спиннеру.
           *
           * @inner
           */
          spinner?: string
        }
      `),
    )

    expect(doc.inner).toBe(true)
    expect(doc.text).toBe('Стиль, применяемый к спиннеру.')
  })

  it('treats a tag-only comment as having no description', () => {
    const doc = readDoc(
      firstInterfaceMember(`
        export interface P {
          /** @deprecated */
          x?: string
        }
      `),
    )

    expect(doc.text).toBeNull()
    expect(doc.deprecated).toBe(true)
    expect(doc.deprecationNote).toBeNull()
  })
})
