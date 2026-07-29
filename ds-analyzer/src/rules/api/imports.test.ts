import { describe, expect, it } from 'vitest'

import { resolvePaths } from '../../config.js'
import type { ImportRecord, Observations } from '../../domain/observations.js'
import { OBSERVATIONS_SCHEMA_ID } from '../../domain/observations.js'
import type { ProjectProfile } from '../../domain/profile.js'
import { A11ySpec } from '../../kit/a11y-spec.js'
import { IconSpec } from '../../kit/icon-spec.js'
import { KnowledgeSpec } from '../../kit/knowledge-spec.js'
import { KitSpec } from '../../kit/spec.js'
import { buildSpacingIndex } from '../context.js'
import { runRules } from '../index.js'
import { buildSnippet } from '../snippet.js'
import type { RawFinding, RuleContext } from '../types.js'

/**
 * The import-fix regression suite. The original bug: `actual` was the module specifier
 * (a substring) while `replaceWith` was a whole import statement, and value-scope
 * substitution nested one inside the other's quotes:
 *
 *   import { Text } from 'import { Text } from '@sds-eng/base''
 *
 * Both recommended-by-default rules shipped that into the PR pipeline. These tests pin
 * the whole path — rule → snippet → after-line — including the alias-preservation and
 * honest-refusal branches.
 */

const kit = KitSpec.load(resolvePaths().artifactsDir)

const importRecord = (overrides: Partial<ImportRecord> & Pick<ImportRecord, 'specifier'>): ImportRecord => ({
  names: [],
  defaultImport: null,
  namespaceImport: null,
  typeOnly: false,
  resolution: { kind: 'package', file: null },
  file: 'src/a.tsx',
  line: 1,
  column: 1,
  ...overrides,
})

const profile: ProjectProfile = {
  $schema: 'ds-analyzer/project-profile@1',
  root: '/tmp/x',
  scope: '',
  name: 'x',
  packageManager: 'unknown',
  monorepo: { detected: false, workspaces: [] },
  tsconfigs: [],
  aliases: [],
  kitSources: [
    { specifier: '@sds-eng/base', kind: 'package', via: [], names: [] },
    { specifier: '@v-uik/combo-box', kind: 'wrapped-upstream', via: [], names: [] },
  ],
  kitVersion: null,
  usesKit: true,
  styleSyntaxes: ['scss'],
  files: { scanned: 1, ignored: 0, unparseable: 0, byExtension: {} },
  limitations: [],
}

const contextFor = (imports: ImportRecord[], sourceLine: string): RuleContext => {
  const observations: Observations = {
    $schema: OBSERVATIONS_SCHEMA_ID,
    styleValues: [],
    jsxElements: [],
    imports,
    reExports: [],
    declarations: [],
    lintMessages: [],
    files: ['src/a.tsx'],
    limitations: [],
  }

  return {
    kit,
    icons: IconSpec.unavailable(),
    knowledge: KnowledgeSpec.unavailable(),
    svg: () => null,
    a11y: A11ySpec.unavailable(),
    profile,
    observations,
    sources: new Map([['src/a.tsx', [sourceLine]]]),
    spacing: buildSpacingIndex([]),
    elementsByFile: new Map(),
  }
}

const afterLine = (finding: { snippet: { after: string | null; highlightLine: number } }): string | null =>
  finding.snippet.after === null ? null : (finding.snippet.after.split('\n')[finding.snippet.highlightLine - 1] ?? null)

