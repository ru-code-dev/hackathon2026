import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { readSources } from './context.js'

/**
 * The phantom-last-line regression. A newline-terminated file splits into a trailing empty
 * element that neither editors nor git count as a line; a snippet window built over it
 * claims one line more than the file has, and `git apply` rejects the resulting diff with
 * «patch does not apply». Caught live by the skill-bundle smoke test on demo-app.
 */

const dir = mkdtempSync(join(tmpdir(), 'ds-sources-'))

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('readSources', () => {
  it('does not count the newline at end of file as a line', () => {
    writeFileSync(join(dir, 'terminated.tsx'), 'a\nb\nc\n')
    const lines = readSources(dir, ['terminated.tsx']).get('terminated.tsx')
    expect(lines).toEqual(['a', 'b', 'c'])
  })

  it('keeps every line of a file without a final newline', () => {
    writeFileSync(join(dir, 'unterminated.tsx'), 'a\nb\nc')
    const lines = readSources(dir, ['unterminated.tsx']).get('unterminated.tsx')
    expect(lines).toEqual(['a', 'b', 'c'])
  })

  it('keeps a real trailing empty line (double newline at EOF)', () => {
    writeFileSync(join(dir, 'blank-end.tsx'), 'a\n\n')
    const lines = readSources(dir, ['blank-end.tsx']).get('blank-end.tsx')
    expect(lines).toEqual(['a', ''])
  })

  it('skips unreadable files without failing the run', () => {
    const sources = readSources(dir, ['missing.tsx'])
    expect(sources.has('missing.tsx')).toBe(false)
  })
})
