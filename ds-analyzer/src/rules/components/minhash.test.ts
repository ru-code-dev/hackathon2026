import { describe, expect, it } from 'vitest'

import { MIN_TOKENS_FOR_SKETCH, buildSketch, sketchSimilarity } from './minhash.js'

/**
 * The clone detector's engine. What is pinned is not the exact estimates but the
 * *ordering* the rules rely on: identical > lightly edited > unrelated, determinism
 * across calls, and the refusal to sketch streams too short to mean anything.
 */

const tokens = (source: string): string[] => source.split(' ')

const BODY =
  'const x = fn ( a , b ) return jsx div { props . title } jsx button on click handler ' +
  'map item key id render span text close if open state effect cleanup listener add remove ' +
  'style padding color background border radius hover focus active disabled variant size'

describe('buildSketch', () => {
  it('refuses streams below the floor', () => {
    expect(buildSketch(Array.from({ length: MIN_TOKENS_FOR_SKETCH - 1 }, () => 'x'))).toBeNull()
  })

  it('is deterministic', () => {
    const first = buildSketch(tokens(BODY))
    const second = buildSketch(tokens(BODY))

    expect(first).not.toBeNull()
    expect([...(first ?? [])]).toEqual([...(second ?? [])])
  })
})

describe('sketchSimilarity', () => {
  it('ranks identical above edited above unrelated', () => {
    const original = buildSketch(tokens(BODY))
    const edited = buildSketch(tokens(BODY.replace('padding color', 'margin outline').replace('span text', 'p label')))
    const unrelated = buildSketch(
      tokens(
        'import react from react export const hook = use state use memo fetch data async await ' +
          'response json error catch retry loop while true break continue push pop shift slice ' +
          'reduce filter sort join split trim lower upper case number parse float precision fixed',
      ),
    )

    expect(original).not.toBeNull()
    expect(edited).not.toBeNull()
    expect(unrelated).not.toBeNull()
    if (original === null || edited === null || unrelated === null) {
      return
    }

    const same = sketchSimilarity(original, original)
    const close = sketchSimilarity(original, edited)
    const far = sketchSimilarity(original, unrelated)

    expect(same).toBe(1)
    expect(close).toBeGreaterThan(0.5)
    expect(close).toBeLessThan(1)
    expect(far).toBeLessThan(0.2)
  })
})
