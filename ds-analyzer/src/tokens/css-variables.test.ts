import { describe, expect, it } from 'vitest'

import { isQuotedCssValue, toCssVariableName, toCssVariableReference } from './css-variables.js'

describe('toCssVariableName', () => {
  it('omits the tier name, matching createCssVariables.ts which unwraps the tier first', () => {
    expect(toCssVariableName('ref', ['palette', 'pink', 'pink500'])).toBe('--sds-eng-palette-pink-pink500')
    expect(toCssVariableName('sys', ['Background', 'backAccent'])).toBe('--sds-eng-Background-backAccent')
  })

  it('preserves the original casing of path segments', () => {
    expect(toCssVariableName('sys', ['ForegroundConst', 'foreConstPrimary'])).toBe(
      '--sds-eng-ForegroundConst-foreConstPrimary',
    )
  })

  it('returns null for the comp tier, which is never emitted as CSS', () => {
    expect(toCssVariableName('comp', ['button', 'colorBackgroundContainedPrimary'])).toBeNull()
  })

  it('returns null for an empty path', () => {
    expect(toCssVariableName('ref', [])).toBeNull()
  })
})

describe('isQuotedCssValue', () => {
  it('is true only when the leaf key is exactly fontFamily', () => {
    expect(isQuotedCssValue(['Typography', 'Text', 'TextMN', 'fontFamily'])).toBe(true)
    expect(isQuotedCssValue(['fontFamilies', 'text'])).toBe(false)
    expect(isQuotedCssValue(['fontFamily', 'brand'])).toBe(false)
    expect(isQuotedCssValue([])).toBe(false)
  })
})

describe('toCssVariableReference', () => {
  it('wraps a variable name in var()', () => {
    expect(toCssVariableReference('--sds-eng-palette-pink-pink500')).toBe('var(--sds-eng-palette-pink-pink500)')
  })
})