describe('import.internal — автозамена на публичную бочку', () => {
  it('rebuilds the whole line and never nests the statement into the old quotes', () => {
    const line = "import { Text } from '@sds-eng/base/src/components/Text'"
    const [finding] = runRules(
      contextFor(
        [
          importRecord({
            specifier: '@sds-eng/base/src/components/Text',
            names: [{ imported: 'Text', local: 'Text', typeOnly: false }],
          }),
        ],
        line,
      ),
    ).filter((entry) => entry.rule === 'import.internal')

    expect(finding?.autoFixable).toBe(true)
    expect(afterLine(finding!)).toBe("import { Text } from '@sds-eng/base'")
    expect(finding!.snippet.after).not.toContain("from 'import")
  })

  it('preserves aliases — dropping one breaks every use site', () => {
    const line = "import { Text as T, Button } from '@sds-eng/base/src/components';"
    const [finding] = runRules(
      contextFor(
        [
          importRecord({
            specifier: '@sds-eng/base/src/components',
            names: [
              { imported: 'Text', local: 'T', typeOnly: false },
              { imported: 'Button', local: 'Button', typeOnly: false },
            ],
          }),
        ],
        line,
      ),
    ).filter((entry) => entry.rule === 'import.internal')

    expect(afterLine(finding!)).toBe("import { Text as T, Button } from '@sds-eng/base';")
  })

  it('keeps type-only imports type-only', () => {
    const line = "import type { TextProps } from '@sds-eng/base/src/components/Text'"
    const [finding] = runRules(
      contextFor(
        [
          importRecord({
            specifier: '@sds-eng/base/src/components/Text',
            names: [{ imported: 'TextProps', local: 'TextProps', typeOnly: false }],
            typeOnly: true,
          }),
        ],
        line,
      ),
    ).filter((entry) => entry.rule === 'import.internal')

    expect(afterLine(finding!)).toBe("import type { TextProps } from '@sds-eng/base'")
  })

  it('refuses to autofix a default import — the public name is not derivable', () => {
    const line = "import Text from '@sds-eng/base/src/components/Text'"
    const [finding] = runRules(
      contextFor([importRecord({ specifier: '@sds-eng/base/src/components/Text', defaultImport: 'Text' })], line),
    ).filter((entry) => entry.rule === 'import.internal')

    expect(finding?.autoFixable).toBe(false)
    expect(finding?.needsAgent).toBe(true)
    expect(finding?.snippet.after).toBeNull()
  })
})

describe('import.bypass — замена на обёртку кита', () => {
  it('fixes the 1:1 case with the alias intact', () => {
    const line = "import { ComboBox as Picker } from '@v-uik/combo-box'"
    const [finding] = runRules(
      contextFor(
        [
          importRecord({
            specifier: '@v-uik/combo-box',
            names: [{ imported: 'ComboBox', local: 'Picker', typeOnly: false }],
          }),
        ],
        line,
      ),
    ).filter((entry) => entry.rule === 'import.bypass')

    expect(finding?.autoFixable).toBe(true)
    expect(afterLine(finding!)).toBe("import { ComboBox as Picker } from '@sds-eng/base'")
    expect(finding!.snippet.after).not.toContain("from 'import")
  })

  it('refuses when the imported name is not the wrapper — renaming would break references', () => {
    const line = "import { Autocomplete } from '@v-uik/combo-box'"
    const [finding] = runRules(
      contextFor(
        [
          importRecord({
            specifier: '@v-uik/combo-box',
            names: [{ imported: 'Autocomplete', local: 'Autocomplete', typeOnly: false }],
          }),
        ],
        line,
      ),
    ).filter((entry) => entry.rule === 'import.bypass')

    expect(finding?.autoFixable).toBe(false)
    expect(finding?.needsAgent).toBe(true)
    expect(finding?.snippet.after).toBeNull()
    // The advice survives even when the mechanical fix does not.
    expect(finding?.expected?.component).toBeTruthy()
  })
})

describe('buildSnippet — line scope', () => {
  const finding = (overrides: Partial<RawFinding> = {}): RawFinding => ({
    rule: 'import.internal',
    subkind: null,
    category: 'api',
    severity: 'error',
    confidence: 1,
    file: 'src/a.tsx',
    line: 1,
    column: 1,
    actual: '@x/deep/path',
    expected: null,
    why: '',
    note: null,
    rootCause: null,
    appliedTo: null,
    autoFixable: true,
    needsAgent: false,
    candidates: [],
    impactKey: 'x',
    replaceWith: "import { A } from '@x'",
    replaceScope: 'line',
    ...overrides,
  })

  it('keeps indentation and the trailing semicolon', () => {
    const snippet = buildSnippet(finding(), ["  import { A } from '@x/deep/path';"])
    expect(snippet.after).toBe("  import { A } from '@x';")
  })

  it('declines multi-line statements: the specifier is not on the anchor line', () => {
    const snippet = buildSnippet(finding(), ['import {', '  A,', "} from '@x/deep/path'"])
    expect(snippet.after).toBeNull()
  })

  it('value scope is untouched by the new field', () => {
    const snippet = buildSnippet(finding({ actual: '#fff', replaceWith: 'var(--x)', replaceScope: 'value' }), [
      'color: #fff;',
    ])
    expect(snippet.after).toBe('color: var(--x);')
  })
})
