import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { analyzerRoot } from '../config.js'
import type { AnalysisArtifact, Finding, Usage } from '../domain/findings.js'
import type { ProjectProfile } from '../domain/profile.js'
import { RULES } from '../rules/index.js'
import { ExtractionError } from '../shared/errors.js'
import { createCodeHighlighter } from './highlight.js'

/**
 * Stage D: turn the analysis into one self-contained HTML file.
 *
 * The dashboard is a pre-built artifact. Generating a report substitutes a JSON payload
 * into it — no bundler, no `npm install`, no network. That is deliberate: an audit tool
 * that requires a working front-end toolchain on the machine being audited is an audit
 * tool nobody runs.
 */

/** Where `dashboard/npm run build` leaves its output. */
export const DASHBOARD_TEMPLATE = join(analyzerRoot, 'dashboard', 'dist', 'index.html')

const PLACEHOLDER = /(<script type="application\/json" id="ds-data">)[\s\S]*?(<\/script>)/

/** Custom components that get Shiki-highlighted snippets; the rest render as plain text. */
const HIGHLIGHTED_CUSTOM_COMPONENTS = 150

/**
 * Escapes the payload for embedding in a `<script>` element.
 *
 * A `</script>` sequence anywhere inside the JSON — in a code snippet, say — would close
 * the element early and produce a file that renders as garbage. Escaping the `<` is the
 * standard remedy and survives `JSON.parse` untouched.
 */
const embed = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

/**
 * The override rule emits four rule ids from one registry entry, because the verdict
 * depends on what is inside the class rather than on which rule ran.
 */
const OVERRIDE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'style.override.repaint': 'Перекраска компонента кита снаружи',
  'style.override.size': 'Внутренние отступы компонента заданы снаружи',
  'style.override.inner': 'Стилизация приватного (@inner) слота',
  'style.override.important': '!important поверх стилей кита',
}

export interface RenderInput {
  readonly profile: ProjectProfile
  readonly analysis: AnalysisArtifact
  /** Stamped into the header. Passed in so the renderer stays deterministic. */
  readonly generatedAt: string
  /** CI coordinates from `ds.config.json`, for the dashboard's "create PR" flow. */
  /**
   * Optional properties are spelled `| undefined` because `exactOptionalPropertyTypes` is
   * on: zod's `.optional()` produces `string | undefined`, and a bare `?:` will not accept
   * it. Widening here rather than at the call site keeps `ds.config.json` the single source
   * of the shape.
   */
  readonly ci?: {
    webhookUrl?: string | undefined
    repositoryUrl?: string | undefined
    targetBranch?: string | undefined
  } | null
}

/**
 * Adds pre-highlighted markup to each finding's snippet.
 *
 * Only the *before* side is highlighted. The diff view renders both sides itself from the
 * plain text, so a highlighted `after` would be markup nothing ever reads — and on a large
 * report the highlighted markup is the biggest thing in the file.
 */
const withHighlighting = async (
  findings: readonly Finding[],
  usage: Usage,
): Promise<{ readonly findings: unknown[]; readonly usage: unknown; readonly stylesheet: string }> => {
  const highlighter = await createCodeHighlighter()

  try {
    const highlighted = findings.map((finding) => ({
      ...finding,
      snippet: {
        ...finding.snippet,
        beforeHtml: highlighter.toHtml(finding.snippet.before, finding.file),
        afterHtml: null,
      },
    }))

    // Auditing the kit against itself yields one custom component per kit component, and
    // highlighted markup for all of them added five megabytes to that report. Colouring is
    // capped; the code itself ships for every component and renders as plain text past the
    // cap, so nothing is hidden — only decoration is bounded.
    const highlightedUsage = {
      ...usage,
      customComponents: usage.customComponents.map((component, index) => ({
        ...component,
        snippetHtml:
          component.snippet.length > 0 && index < HIGHLIGHTED_CUSTOM_COMPONENTS
            ? highlighter.toHtml(component.snippet, component.file)
            : '',
      })),
    }

    return { findings: highlighted, usage: highlightedUsage, stylesheet: highlighter.stylesheet() }
  } finally {
    highlighter.dispose()
  }
}

/** Produces the finished HTML document. */
export const renderDashboard = async (input: RenderInput): Promise<string> => {
  if (!existsSync(DASHBOARD_TEMPLATE)) {
    throw new ExtractionError(
      `Dashboard template not found at ${DASHBOARD_TEMPLATE}. Build it once with: cd dashboard && npm install && npm run build`,
    )
  }

  const template = await readFile(DASHBOARD_TEMPLATE, 'utf8')

  if (!PLACEHOLDER.test(template)) {
    throw new ExtractionError('Dashboard template has no ds-data placeholder; rebuild it from dashboard/index.html.')
  }

  const highlighted = await withHighlighting(input.analysis.findings, input.analysis.usage)

  const payload = {
    project: {
      name: input.profile.name,
      root: input.profile.root,
      kitVersion: input.profile.kitVersion,
      usesKit: input.profile.usesKit,
    },
    generatedAt: input.generatedAt,
    ci: input.ci ?? null,
    summary: input.analysis.summary,
    usage: highlighted.usage,
    findings: highlighted.findings,
    ruleDescriptions: {
      ...Object.fromEntries(RULES.map((rule) => [rule.id, rule.description])),
      ...OVERRIDE_DESCRIPTIONS,
    },
  }

  return template
    .replace(PLACEHOLDER, `$1${embed(payload)}$2`)
    .replace('</head>', `<style id="ds-syntax">${highlighted.stylesheet}</style></head>`)
}
