import { afterEach, describe, expect, it } from 'vitest'

import { createFixtureProject, type FixtureProject } from '../../testing/fixture-project.js'
import { scanProject } from '../scan.js'

/**
 * Design values that never appear where a collector naively looks.
 *
 * The obvious places — a stylesheet, a `styled` template, a `style={{…}}` attribute at the
 * top of a component — are the easy half. In real code a large share of the hard-coded
 * values sit inside function bodies: in a helper that builds a style object, in a value
 * returned from a callback, in an argument handed to a colour utility.
 *
 * A scanner that misses those under-reports silently and produces a flattering score,
 * which is the failure mode that matters. Each case below is one way that happens.
 */

let fixture: FixtureProject | null = null

afterEach(() => {
  fixture?.dispose()
  fixture = null
})

const scan = (source: string): { rule: string; line: number; actual: string }[] => {
  fixture = createFixtureProject({
    'package.json': JSON.stringify({ name: 'probe', dependencies: { '@sds-eng/base': '1.0.0' } }),
    'src/Probe.tsx': source,
  })

  const { observations } = scanProject({ path: fixture.root })

  return observations.styleValues.map((value) => ({
    rule: value.source,
    line: value.line,
    actual: value.value,
  }))
}

const valuesAt = (source: string, line: number): string[] =>
  scan(source)
    .filter((entry) => entry.line === line)
    .map((entry) => entry.actual)

describe('values hidden inside functions', () => {
  it('finds a constant declared in a function body', () => {
    expect(valuesAt(`export const A = () => {\n  const brand = '#ff1f78'\n  return brand\n}\n`, 2)).toEqual(['#ff1f78'])
  })

  it('finds a styled-component declared inside a function', () => {
    const source = `import styled from 'styled-components'\nexport const A = () => {\n  const Inner = styled.div\`\n    background: #2969e3;\n  \`\n  return <Inner />\n}\n`

    expect(valuesAt(source, 4)).toEqual(['#2969e3'])
  })

  it('finds a style object built by a helper the call site cannot evaluate', () => {
    // `style={styleFor(active)}` is opaque, but the object literal is right there.
    const source = `const styleFor = (on: boolean) => ({ color: on ? '#262626' : '#cccccc', padding: 21 })\nexport const A = () => <div style={styleFor(true)} />\n`
    const values = valuesAt(source, 1)

    expect(values).toContain('#262626')
    expect(values).toContain('#cccccc')
    expect(values).toContain('21px')
  })

  it('finds a literal returned straight from a function', () => {
    expect(valuesAt(`export const pick = () => '#00d4aa'\n`, 1)).toEqual(['#00d4aa'])
  })

  it('finds a literal passed as an argument', () => {
    const source = `declare function darken(c: string, n: number): string\nexport const A = darken('#f7f9fc', 0.1)\n`

    expect(valuesAt(source, 2)).toEqual(['#f7f9fc'])
  })

  it('finds an inline style nested inside a callback', () => {
    const source = `export const A = ({ items }: { items: string[] }) => (\n  <ul>\n    {items.map((item) => (\n      <li key={item} style={{ borderTop: '1px solid #e9edf2', gap: 7 }} />\n    ))}\n  </ul>\n)\n`
    const values = valuesAt(source, 4)

    expect(values).toContain('1px solid #e9edf2')
    expect(values).toContain('7px')
  })

  it('reports each value once, however many passes could have claimed it', () => {
    const source = `export const A = () => <div style={{ color: '#262626', padding: 13 }} />\n`
    const values = scan(source).filter((entry) => entry.actual === '#262626')

    expect(values).toHaveLength(1)
  })

  it('does not mistake a configuration object for a style map', () => {
    // One `color` field among unrelated keys is a chart config, not CSS.
    const source = `export const chart = { color: 'series-a', label: 'Revenue', dataKey: 'value' }\n`

    expect(scan(source).filter((entry) => entry.actual === 'series-a')).toEqual([])
  })

  it('does not treat a module specifier as a value', () => {
    const source = `import { Button } from '@sds-eng/base'\nexport const A = () => <Button />\n`

    expect(scan(source)).toEqual([])
  })

  it('does not treat an object key as a value', () => {
    const source = `export const map = { '#ff1f78': 'pink', '#2969e3': 'blue' }\n`

    expect(scan(source).map((entry) => entry.actual)).toEqual([])
  })
})
