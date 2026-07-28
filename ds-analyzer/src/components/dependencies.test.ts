import { describe, expect, it } from 'vitest'

import { createSourceFiles } from '../testing/source.js'

import { collectExternalDependencies, filterWrappedPackages } from './dependencies.js'

describe('collectExternalDependencies', () => {
  it('collects bare specifiers from imports and re-exports, deduplicated and sorted', () => {
    const files = createSourceFiles({
      'components/Button/Button.tsx': `
        import * as React from 'react'
        import { ButtonProps } from '@v-uik/base'
        export * from '@v-uik/button'
      `,
      'components/Button/Icon.tsx': `import { clsx } from '@v-uik/base'`,
    })

    expect(collectExternalDependencies(files)).toEqual(['@v-uik/base', '@v-uik/button', 'react'])
  })

  it('ignores relative and @src-aliased specifiers', () => {
    const files = createSourceFiles({
      'components/Button/Button.tsx': `
        import { Icon } from './Icon'
        import { sizes } from '../../shared/constants'
        import { useFieldSizing } from '@src/hooks/useFieldSizing'
      `,
    })

    expect(collectExternalDependencies(files)).toEqual([])
  })

  it('reduces deep specifiers to their package name', () => {
    const files = createSourceFiles({
      'components/X/X.ts': `import x from '@v-uik/base/dist/esm/index.js'\nimport y from 'react-dom/client'`,
    })

    expect(collectExternalDependencies(files)).toEqual(['@v-uik/base', 'react-dom'])
  })

  it('returns nothing for files with no imports', () => {
    expect(collectExternalDependencies(createSourceFiles({ 'components/X/X.ts': `export const a = 1` }))).toEqual([])
  })
})

describe('filterWrappedPackages', () => {
  it('keeps only the @v-uik scope', () => {
    expect(filterWrappedPackages(['@v-uik/base', 'react', '@sds-eng/theme', '@v-uik/button'])).toEqual([
      '@v-uik/base',
      '@v-uik/button',
    ])
  })

  it('is empty when nothing upstream is wrapped', () => {
    expect(filterWrappedPackages(['react'])).toEqual([])
  })
})
