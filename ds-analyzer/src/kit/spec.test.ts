import { describe, expect, it } from 'vitest'

import { resolvePaths } from '../config.js'
import { KitSpec } from './spec.js'

/**
 * Colour and typography matching against the real kit.
 *
 * These run against the extracted artifacts rather than fixtures on purpose: the whole
 * value of the suggestion logic is that it picks well among the *actual* forty-five tokens
 * holding `#2969e3`, and a hand-made fixture with three tokens would not exercise that.
 */

const kit = KitSpec.load(resolvePaths().artifactsDir)

describe('matchColor — exact matches', () => {
  it('picks the semantic token whose role matches the property', () => {
    expect(kit.matchColor('#2969e3', 'border')?.token?.id).toBe('sys.Border.borderAccent')
    expect(kit.matchColor('#2969e3', 'background')?.token?.id).toBe('sys.Background.backAccent')
    expect(kit.matchColor('#2969e3', 'foreground')?.token?.id).toBe('sys.Foreground.foreAccentHover')
  })

  it('falls back to the palette when no semantic token plays that role', () => {
    // The only sys token holding #ff1f78 is a Foreground role. Offering it for a
    // background would endorse a role confusion, so the palette entry wins.
    const match = kit.matchColor('#ff1f78', 'background')

    expect(match?.token?.id).toBe('ref.palette.pink.pink500')
    expect(match?.roleGap).toBe(true)
  })

  it('does not claim a role gap when the role was matched', () => {
    expect(kit.matchColor('#2969e3', 'border')?.roleGap).toBe(false)
  })

  it('never suggests a comp token, which emits no CSS variable', () => {
    const match = kit.matchColor('#ffffff', 'background')

    expect(match?.token?.tier).not.toBe('comp')
    expect(match?.token?.cssVariable).not.toBeNull()
  })

  it('prefers the palette over semantic tokens when there is no role to match', () => {
    // A role token is a semantic claim ("this shadow is a background") the analyzer cannot
    // back without role context. The paint twin asserts nothing; the sys candidates stay
    // reachable through `alternatives` and the rule surfaces them in its note.
    const match = kit.matchColor('#e31227', null)

    expect(match?.token?.id).toBe('ref.palette.red.red700')
    expect(match?.alternatives).toContain('sys.Background.backNegative')
  })

  it('demotes theme-invariant Const tokens when the role is unknown', () => {
    // `ForegroundConst.foreConstHoliday` means "must not follow the theme". Offering it to
    // somebody who merely typed a hex would be asserting an intent they never expressed.
    const match = kit.matchColor('#ff1f78', null)

    expect(match?.token?.id).toBe('ref.palette.pink.pink500')
    expect(match?.alternatives).toContain('sys.ForegroundConst.foreConstHoliday')
  })

  it('lists the other tokens holding the same colour', () => {
    const match = kit.matchColor('#ffffff', 'background')

    expect(match?.alternatives.length).toBeGreaterThan(0)
    expect(match?.alternatives).not.toContain(match?.token?.id)
  })
})

