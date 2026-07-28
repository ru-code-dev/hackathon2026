import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { Limitation } from '../../domain/profile.js'
import { createFixtureProject, type FixtureProject } from '../../testing/fixture-project.js'
import { aliasSourceForFile, mergeAliases, readConfigAliases, readPackageImports } from './aliases.js'
import { detectPackageManager, detectWorkspaces, findProjectRoot, locateProject, readPackageManifest } from './root.js'
import { scanTsconfigs } from './tsconfig.js'

let fixture: FixtureProject | null = null

const project = (files: Readonly<Record<string, string>>): string => {
  fixture = createFixtureProject(files)
  return fixture.root
}

afterEach(() => {
  fixture?.dispose()
  fixture = null
})

describe('findProjectRoot', () => {
  it('anchors on the nearest package.json', () => {
    const root = project({
      'package.json': '{}',
      'packages/web/package.json': '{}',
      'packages/web/src/App.tsx': '',
    })

    expect(findProjectRoot(join(root, 'packages/web/src'))).toBe(join(root, 'packages/web'))
  })

  it('falls back to the path itself when there is no marker', () => {
    const root = project({ 'components/Card.tsx': '' })
    const target = join(root, 'components')

    // No package.json and no .git anywhere: a loose folder is still analysable.
    expect(findProjectRoot(target)).toBe(target)
  })
})

describe('locateProject', () => {
  it('turns a file into a root plus a scope', () => {
    const root = project({ 'package.json': '{}', 'src/a/B.tsx': '' })
    const location = locateProject(join(root, 'src/a/B.tsx'))

    expect(location.root).toBe(root)
    expect(location.scope).toBe('src/a/B.tsx')
    expect(location.targetIsFile).toBe(true)
  })

  it('refuses a path that does not exist rather than inventing a root', () => {
    expect(() => locateProject('/definitely/not/here')).toThrow(/does not exist/)
  })
})

describe('readPackageManifest', () => {
  it('merges every dependency section', () => {
    const root = project({
      'package.json': JSON.stringify({
        name: 'shop',
        dependencies: { '@sds-eng/base': '^1.3.1' },
        devDependencies: { vite: '^6' },
      }),
    })

    const manifest = readPackageManifest(root)

    expect(manifest.name).toBe('shop')
    expect(manifest.dependencies['@sds-eng/base']).toBe('^1.3.1')
    expect(manifest.dependencies['vite']).toBe('^6')
  })

  it('returns an empty manifest for a folder without one', () => {
    const root = project({ 'a.tsx': '' })

    expect(readPackageManifest(root)).toEqual({ name: null, workspaces: [], dependencies: {} })
  })

  it('survives a malformed package.json', () => {
    const root = project({ 'package.json': '{ not json' })

    expect(readPackageManifest(root).name).toBeNull()
  })
})

