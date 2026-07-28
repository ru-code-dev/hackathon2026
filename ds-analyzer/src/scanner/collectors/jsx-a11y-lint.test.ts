import { describe, expect, it } from 'vitest'

import { collectJsxA11yLint, jsxA11yRuleIds } from './jsx-a11y-lint.js'

/**
 * The adapter around the canonical linter.
 *
 * What these pin is the boundary, not the plugin's own correctness — that is the plugin's
 * job and it does it better than a copy here would. The boundary is where this project has
 * already been bitten twice: by messages that are not accessibility problems, and by a
 * config that matched no files and so linted nothing while reporting success.
 */

const lint = (code: string, file = 'src/Widget.tsx') => collectJsxA11yLint({ file, content: code })

const rulesFired = (code: string, file?: string) =>
  lint(code, file)
    .messages.map((message) => message.rule)
    .sort()

describe('collectJsxA11yLint', () => {
  it('runs the plugin’s rules', () => {
    expect(rulesFired('export const W = () => <img src="a.png" />')).toContain('alt-text')
  })

  it('lints every extension the scanner walks', () => {
    // A config whose `files` pattern matches nothing reports "no matching configuration"
    // for each file and finds zero problems — indistinguishable from clean code.
    for (const file of ['src/W.tsx', 'src/W.jsx', 'src/W.js']) {
      expect(lint('export const W = () => <img src="a.png" />', file).limitations).toStrictEqual([])
    }

    // JSX is not valid in `.ts`, where `<img` is a type assertion. Those files still have to
    // be accepted and linted; they simply contain no JSX to report on.
    for (const file of ['src/W.ts', 'src/W.mts', 'src/W.cts']) {
      const result = lint('export const value = 1', file)

      expect(result.limitations).toStrictEqual([])
      expect(result.messages).toStrictEqual([])
    }
  })

  it('reports position so a finding can point at the right line', () => {
    const [message] = lint('const a = 1\nexport const W = () => <img src="a.png" />').messages

    expect(message?.line).toBe(2)
    expect(message?.column).toBeGreaterThan(0)
  })

  it('ignores reports that are not accessibility problems', () => {
    // A disable directive naming an unconfigured rule makes ESLint emit "Definition for
    // rule … was not found" *under that rule's id*. On the kit, 134 of 175 reports were
    // unused variables and hook ordering dressed up as accessibility findings.
    const code = [
      '/* eslint-disable @typescript-eslint/no-unused-vars */',
      '/* eslint-disable react-hooks/rules-of-hooks */',
      'export const W = () => <img src="a.png" />',
    ].join('\n')

    expect(rulesFired(code)).toStrictEqual(['alt-text'])
  })

  it('does not adopt the audited project’s own suppressions', () => {
    // A project that switched a rule off is exactly the project whose report must mention
    // it, so the config is built in memory and never resolved from disk.
    const code = ['/* eslint-disable jsx-a11y/alt-text */', 'export const W = () => <img src="a.png" />'].join('\n')

    expect(rulesFired(code)).toStrictEqual(['alt-text'])
  })

  it('records a parse failure instead of throwing', () => {
    const result = lint('export const W = () => <div>{{{{')

    expect(result.messages).toStrictEqual([])
    expect(result.limitations[0]?.reason).toBe('parse-error')
  })

  it('runs neither deprecated rules nor ones this project decides better itself', () => {
    const ids = jsxA11yRuleIds()

    for (const deprecated of ['accessible-emoji', 'label-has-for', 'no-onchange']) {
      expect(ids).not.toContain(deprecated)
    }

    // `a11y.aria.invalid` and `a11y.name.missing` answer these with the ARIA model and with
    // accname reasoning; two findings on one line disagreeing about the fix is worse than
    // one.
    for (const superseded of [
      'aria-props',
      'aria-role',
      'role-has-required-aria-props',
      'control-has-associated-label',
    ]) {
      expect(ids).not.toContain(superseded)
    }
  })

  it('runs a substantial rule set', () => {
    // Guards against the config silently collapsing to a handful of rules.
    expect(jsxA11yRuleIds().length).toBeGreaterThan(25)
  })

  it('is deterministic', () => {
    const code = 'export const W = () => <div onClick={f}><img src="a.png" /><a tabIndex={3}>x</a></div>'

    expect(JSON.stringify(lint(code))).toBe(JSON.stringify(lint(code)))
  })
})
