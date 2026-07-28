import { describe, expect, it } from 'vitest'

import { IgnoreMatcher, parseIgnoreFile } from './ignore.js'

describe('parseIgnoreFile', () => {
  it('drops comments and blank lines', () => {
    expect(parseIgnoreFile('# comment\n\ndist\n  node_modules  \n')).toEqual(['dist', 'node_modules'])
  })
})

describe('IgnoreMatcher', () => {
  it('excludes build output and dependencies whatever the project says', () => {
    const matcher = IgnoreMatcher.create()

    expect(matcher.ignores('node_modules', true)).toBe(true)
    expect(matcher.ignores('dist', true)).toBe(true)
    expect(matcher.ignores('src/types.d.ts', false)).toBe(true)
    expect(matcher.ignores('src/vendor.min.js', false)).toBe(true)
  })

  it('does not exclude ordinary source', () => {
    const matcher = IgnoreMatcher.create()

    expect(matcher.ignores('src/App.tsx', false)).toBe(false)
    expect(matcher.ignores('src/features', true)).toBe(false)
  })

  it('excludes its own output directory, so a rerun does not audit the last report', () => {
    expect(IgnoreMatcher.create().ignores('ui-analyzer', true)).toBe(true)
  })

  it('applies extra patterns from the caller', () => {
    const matcher = IgnoreMatcher.create(['**/*.generated.tsx'])

    expect(matcher.ignores('src/api/Client.generated.tsx', false)).toBe(true)
  })

  it('scopes a nested ignore file to its own subtree', () => {
    const matcher = IgnoreMatcher.create().withScoped('packages/web', ['generated/'])

    expect(matcher.ignores('packages/web/generated', true)).toBe(true)
    expect(matcher.ignores('packages/api/generated', true)).toBe(false)
  })

  it('leaves the original matcher untouched when scoping', () => {
    const base = IgnoreMatcher.create()
    base.withScoped('src', ['*.tsx'])

    expect(base.ignores('src/App.tsx', false)).toBe(false)
  })

  it('honours a directory-only pattern', () => {
    const matcher = IgnoreMatcher.create().withScoped('', ['build/'])

    expect(matcher.ignores('build', true)).toBe(true)
    expect(matcher.ignores('build', false)).toBe(false)
  })

  it('honours negation on a file pattern', () => {
    const matcher = IgnoreMatcher.create().withScoped('', ['*.stories.tsx', '!Button.stories.tsx'])

    expect(matcher.ignores('src/Card.stories.tsx', false)).toBe(true)
    expect(matcher.ignores('src/Button.stories.tsx', false)).toBe(false)
  })

  it('cannot re-include a file under an excluded directory, exactly as git cannot', () => {
    // Documented git behaviour: once a parent directory is excluded, nothing inside it
    // can be brought back. Approximating gitignore by hand is how a scanner ends up
    // disagreeing with the repository it is auditing.
    const matcher = IgnoreMatcher.create().withScoped('', ['src/generated/', '!src/generated/keep.ts'])

    expect(matcher.ignores('src/generated/x.ts', false)).toBe(true)
    expect(matcher.ignores('src/generated/keep.ts', false)).toBe(true)
  })

  it('ignores an empty pattern list rather than creating a useless layer', () => {
    const base = IgnoreMatcher.create()

    expect(base.withScoped('src', [])).toBe(base)
  })
})