describe('detectPackageManager and detectWorkspaces', () => {
  it('reads the lockfile', () => {
    const root = project({ 'package.json': '{}', 'pnpm-lock.yaml': '' })

    expect(detectPackageManager(root)).toBe('pnpm')
  })

  it('says unknown rather than guessing npm', () => {
    const root = project({ 'package.json': '{}' })

    expect(detectPackageManager(root)).toBe('unknown')
  })

  it('reads workspaces from package.json', () => {
    const root = project({ 'package.json': JSON.stringify({ workspaces: ['packages/*'] }) })

    expect(detectWorkspaces(root, readPackageManifest(root))).toEqual(['packages/*'])
  })

  it('reads the yarn object form', () => {
    const root = project({ 'package.json': JSON.stringify({ workspaces: { packages: ['apps/*'] } }) })

    expect(detectWorkspaces(root, readPackageManifest(root))).toEqual(['apps/*'])
  })

  it('reads pnpm-workspace.yaml', () => {
    const root = project({ 'package.json': '{}', 'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - apps/*\n" })

    expect(detectWorkspaces(root, readPackageManifest(root))).toEqual(['packages/*', 'apps/*'])
  })
})

describe('scanTsconfigs', () => {
  it('reads JSONC, which is what tsconfig actually is', () => {
    const root = project({
      'tsconfig.json': '{\n  // a comment\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } },\n}',
    })

    const scan = scanTsconfigs(root, [join(root, 'tsconfig.json')])

    expect(scan.aliases).toEqual([{ pattern: '@/*', resolvesTo: ['src/*'], source: 'tsconfig' }])
  })

  it('unrolls an extends chain', () => {
    const root = project({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@lib/*': ['lib/*'] } } }),
      'tsconfig.json': JSON.stringify({
        extends: './tsconfig.base.json',
        compilerOptions: { paths: { '@/*': ['src/*'] } },
      }),
    })

    const scan = scanTsconfigs(root, [join(root, 'tsconfig.json')])

    expect(scan.aliases.map((alias) => alias.pattern).sort()).toEqual(['@/*', '@lib/*'])
    expect(scan.configs[0]?.extendsChain).toEqual(['tsconfig.base.json'])
  })

  it('records an unresolvable extends instead of failing', () => {
    const root = project({ 'tsconfig.json': JSON.stringify({ extends: '@tsconfig/node20/tsconfig.json' }) })

    const scan = scanTsconfigs(root, [join(root, 'tsconfig.json')])

    expect(scan.limitations[0]?.reason).toBe('unreadable-config')
    expect(scan.limitations[0]?.detail).toContain('@tsconfig/node20')
  })

  it('resolves paths against baseUrl', () => {
    const root = project({
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: 'src', paths: { '~/*': ['shared/*'] } } }),
    })

    expect(scanTsconfigs(root, [join(root, 'tsconfig.json')]).aliases[0]?.resolvesTo).toEqual(['src/shared/*'])
  })

  it('terminates on a circular extends', () => {
    const root = project({
      'a.json': JSON.stringify({ extends: './b.json' }),
      'b.json': JSON.stringify({ extends: './a.json' }),
    })

    expect(() => scanTsconfigs(root, [join(root, 'a.json')])).not.toThrow()
  })

  it('binds each config to the directory it governs', () => {
    const root = project({
      'tsconfig.json': '{}',
      'apps/web/tsconfig.json': '{}',
    })

    const scan = scanTsconfigs(root, [join(root, 'tsconfig.json'), join(root, 'apps/web/tsconfig.json')])

    expect(scan.configs.map((config) => config.directory)).toEqual(['apps/web', ''])
  })
})

describe('readConfigAliases', () => {
  const read = (fileName: string, content: string) => {
    const root = project({ [fileName]: content })
    const limitations: Limitation[] = []
    const source = aliasSourceForFile(fileName)

    if (source === null) {
      throw new Error(`${fileName} is not recognised as a config`)
    }

    return { aliases: readConfigAliases(root, join(root, fileName), source, limitations), limitations }
  }

  it('recovers a path from fileURLToPath(new URL(…))', () => {
    const { aliases } = read(
      'vite.config.ts',
      "export default { resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } }",
    )

    expect(aliases).toEqual([{ pattern: '@', resolvesTo: ['src'], source: 'vite' }])
  })

  it('recovers a path from path.resolve(__dirname, …)', () => {
    const { aliases } = read(
      'webpack.config.js',
      "module.exports = { resolve: { alias: { '~': path.resolve(__dirname, 'app') } } }",
    )

    expect(aliases).toEqual([{ pattern: '~', resolvesTo: ['app'], source: 'webpack' }])
  })

  it('reads the Vite array form', () => {
    const { aliases } = read(
      'vite.config.ts',
      "export default { resolve: { alias: [{ find: '@ui', replacement: './src/ui' }] } }",
    )

    expect(aliases).toEqual([{ pattern: '@ui', resolvesTo: ['src/ui'], source: 'vite' }])
  })

  it('reads an alias assigned inside a callback, as Next.js writes it', () => {
    const { aliases } = read(
      'next.config.mjs',
      "export default { webpack: (config) => { config.resolve.alias = { '~': './components' }; return config } }",
    )

    expect(aliases).toEqual([{ pattern: '~', resolvesTo: ['components'], source: 'next' }])
  })

  it('ignores an `alias` key that is not under `resolve`', () => {
    const { aliases } = read('vite.config.ts', "export default { server: { alias: { '@': './nope' } } }")

    expect(aliases).toEqual([])
  })

  it('records a computed alias map as a limitation rather than executing it', () => {
    const { aliases, limitations } = read('vite.config.ts', 'export default { resolve: { alias: buildAliases() } }')

    expect(aliases).toEqual([])
    expect(limitations[0]?.detail).toContain('ds.config.json')
  })
})

describe('readPackageImports', () => {
  it('reads subpath imports', () => {
    const root = project({ 'package.json': JSON.stringify({ imports: { '#app/*': './src/*' } }) })

    expect(readPackageImports(root)).toEqual([{ pattern: '#app/*', resolvesTo: ['src/*'], source: 'package-imports' }])
  })

  it('skips conditional exports, which are a runtime concern', () => {
    const root = project({ 'package.json': JSON.stringify({ imports: { '#x': { node: './a.js' } } }) })

    expect(readPackageImports(root)).toEqual([])
  })
})

describe('mergeAliases', () => {
  it('keeps the first definition of a pattern', () => {
    const merged = mergeAliases(
      [{ pattern: '@/*', resolvesTo: ['src/*'], source: 'tsconfig' }],
      [{ pattern: '@/*', resolvesTo: ['other/*'], source: 'vite' }],
    )

    expect(merged).toEqual([{ pattern: '@/*', resolvesTo: ['src/*'], source: 'tsconfig' }])
  })
})
