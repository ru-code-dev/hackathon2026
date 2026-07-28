import { describe, expect, it } from 'vitest'

import { normalizeShapeData, svgFingerprint } from './fingerprint.js'

/**
 * The fingerprint decides whether the report says "the kit has exactly this icon". A false
 * match sends someone to replace an icon with a different one; the invariances (attribute
 * order, precision, metadata) and the refusals (no geometry, different geometry) are
 * pinned here.
 */

describe('normalizeShapeData', () => {
  it('canonicalizes separators and precision', () => {
    expect(normalizeShapeData('M 8.0006,7.9994 L16.00 0')).toBe(normalizeShapeData('M8 8L16 0'))
  })

  it('keeps genuinely different coordinates apart', () => {
    expect(normalizeShapeData('M8 8')).not.toBe(normalizeShapeData('M8 9'))
  })
})

describe('svgFingerprint', () => {
  const search = '<svg viewBox="0 0 16 16"><path d="M11 11L15 15M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Z"/></svg>'

  it('is invariant under markup noise: attribute order, metadata, precision', () => {
    const reExported = [
      '<svg width="16.000000" height="16.000000" fill="none" viewBox="0 0 16 16">',
      '<desc>Created with Pixso.</desc>',
      '<path fill-rule="evenodd" d="M 11.0 11.00 L 15,15 M 7 12 A 5 5 0 1 0 7 2 a 5 5 0 0 0 0 10 Z" fill="#000"/>',
      '</svg>',
    ].join('\n\t')

    expect(svgFingerprint(reExported)?.fingerprint).toBe(svgFingerprint(search)?.fingerprint)
  })

  it('distinguishes different geometry', () => {
    const cross = '<svg viewBox="0 0 16 16"><path d="M2 2L14 14M14 2L2 14"/></svg>'

    expect(svgFingerprint(cross)?.fingerprint).not.toBe(svgFingerprint(search)?.fingerprint)
  })

  it('reads basic shapes, not only paths', () => {
    const circle = '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>'
    const sameCircle = '<svg viewBox="0 0 20 20"><circle r="8.00" cy="10.0" cx="10"/></svg>'
    const otherCircle = '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6"/></svg>'

    expect(svgFingerprint(circle)?.fingerprint).toBe(svgFingerprint(sameCircle)?.fingerprint)
    expect(svgFingerprint(circle)?.fingerprint).not.toBe(svgFingerprint(otherCircle)?.fingerprint)
  })

  it('works on inline JSX that is not valid XML', () => {
    const jsx =
      '<svg viewBox="0 0 16 16" className={styles.spin} aria-hidden><path d="M11 11L15 15M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Z" stroke={color} /></svg>'

    expect(svgFingerprint(jsx)?.fingerprint).toBe(svgFingerprint(search)?.fingerprint)
  })

  it('refuses to fingerprint an svg with no static geometry', () => {
    expect(svgFingerprint('<svg viewBox="0 0 16 16">{children}</svg>')).toBeNull()
  })

  it('normalizes the viewBox and counts shapes', () => {
    const geometry = svgFingerprint(search)

    expect(geometry?.viewBox).toBe('0 0 16 16')
    expect(geometry?.shapeCount).toBe(1)
  })
})
