import { describe, expect, it } from 'vitest'

import { parseColor, type ColorValue } from '../tokens/color.js'
import {
  compositeOver,
  contrastRatio,
  formatRatio,
  judgeTextContrast,
  relativeLuminance,
  thresholdFor,
} from './contrast.js'

/**
 * The arithmetic, pinned against values anyone can check.
 *
 * Contrast is the one part of this project where a wrong answer is indistinguishable from a
 * right one by inspection — 4.4 and 4.6 look equally plausible — so the fixtures are the
 * canonical pairs from the WCAG definition rather than values read off this implementation.
 */

const color = (hex: string): ColorValue => {
  const parsed = parseColor(hex)

  if (parsed === null) {
    throw new Error(`unparseable fixture colour: ${hex}`)
  }

  return parsed
}

const WHITE = color('#ffffff')
const BLACK = color('#000000')

describe('relativeLuminance', () => {
  it('anchors at the two ends of the scale', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5)
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 5)
  })

  it('weights green above red above blue, as the formula does', () => {
    expect(relativeLuminance(color('#00ff00'))).toBeGreaterThan(relativeLuminance(color('#ff0000')))
    expect(relativeLuminance(color('#ff0000'))).toBeGreaterThan(relativeLuminance(color('#0000ff')))
  })
})

describe('contrastRatio', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 4)
  })

  it('gives 1:1 for a colour on itself', () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(contrastRatio(WHITE, BLACK), 6)
  })

  it('matches the known ratio for mid grey on white', () => {
    // #767676 on white is the canonical "exactly passes AA" example, 4.54:1.
    expect(contrastRatio(color('#767676'), WHITE)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(color('#777777'), WHITE)).toBeLessThan(4.6)
  })

  it('finds the demo project’s white-on-teal banner unreadable', () => {
    expect(contrastRatio(WHITE, color('#00d4aa'))).toBeLessThan(2)
  })
})

describe('compositeOver', () => {
  it('leaves an opaque colour untouched', () => {
    expect(compositeOver(BLACK, WHITE).hex).toBe(BLACK.hex)
  })

  it('blends a half-transparent black over white to mid grey', () => {
    const blended = compositeOver(color('#00000080'), WHITE)

    expect(blended.rgba.r).toBeGreaterThan(125)
    expect(blended.rgba.r).toBeLessThan(131)
    expect(blended.rgba.a).toBe(1)
  })

  it('raises the measured contrast of a translucent foreground, never lowers it', () => {
    // The kit's disabled states are alpha colours like `#13181b47`. Treating one as opaque
    // reports a contrast the user never sees — and errs towards passing, which is the
    // direction that matters.
    const asWritten = contrastRatio({ ...color('#13181bff') }, WHITE)
    const asRendered = contrastRatio(color('#13181b47'), WHITE)

    expect(asRendered).toBeLessThan(asWritten)
  })
})

describe('thresholdFor', () => {
  it('applies the strict bar to body text', () => {
    expect(thresholdFor({ fontSizePx: 16, fontWeight: 400 })).toBe(4.5)
  })

  it('relaxes for genuinely large text', () => {
    expect(thresholdFor({ fontSizePx: 24, fontWeight: 400 })).toBe(3)
  })

  it('relaxes earlier for bold text, at the WCAG boundary', () => {
    expect(thresholdFor({ fontSizePx: 19, fontWeight: 700 })).toBe(3)
    expect(thresholdFor({ fontSizePx: 19, fontWeight: 400 })).toBe(4.5)
  })

  it('assumes the strict bar when the size is unknown', () => {
    // Assuming "large" would let every unmeasured pair through, which would make the rule
    // pass most of the code it is supposed to check.
    expect(thresholdFor({ fontSizePx: null, fontWeight: null })).toBe(4.5)
  })
})

describe('judgeTextContrast', () => {
  it('passes black on white and fails white on teal', () => {
    expect(judgeTextContrast({ foreground: BLACK, background: WHITE, fontSizePx: 16, fontWeight: 400 }).passes).toBe(
      true,
    )
    expect(
      judgeTextContrast({ foreground: WHITE, background: color('#00d4aa'), fontSizePx: 15, fontWeight: 400 }).passes,
    ).toBe(false)
  })
})

describe('formatRatio', () => {
  it('never rounds a failure up into a pass', () => {
    // 4.499 displayed as "4.50" next to a 4.5 threshold reads as a tool contradicting
    // itself, so the display truncates rather than rounds.
    expect(formatRatio(4.499)).toBe('4.49:1')
    expect(formatRatio(21)).toBe('21.00:1')
  })
})
