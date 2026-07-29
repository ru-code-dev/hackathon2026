import { describe, expect, it } from 'vitest'

import { finding } from './fixtures.js'
import { buildPatches, buildSelection, patchesArtifactSchema } from './patches.js'

/**
 * patches.json drives real `git apply` runs on the user's checkout — the contract here is
 * with a version control system, not with a screen. Group independence, recommended-first
 * ordering and union rebuilding (not diff concatenation) are each pinned.
 */

describe('buildPatches', () => {
  it('produces one schema-valid group per impact key with its own applicable diff', () => {
    const artifact = buildPatches([
      finding({ file: 'a.tsx', line: 2, impactKey: 'k1' }),
      finding({ file: 'b.tsx', line: 2, impactKey: 'k2' }),
    ])
    expect(() => patchesArtifactSchema.parse(artifact)).not.toThrow()
    expect(artifact.groups).toHaveLength(2)
    for (const group of artifact.groups) {
      expect(group.diff).toContain('diff --git')
      expect(group.occurrences).toBe(1)
    }
  })

  it('marks a low-confidence group as not recommended and sorts it after recommended ones', () => {
    const artifact = buildPatches([
      finding({ file: 'a.tsx', line: 2, impactKey: 'shaky', confidence: 0.7 }),
      finding({ file: 'b.tsx', line: 2, impactKey: 'safe', confidence: 1 }),
    ])
    expect(artifact.groups.map((group) => group.impactKey)).toEqual(['safe', 'shaky'])
    expect(artifact.recommendedKeys).toEqual(['safe'])
  })

  it('ignores findings without an automatic replacement', () => {
    const manual = finding({ file: 'a.tsx', line: 2, impactKey: 'manual', autoFixable: false })
    expect(buildPatches([manual]).groups).toHaveLength(0)
  })

  it('keeps the group even when every occurrence is skipped, so nothing vanishes silently', () => {
    const broken = finding({ file: 'a.tsx', line: 2, impactKey: 'broken' })
    const artifact = buildPatches([
      { ...broken, snippet: { ...broken.snippet, after: 'one\nline\nmore\nthan\nbefore\nhas' } },
    ])
    expect(artifact.groups).toHaveLength(1)
    expect(artifact.groups[0]?.diff).toBe('')
    expect(artifact.groups[0]?.skipped).toHaveLength(1)
  })
})

describe('buildSelection', () => {
  it('rebuilds one diff over the union instead of concatenating group diffs', () => {
    // Two groups editing different lines of the SAME context window: concatenated diffs
    // would double the context and git apply would reject the second hunk.
    const first = finding({
      file: 'a.tsx',
      line: 2,
      impactKey: 'k1',
      snippet: { before: 'a\nb\nc', after: 'a\nB\nc', highlightLine: 2, startLine: 1 },
    })
    const second = finding({
      file: 'a.tsx',
      line: 3,
      impactKey: 'k2',
      snippet: { before: 'a\nb\nc', after: 'a\nb\nC', highlightLine: 3, startLine: 1 },
    })
    const selection = buildSelection([first, second], ['k1', 'k2'])
    expect(selection.diff.match(/@@ -/g)).toHaveLength(1)
    expect(selection.diff).toContain('-b')
    expect(selection.diff).toContain('+B')
    expect(selection.diff).toContain('-c')
    expect(selection.diff).toContain('+C')
  })

  it('selects only the requested keys', () => {
    const selection = buildSelection(
      [finding({ file: 'a.tsx', line: 2, impactKey: 'k1' }), finding({ file: 'b.tsx', line: 2, impactKey: 'k2' })],
      ['k1'],
    )
    expect(selection.files).toEqual(['a.tsx'])
  })

  it('names unknown keys instead of ignoring them', () => {
    const selection = buildSelection([finding({ file: 'a.tsx', line: 2, impactKey: 'k1' })], ['k1', 'typo'])
    expect(selection.unknownKeys).toEqual(['typo'])
  })
})
