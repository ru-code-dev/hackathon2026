import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ArtifactValidationError } from '../shared/errors.js'

import { validateArtifact } from './validate.js'

const schema = z.object({
  name: z.string().min(1),
  count: z.number().int(),
  nested: z.object({ flag: z.boolean() }),
})

describe('validateArtifact', () => {
  it('returns the parsed value on success', () => {
    const value = { name: 'a', count: 1, nested: { flag: true } }

    expect(validateArtifact(schema, value, 'test')).toEqual(value)
  })

  it('throws ArtifactValidationError with path-qualified issues', () => {
    expect(() => validateArtifact(schema, { name: '', count: 1.5, nested: {} }, 'tokens artifact')).toThrow(
      ArtifactValidationError,
    )

    try {
      validateArtifact(schema, { name: '', count: 1.5, nested: {} }, 'tokens artifact')
    } catch (error) {
      const validationError = error as ArtifactValidationError
      expect(validationError.message).toContain('tokens artifact')
      expect(validationError.issues.some((issue) => issue.startsWith('name:'))).toBe(true)
      expect(validationError.issues.some((issue) => issue.startsWith('nested.flag:'))).toBe(true)
    }
  })

  it('caps the reported issue list but states the true total', () => {
    const wideSchema = z.object(Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`f${index}`, z.string()])))

    try {
      validateArtifact(wideSchema, {}, 'wide')
    } catch (error) {
      const validationError = error as ArtifactValidationError
      expect(validationError.message).toContain('40 issue(s)')
      expect(validationError.issues.at(-1)).toContain('and 15 more')
    }
  })

  it('labels a root-level failure as <root>', () => {
    try {
      validateArtifact(z.string(), 42, 'scalar')
    } catch (error) {
      expect((error as ArtifactValidationError).issues[0]).toContain('<root>')
    }
  })
})
