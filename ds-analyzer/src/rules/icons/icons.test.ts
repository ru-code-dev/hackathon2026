import { describe, expect, it } from 'vitest'

import { resolvePaths } from '../../config.js'
import type { ImportRecord, JsxElement, Observations, StyleValue } from '../../domain/observations.js'
import { OBSERVATIONS_SCHEMA_ID } from '../../domain/observations.js'
import type { KitIconsArtifact } from '../../domain/kit-icons.js'
import type { ProjectProfile } from '../../domain/profile.js'
import { svgFingerprint } from '../../icons/fingerprint.js'
import { A11ySpec } from '../../kit/a11y-spec.js'
import { IconSpec } from '../../kit/icon-spec.js'
import { KnowledgeSpec } from '../../kit/knowledge-spec.js'
import { KitSpec } from '../../kit/spec.js'
import { buildSpacingIndex } from '../context.js'
import type { RuleContext } from '../types.js'
import { foreignIconPackRule, foreignSvgFileRule, inlineSvgRule } from './icons.js'

/**
 * The icon rules in isolation.
 *
 * What matters is the verdict boundary: "the kit draws exactly this" must be an exact
 * geometry match and nothing weaker, and everything the rules cannot know — unavailable
 * icon set, unresolvable file, expression-built paths — must degrade to the honest verdict
 * rather than a guess.
 */

const kit = KitSpec.load(resolvePaths().artifactsDir)

const SEARCH_MARKUP = '<svg viewBox="0 0 16 16"><path d="M11 11L15 15M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Z"/></svg>'
const SEARCH_GEOMETRY = svgFingerprint(SEARCH_MARKUP)

const iconsArtifact = (): KitIconsArtifact => ({
  $schema: 'ds-analyzer/kit-icons@1',
  meta: { counts: { icons: 1, files: 1, unreadable: 0 } },
  icons: [
    {
      name: 'Search',
      variants: [
        {
          size: 16,
          viewBox: '0 0 16 16',
          fingerprint: SEARCH_GEOMETRY?.fingerprint ?? '',
          paths: [...(SEARCH_GEOMETRY?.shapes ?? [])],
        },
      ],
    },
  ],
  legacyComponents: ['Icon'],
})

const icons = IconSpec.from(iconsArtifact())

const profile: ProjectProfile = {
  $schema: 'ds-analyzer/project-profile@1',
  root: '/tmp/x',
  scope: '',
  name: 'x',
  packageManager: 'unknown',
  monorepo: { detected: false, workspaces: [] },
  tsconfigs: [],
  aliases: [],
  kitSources: [{ specifier: '@sds-eng/base', kind: 'package', via: [], names: [] }],
  kitVersion: null,
  usesKit: true,
  styleSyntaxes: ['scss'],
  files: { scanned: 1, ignored: 0, unparseable: 0, byExtension: {} },
  limitations: [],
}

const element = (overrides: Partial<JsxElement>): JsxElement => ({
  name: 'svg',
  resolvedFrom: null,
  kitComponent: null,
  props: {},
  propExpressions: {},
  eventHandlers: [],
  keysHandled: [],
  content: { text: false, expression: false, component: false },
  hasLabelAncestor: false,
  propLines: {},
  styleRefs: [],
  hasInlineStyle: false,
  file: 'src/Icon.tsx',
  line: 1,
  column: 1,
  ...overrides,
})

const importRecord = (overrides: Partial<ImportRecord> & Pick<ImportRecord, 'specifier'>): ImportRecord => ({
  names: [],
  defaultImport: 'icon',
  namespaceImport: null,
  typeOnly: false,
  resolution: { kind: 'relative', file: null },
  file: 'src/App.tsx',
  line: 3,
  column: 1,
  ...overrides,
})

const styleValue = (overrides: Partial<StyleValue> & Pick<StyleValue, 'property' | 'value'>): StyleValue => ({
  authored: null,
  file: 'src/a.scss',
  line: 4,
  column: 3,
  source: 'scss',
  selector: '.a',
  classNames: ['a'],
  important: false,
  dynamic: false,
  rootCause: null,
  appliedTo: null,
  ...overrides,
})

const contextFor = (
  extra: Partial<Observations>,
  options: {
    icons?: IconSpec
    sources?: Map<string, string[]>
    svg?: (from: string, ref: string) => string | null
  } = {},
): RuleContext => {
  const observations: Observations = {
    $schema: OBSERVATIONS_SCHEMA_ID,
    styleValues: [],
    jsxElements: [],
    imports: [],
    reExports: [],
    declarations: [],
    lintMessages: [],
    files: ['src/Icon.tsx'],
    limitations: [],
    ...extra,
  }

  return {
    kit,
    icons: options.icons ?? icons,
    knowledge: KnowledgeSpec.unavailable(),
    svg: options.svg ?? (() => null),
    a11y: A11ySpec.unavailable(),
    profile,
    observations,
    sources: options.sources ?? new Map(),
    spacing: buildSpacingIndex(observations.styleValues),
    elementsByFile: new Map(),
  } satisfies RuleContext
}

