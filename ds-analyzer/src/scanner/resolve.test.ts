import { afterEach, describe, expect, it } from 'vitest'

import type { Alias } from '../domain/profile.js'
import { createFixtureProject, type FixtureProject } from '../testing/fixture-project.js'
import { isDeepPackageImport, packageNameOf, resolveSpecifier, type ResolverContext } from './resolve.js'

let fixture: FixtureProject | null = null

const context = (files: Readonly<Record<string, string>>, aliases: Alias[] = []): ResolverContext => {
  fixture = createFixtureProject(files)
  return { root: fixture.root, aliases }
}

afterEach(() => {
  fixture?.dispose()
  fixture = null
})

const alias = (pattern: string, resolvesTo: string[], source: Alias['source'] = 'tsconfig'): Alias => ({
  pattern,
  resolvesTo,
  source,
})

describe('resolveSpecifier', () => {
  it('resolves a relative import without an extension', () => {
    const ctx = context({ 'src/a.tsx': '', 'src/ui/Button.tsx': '' })

    expect(resolveSpecifier(ctx, './ui/Button', 'src/a.tsx')).toEqual({ kind: 'relative', file: 'src/ui/Button.tsx' })
  })

  it('resolves the ESM `.js` spelling of a TypeScript file', () => {
    // `import './Button.js'` must find `Button.tsx`, which is what every ESM-configured
    // TypeScript project writes and what a naive resolver misses.
    const ctx = context({ 'src/a.tsx': '', 'src/Button.tsx': '' })

    expect(resolveSpecifier(ctx, './Button.js', 'src/a.tsx').file).toBe('src/Button.tsx')
  })

  it('resolves a directory to its index', () => {
    const ctx = context({ 'src/a.tsx': '', 'src/ui/index.ts': '' })

    expect(resolveSpecifier(ctx, './ui', 'src/a.tsx').file).toBe('src/ui/index.ts')
  })

  it('resolves a stylesheet import', () => {
    const ctx = context({ 'src/a.tsx': '', 'src/a.module.scss': '' })

    expect(resolveSpecifier(ctx, './a.module.scss', 'src/a.tsx').file).toBe('src/a.module.scss')
  })

  it('applies a wildcard alias', () => {
    const ctx = context({ 'src/a.tsx': '', 'src/shared/ui/index.ts': '' }, [alias('@/*', ['src/*'])])

    expect(resolveSpecifier(ctx, '@/shared/ui', 'src/a.tsx')).toEqual({ kind: 'alias', file: 'src/shared/ui/index.ts' })
  })

  it('tries every target of a multi-target alias', () => {
    const ctx = context({ 'a.tsx': '', 'second/x.ts': '' }, [alias('~/*', ['first/*', 'second/*'])])

    expect(resolveSpecifier(ctx, '~/x', 'a.tsx').file).toBe('second/x.ts')
  })

  it('treats a wildcard-free tsconfig alias as an exact match, as TypeScript does', () => {
    const ctx = context({ 'a.tsx': '', 'src/app/index.ts': '', 'src/app/deep.ts': '' }, [alias('@app', ['src/app'])])

    expect(resolveSpecifier(ctx, '@app', 'a.tsx').kind).toBe('alias')
    expect(resolveSpecifier(ctx, '@app/deep', 'a.tsx').kind).toBe('package')
  })

  it('treats a wildcard-free build-config alias as a prefix, as Vite does', () => {
    // `{ '@': '/abs/src' }` in vite.config rewrites `@/shared/ui`. Applying tsconfig's
    // exact-match rule here would lose every aliased import in such a project.
    const ctx = context({ 'a.tsx': '', 'src/shared/ui.ts': '' }, [alias('@', ['src'], 'vite')])

    expect(resolveSpecifier(ctx, '@/shared/ui', 'a.tsx')).toEqual({ kind: 'alias', file: 'src/shared/ui.ts' })
  })

  it('calls an external package a package, whether or not it is installed', () => {
    const ctx = context({ 'a.tsx': '' })

    expect(resolveSpecifier(ctx, '@sds-eng/base', 'a.tsx')).toEqual({ kind: 'package', file: null })
  })

  it('reports an unresolvable relative import instead of guessing', () => {
    const ctx = context({ 'src/a.tsx': '' })

    expect(resolveSpecifier(ctx, './missing', 'src/a.tsx')).toEqual({ kind: 'unresolved', file: null })
  })
})

describe('packageNameOf', () => {
  it('keeps the scope', () => {
    expect(packageNameOf('@sds-eng/base/src/components/Text')).toBe('@sds-eng/base')
  })

  it('reads an unscoped package', () => {
    expect(packageNameOf('react-dom/client')).toBe('react-dom')
  })

  it('returns null for a relative specifier', () => {
    expect(packageNameOf('./a')).toBeNull()
  })

  it('returns null for a bare scope, which is not a package', () => {
    expect(packageNameOf('@sds-eng')).toBeNull()
  })
})

describe('isDeepPackageImport', () => {
  it('distinguishes an entry point from a reach into the source tree', () => {
    expect(isDeepPackageImport('@sds-eng/base')).toBe(false)
    expect(isDeepPackageImport('@sds-eng/base/src/components/Text')).toBe(true)
    expect(isDeepPackageImport('./local')).toBe(false)
  })
})
