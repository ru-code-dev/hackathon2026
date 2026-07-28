import { describe, expect, it } from 'vitest'

import { collectJsxA11yLint } from '../../scanner/collectors/jsx-a11y-lint.js'
import { deletionOf, lintSourceFix, occursOn } from './source-edit.js'

/**
 * The edit builders.
 *
 * What matters here is not that a fix is produced — it is that nothing is produced when the
 * source does not look the way the builder assumed. `buildSnippet` refuses to substitute
 * text it cannot find, so a wrong `actual` degrades to no diff; a *right* `actual` with a
 * wrong `replaceWith` would be applied. Every negative case below is one of those.
 */

describe('deletionOf', () => {
  it('takes the preceding space, so removal leaves no double gap', () => {
    const line = '      <ul role="list" className="items">'

    expect(deletionOf(line, 'role="list"')).toBe(' role="list"')
    expect(line.replace(deletionOf(line, 'role="list"') ?? '', '')).toBe('      <ul className="items">')
  })

  it('leaves indentation alone when the attribute opens the line', () => {
    // Only the single space *directly* before the attribute is claimed; taking the whole
    // indent would reflow the line and produce a diff nobody asked for.
    expect(deletionOf('  role="list"', 'role="list"')).toBe(' role="list"')
  })

  it('declines when the attribute is not written the way it was resolved', () => {
    // `role={ROLE}` resolves to a string in the observations but is not that string in the
    // source. No match, no diff — the finding still stands, it simply carries no patch.
    expect(deletionOf('<ul role={LIST_ROLE}>', 'role="list"')).toBeNull()
    expect(deletionOf(undefined, 'role="list"')).toBeNull()
  })
})

describe('occursOn', () => {
  it('is the precondition for claiming a finding is auto-fixable', () => {
    expect(occursOn('<div role="buton">', 'role="buton"')).toBe(true)
    expect(occursOn("<div role='buton'>", 'role="buton"')).toBe(false)
    expect(occursOn(undefined, 'role="buton"')).toBe(false)
  })
})

describe('lintSourceFix', () => {
  /** Column as the linter reports it: 1-based, at the attribute. */
  const at = (line: string, needle: string): number => line.indexOf(needle) + 1

  describe('tabindex-no-positive', () => {
    it('rewrites the value to zero and keeps the file’s own quoting', () => {
      const braces = '  <a tabIndex={3}>x</a>'
      const quotes = '  <a tabIndex="3">x</a>'

      expect(lintSourceFix('tabindex-no-positive', braces, at(braces, 'tabIndex'))).toStrictEqual({
        actual: 'tabIndex={3}',
        replaceWith: 'tabIndex={0}',
      })
      expect(lintSourceFix('tabindex-no-positive', quotes, at(quotes, 'tabIndex'))).toStrictEqual({
        actual: 'tabIndex="3"',
        replaceWith: 'tabIndex="0"',
      })
    })

    it('preserves the spacing that was there', () => {
      const line = '<a tabIndex = { 42 }>'

      expect(lintSourceFix('tabindex-no-positive', line, at(line, 'tabIndex'))?.replaceWith).toBe('tabIndex = {0}')
    })

    it('declines a value it cannot read', () => {
      // `tabIndex={index + 1}` is positive in the linter's judgement but has no literal to
      // rewrite. Substituting `{0}` here would silently delete the author's logic.
      const dynamic = '<a tabIndex={index + 1}>'

      expect(lintSourceFix('tabindex-no-positive', dynamic, at(dynamic, 'tabIndex'))).toBeNull()
    })
  })

  describe('no-autofocus', () => {
    it('deletes the attribute with its preceding space', () => {
      const line = '  <input autoFocus className="q" />'

      expect(lintSourceFix('no-autofocus', line, at(line, 'autoFocus'))).toStrictEqual({
        actual: ' autoFocus',
        replaceWith: '',
      })
    })

    it('deletes the value along with the attribute', () => {
      const line = '<input autoFocus={true} />'

      expect(lintSourceFix('no-autofocus', line, at(line, 'autoFocus'))?.actual).toBe(' autoFocus={true}')
    })
  })

  it('offers nothing for rules whose remedy needs a human', () => {
    // The correct alt text is not derivable from the source, and a plausible-looking one
    // would be worse than none.
    const line = '<img src="a.png" />'

    expect(lintSourceFix('alt-text', line, 1)).toBeNull()
    expect(lintSourceFix('label-has-associated-control', line, 1)).toBeNull()
  })

  it('reads the column the way the real linter reports it', () => {
    // The builders are anchored at `column - 1`, which assumes the plugin points at the
    // start of the offending attribute. That assumption is the plugin's to change, and if
    // it ever does every diff here would silently stop being produced. Pinning it against
    // the actual linter is the only way that failure announces itself.
    const lines = [
      'export const W = () => (',
      '  <div>',
      '    <a href="/x" tabIndex={3}>go</a>',
      '    <input autoFocus name="q" />',
      '  </div>',
      ')',
    ]

    const patched = collectJsxA11yLint({ file: 'src/W.tsx', content: lines.join('\n') }).messages.map((message) => {
      const line = lines[message.line - 1] ?? ''
      const fix = lintSourceFix(message.rule, line, message.column)

      return fix === null ? null : line.replace(fix.actual, fix.replaceWith)
    })

    expect(patched).toStrictEqual(['    <a href="/x" tabIndex={0}>go</a>', '    <input name="q" />'])
  })

  it('declines a column that does not land on the attribute', () => {
    // Guards the anchoring: without it the regex would scan forward and could rewrite a
    // different attribute further along the line.
    const line = '<a href="/x" tabIndex={3}>'

    expect(lintSourceFix('tabindex-no-positive', line, 1)).toBeNull()
    expect(lintSourceFix('tabindex-no-positive', line, 0)).toBeNull()
    expect(lintSourceFix('tabindex-no-positive', line, line.length + 5)).toBeNull()
    expect(lintSourceFix('tabindex-no-positive', undefined, 3)).toBeNull()
  })
})