describe('icon.inline-svg', () => {
  const sourcesWith = (markup: string): Map<string, string[]> => new Map([['src/Icon.tsx', markup.split('\n')]])

  it('names the kit icon on an exact geometry match, whatever the markup noise', () => {
    const noisy = [
      'export const Find = () => (',
      '  <svg width="16" height="16" fill="none" viewBox="0 0 16 16">',
      '    <path fill-rule="evenodd" d="M 11,11 L 15 15 M7 12 A5 5 0 1 0 7 2 a5 5 0 0 0 0 10 Z" fill="#000" />',
      '  </svg>',
      ')',
    ].join('\n')

    const findings = inlineSvgRule.run(
      contextFor({ jsxElements: [element({ line: 2 })] }, { sources: sourcesWith(noisy) }),
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('kit-icon')
    expect(findings[0]?.severity).toBe('warning')
    expect(findings[0]?.expected?.component).toBe('Search')
    expect(findings[0]?.impactKey).toBe('icon.inline-svg:Search')
  })

  it('degrades to a design-system candidate when the geometry is unknown to the kit', () => {
    const foreign = '<svg viewBox="0 0 16 16"><path d="M2 2L14 14M14 2L2 14"/></svg>'

    const findings = inlineSvgRule.run(contextFor({ jsxElements: [element({})] }, { sources: sourcesWith(foreign) }))

    expect(findings[0]?.subkind).toBe('no-match')
    expect(findings[0]?.severity).toBe('candidate')
    expect(findings[0]?.expected).toBeNull()
  })

  it('never claims a match for an svg drawn from expressions', () => {
    const dynamic = '<svg viewBox="0 0 16 16"><path d={pathFor(status)} /></svg>'

    const findings = inlineSvgRule.run(contextFor({ jsxElements: [element({})] }, { sources: sourcesWith(dynamic) }))

    expect(findings[0]?.subkind).toBe('no-match')
  })

  it('stays silent when the icon set has not been extracted', () => {
    const findings = inlineSvgRule.run(
      contextFor(
        { jsxElements: [element({})] },
        { icons: IconSpec.unavailable(), sources: sourcesWith(SEARCH_MARKUP) },
      ),
    )

    expect(findings).toHaveLength(0)
  })
})

describe('icon.foreign-file', () => {
  it('matches an imported svg file against the kit set', () => {
    const findings = foreignSvgFileRule.run(
      contextFor({ imports: [importRecord({ specifier: './search.svg' })] }, { svg: () => SEARCH_MARKUP }),
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('kit-icon')
    expect(findings[0]?.expected?.component).toBe('Search')
  })

  it('treats an unresolvable svg reference as a candidate, not a match', () => {
    const findings = foreignSvgFileRule.run(
      contextFor({ imports: [importRecord({ specifier: '@assets/logo.svg' })] }, { svg: () => null }),
    )

    expect(findings[0]?.subkind).toBe('no-match')
    expect(findings[0]?.expected).toBeNull()
  })

  it('sees icons referenced from CSS url()', () => {
    const findings = foreignSvgFileRule.run(
      contextFor(
        { styleValues: [styleValue({ property: 'background-image', value: "url('../icons/search.svg')" })] },
        { svg: () => SEARCH_MARKUP },
      ),
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]?.subkind).toBe('kit-icon')
    expect(findings[0]?.actual).toBe('../icons/search.svg')
  })

  it('ignores non-svg imports entirely', () => {
    const findings = foreignSvgFileRule.run(contextFor({ imports: [importRecord({ specifier: './logo.png' })] }))

    expect(findings).toHaveLength(0)
  })
})

describe('icon.foreign-pack', () => {
  it('reports icon libraries, including subpath imports', () => {
    const findings = foreignIconPackRule.run(
      contextFor({
        imports: [importRecord({ specifier: 'react-icons/fa' }), importRecord({ specifier: 'lucide-react' })],
      }),
    )

    expect(findings.map((finding) => finding.impactKey)).toEqual([
      'icon.foreign-pack:react-icons',
      'icon.foreign-pack:lucide-react',
    ])
  })

  it('does not confuse a package that merely starts with a pack name', () => {
    const findings = foreignIconPackRule.run(
      contextFor({ imports: [importRecord({ specifier: 'react-icons-extra' })] }),
    )

    expect(findings).toHaveLength(0)
  })
})