describe('matchColor — inexact matches', () => {
  it('calls a one-channel difference near, not exact', () => {
    const match = kit.matchColor('#ff2078', null)

    expect(match?.kind).toBe('near')
    expect(match?.distance).toBeLessThan(0.02)
    expect(match?.token?.id).toBe('ref.palette.pink.pink500')
  })

  it('calls a deliberate variant a shade', () => {
    const match = kit.matchColor('#00d4aa', null)

    expect(match?.kind).toBe('shade')
    expect(match?.token?.id).toBe('ref.palette.arctic.arctic300')
  })

  it('calls a colour outside the palette foreign and offers nothing', () => {
    const match = kit.matchColor('rgba(0, 0, 0, 0.5)', 'background')

    expect(match?.kind).toBe('foreign')
    expect(match?.distance).toBeGreaterThanOrEqual(0.1)
  })

  it('distinguishes tokens that share an RGB but differ in alpha', () => {
    // The same ink at 12% and at 96% opacity are two different tokens with two different
    // jobs. Matching on RGB alone would collapse them.
    expect(kit.matchColor('rgba(6, 10, 12, 0.12)', null)?.token?.id).toBe('sys.Background.surfaceTertiary')
    expect(kit.matchColor('#060a0cf5', 'foreground')?.token?.id).toBe('sys.Foreground.forePrimary')
  })

  it('does not offer a solid token for a translucent literal', () => {
    // #ff1f7880 is pink500 at half opacity. OKLab distance to pink500 is zero — the
    // conversion never sees alpha — so without the alpha guard this would be reported as
    // an exact match and the suggested fix would render a solid pink.
    const match = kit.matchColor('rgba(255, 31, 120, 0.5)', 'background')

    expect(match?.kind).toBe('foreign')
    expect(match?.token?.id).not.toBe('ref.palette.pink.pink500')
  })

  it('returns null for something that is not a colour', () => {
    expect(kit.matchColor('flex-end', null)).toBeNull()
  })
})

describe('scales', () => {
  it('exposes the kit’s ramps', () => {
    expect(kit.scaleValues('borderRadiusPx')).toEqual([0, 2, 4, 8, 9999])
    expect(kit.scaleValues('borderWidthPx')).toEqual([0, 2])
  })

  it('brackets an off-scale value with its neighbours', () => {
    expect(kit.neighboursOnScale(6, 'borderRadiusPx')).toEqual([4, 8])
  })

  it('returns one neighbour at the end of a ramp', () => {
    expect(kit.neighboursOnScale(20000, 'borderRadiusPx')).toEqual([9999])
  })
})

describe('component API', () => {
  it('reads the variant sets the kit declares', () => {
    expect(kit.variantValues('Button', 'view')).toEqual(['primary', 'secondary', 'negative'])
    expect(kit.variantValues('Button', 'size')).toEqual(['xs', 'sm', 'md'])
  })

  it('returns null for a prop the kit does not constrain', () => {
    expect(kit.variantValues('Button', 'onClick')).toBeNull()
    expect(kit.variantValues('NotAComponent', 'view')).toBeNull()
  })

  it('knows which slots are private', () => {
    expect(kit.slot('Button', 'contentContainer')).toEqual({ inner: true })
    expect(kit.slot('Button', 'nonexistent')).toBeNull()
  })

  it('distinguishes “not deprecated” from “deprecated without a reason”', () => {
    expect(kit.deprecationOf('Button')).toBeUndefined()
    expect(kit.deprecationOf('Input')).toContain('TextField')
  })

  it('maps a wrapped package back to the wrapper', () => {
    expect(kit.componentWrapping('@v-uik/button')).toBe('Button')
    expect(kit.componentWrapping('@v-uik/nothing')).toBeNull()
  })
})

describe('fonts', () => {
  it('accepts the kit families and the generic fallbacks', () => {
    expect(kit.isKnownFontFamily('SB Sans Text')).toBe(true)
    expect(kit.isKnownFontFamily('sans-serif')).toBe(true)
    expect(kit.isKnownFontFamily('system-ui')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(kit.isKnownFontFamily('Inter')).toBe(false)
  })
})

describe('typography', () => {
  it('finds the tuple a half-tokenised style was aiming at', () => {
    const match = kit.matchTypography({ fontSize: '16px', fontWeight: '500', lineHeight: '26px' })

    expect(match?.tuple.id).toBe('sys.Typography.Body.BodyM')
    expect(match?.matched).toBe(2)
    expect(match?.mismatches).toEqual([{ property: 'line-height', actual: '26px', expected: '20px' }])
  })

  it('judges only the fields that were written', () => {
    const match = kit.matchTypography({ fontSize: '16px' })

    expect(match?.compared).toBe(1)
  })

  it('returns null when nothing was written', () => {
    expect(kit.matchTypography({})).toBeNull()
  })
})
