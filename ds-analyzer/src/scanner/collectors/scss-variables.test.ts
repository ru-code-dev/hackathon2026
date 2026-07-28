import { describe, expect, it } from 'vitest'

import { hasUnresolvedSass, resolveSassImport, ScssVariableIndex } from './scss-variables.js'

const index = (files: Readonly<Record<string, string>>): ScssVariableIndex =>
  ScssVariableIndex.build(new Map(Object.entries(files)))

describe('resolveSassImport', () => {
  const known = new Set([
    'src/shared/styles/_vars.scss',
    'src/shared/styles/theme.scss',
    'src/shared/styles/mixins/_index.scss',
  ])

  it('finds a partial through its underscore-less spelling', () => {
    expect(resolveSassImport('src/features/a/x.module.scss', '../../shared/styles/vars', known)).toBe(
      'src/shared/styles/_vars.scss',
    )
  })

  it('finds a plain stylesheet with an explicit extension', () => {
    expect(resolveSassImport('src/a.scss', './shared/styles/theme.scss', known)).toBe('src/shared/styles/theme.scss')
  })

  it('finds a directory index', () => {
    expect(resolveSassImport('src/a.scss', './shared/styles/mixins', known)).toBe(
      'src/shared/styles/mixins/_index.scss',
    )
  })

  it('ignores built-in and package modules', () => {
    expect(resolveSassImport('src/a.scss', 'sass:math', known)).toBeNull()
    expect(resolveSassImport('src/a.scss', '~bootstrap/scss/bootstrap', known)).toBeNull()
  })

  it('returns null for a stylesheet the walker excluded', () => {
    expect(resolveSassImport('src/a.scss', './generated/tokens', known)).toBeNull()
  })
})

describe('ScssVariableIndex', () => {
  it('resolves a variable declared in the same file', () => {
    const variables = index({ 'a.scss': '$brand: #ff1f78;\n.c { color: $brand; }' })

    expect(variables.resolveValue('a.scss', '$brand').value).toBe('#ff1f78')
  })

  it('resolves across a namespaced @use', () => {
    const variables = index({
      'src/styles/_vars.scss': '$surface: #f7f9fc;',
      'src/ui/card.module.scss': "@use '../styles/vars' as v;\n.root { background: v.$surface; }",
    })

    const result = variables.resolveValue('src/ui/card.module.scss', 'v.$surface')

    expect(result.value).toBe('#f7f9fc')
    expect(result.rootCause?.name).toBe('surface')
    expect(result.rootCause?.line).toBe(1)
  })

  it('follows a two-hop chain and blames the line holding the literal', () => {
    const variables = index({
      'v.scss': '$brand: #ff1f78;\n$accent: $brand;',
      'c.scss': "@use 'v' as v;\n.a { border-left: 2px solid v.$accent; }",
    })

    const result = variables.resolveValue('c.scss', '2px solid v.$accent')

    expect(result.value).toBe('2px solid #ff1f78')
    // Line 1 is `$brand`, line 2 the intermediate. Fixing line 1 fixes everything.
    expect(result.rootCause?.line).toBe(1)
    expect(result.rootCause?.name).toBe('brand')
  })

  it('resolves each reference in its own scope', () => {
    const variables = index({
      'x.scss': '$c: #111111;',
      'y.scss': '$c: #222222;',
      'main.scss': "@use 'x' as x;\n@use 'y' as y;\n.a { border: 1px solid x.$c; background: y.$c; }",
    })

    expect(variables.resolveValue('main.scss', 'x.$c').value).toBe('#111111')
    expect(variables.resolveValue('main.scss', 'y.$c').value).toBe('#222222')
  })

  it('inherits from an unnamespaced @use', () => {
    const variables = index({
      'v.scss': '$brand: #ff1f78;',
      'c.scss': "@use 'v';\n.a { color: $brand; }",
    })

    expect(variables.resolveValue('c.scss', '$brand').value).toBe('#ff1f78')
  })

  it('inherits through a legacy @import', () => {
    const variables = index({
      'v.scss': '$brand: #ff1f78;',
      'c.scss': "@import 'v';\n.a { color: $brand; }",
    })

    expect(variables.resolveValue('c.scss', '$brand').value).toBe('#ff1f78')
  })

  it('reports an unknown variable as unresolved rather than inventing a value', () => {
    const variables = index({ 'a.scss': '.c { color: $missing; }' })
    const result = variables.resolveValue('a.scss', '$missing')

    expect(result.unresolved).toBe(true)
    expect(result.value).toBe('$missing')
    expect(result.rootCause).toBeNull()
  })

  it('terminates on a self-referential declaration', () => {
    const variables = index({ 'a.scss': '$loop: $loop;' })
    const result = variables.resolveValue('a.scss', '$loop')

    expect(result.unresolved).toBe(true)
  })

  it('terminates on a cycle between two files', () => {
    const variables = index({
      'a.scss': "@use 'b' as b;\n$x: b.$y;",
      'b.scss': "@use 'a' as a;\n$y: a.$x;",
    })

    expect(variables.resolveValue('a.scss', '$x').unresolved).toBe(true)
  })

  it('ignores !default and !global markers on a declaration', () => {
    const variables = index({ 'a.scss': '$brand: #ff1f78 !default;' })

    expect(variables.resolveValue('a.scss', '$brand').value).toBe('#ff1f78')
  })
})

describe('hasUnresolvedSass', () => {
  it('flags a leftover variable', () => {
    expect(hasUnresolvedSass('$missing')).toBe(true)
  })

  it('flags interpolation and colour functions over variables', () => {
    expect(hasUnresolvedSass('#{$size}px')).toBe(true)
    expect(hasUnresolvedSass('darken($brand, 10%)')).toBe(true)
  })

  it('leaves a fully resolved value alone', () => {
    expect(hasUnresolvedSass('rgba(0, 0, 0, 0.5)')).toBe(false)
    expect(hasUnresolvedSass('2px solid #ff1f78')).toBe(false)
  })
})
