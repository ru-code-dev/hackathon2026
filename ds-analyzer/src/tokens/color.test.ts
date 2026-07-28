import { describe, expect, it } from 'vitest'

import { colorDistance, isColorLiteral, parseColor, rgbaToOklch } from './color.js'

describe('parseColor', () => {
  it('expands 3-digit hex to canonical 8-digit form', () => {
    expect(parseColor('#fff')?.hex).toBe('#ffffffff')
    expect(parseColor('#f0a')?.hex).toBe('#ff00aaff')
  })

  it('expands 4-digit hex including its alpha nibble', () => {
    expect(parseColor('#fff8')?.hex).toBe('#ffffff88')
  })

  it('normalises 6- and 8-digit hex and is case-insensitive', () => {
    expect(parseColor('#FF1F78')?.hex).toBe('#ff1f78ff')
    expect(parseColor('#ff1f7880')?.hex).toBe('#ff1f7880')
  })

  it('parses legacy comma rgb/rgba syntax', () => {
    expect(parseColor('rgb(255, 31, 120)')?.hex).toBe('#ff1f78ff')
    expect(parseColor('rgba(0,0,0,0)')?.hex).toBe('#00000000')
  })

  it('parses modern space/slash rgb syntax', () => {
    expect(parseColor('rgb(255 31 120 / 0.5)')?.hex).toBe('#ff1f7880')
  })

  it('parses percentage channels', () => {
    expect(parseColor('rgb(100%, 0%, 0%)')?.hex).toBe('#ff0000ff')
  })

  it('resolves the named colours the kit uses', () => {
    expect(parseColor('transparent')?.hex).toBe('#00000000')
    expect(parseColor('white')?.hex).toBe('#ffffffff')
    expect(parseColor('black')?.hex).toBe('#000000ff')
  })

  it('reports alpha presence', () => {
    expect(parseColor('#ff1f78')?.hasAlpha).toBe(false)
    expect(parseColor('rgba(255,31,120,0.5)')?.hasAlpha).toBe(true)
  })

  it('clamps out-of-range channels rather than rejecting them', () => {
    expect(parseColor('rgb(300, -20, 120)')?.hex).toBe('#ff0078ff')
  })

  it('returns null for non-colours', () => {
    for (const input of ['', '   ', 'none', '12px', '#gg0000', '#12345', 'rgb(1,2)', 'rgb(1,2,3,4,5)', 'gold']) {
      expect(parseColor(input), input).toBeNull()
    }
  })

  it('treats surrounding whitespace as insignificant', () => {
    expect(parseColor('  #ff1f78  ')?.hex).toBe('#ff1f78ff')
  })
})

describe('rgbaToOklch', () => {
  it('maps pure white and black to the lightness extremes', () => {
    expect(rgbaToOklch({ r: 255, g: 255, b: 255, a: 1 }).l).toBeCloseTo(1, 3)
    expect(rgbaToOklch({ r: 0, g: 0, b: 0, a: 1 }).l).toBeCloseTo(0, 5)
  })

  it('reports zero chroma and zero hue for greys', () => {
    const grey = rgbaToOklch({ r: 128, g: 128, b: 128, a: 1 })
    expect(grey.c).toBeCloseTo(0, 4)
    expect(grey.h).toBe(0)
  })

  it('places primaries at their known OKLCH hue angles', () => {
    // Reference values from Ottosson's OKLab specification.
    expect(rgbaToOklch({ r: 255, g: 0, b: 0, a: 1 }).h).toBeCloseTo(29.23, 1)
    expect(rgbaToOklch({ r: 0, g: 255, b: 0, a: 1 }).h).toBeCloseTo(142.5, 1)
    expect(rgbaToOklch({ r: 0, g: 0, b: 255, a: 1 }).h).toBeCloseTo(264.05, 1)
  })

  it('keeps the hue angle within [0, 360)', () => {
    for (const channel of [0, 32, 64, 128, 200, 255]) {
      const { h } = rgbaToOklch({ r: channel, g: 255 - channel, b: 128, a: 1 })
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })
})

describe('colorDistance', () => {
  const at = (hex: string) => parseColor(hex)!

  it('is zero for identical colours', () => {
    expect(colorDistance(at('#ff1f78'), at('#FF1F78'))).toBe(0)
  })

  it('is symmetric', () => {
    expect(colorDistance(at('#ff1f78'), at('#ff2078'))).toBe(colorDistance(at('#ff2078'), at('#ff1f78')))
  })

  it('stays below the visually-indistinguishable threshold for a one-step difference', () => {
    expect(colorDistance(at('#ff1f78'), at('#ff2078'))).toBeLessThan(0.02)
  })

  it('exceeds the near-shade threshold for unrelated colours', () => {
    expect(colorDistance(at('#ff1f78'), at('#0a162b'))).toBeGreaterThan(0.1)
  })
})

describe('isColorLiteral', () => {
  it('agrees with parseColor', () => {
    expect(isColorLiteral('#fff')).toBe(true)
    expect(isColorLiteral('16px')).toBe(false)
  })
})
