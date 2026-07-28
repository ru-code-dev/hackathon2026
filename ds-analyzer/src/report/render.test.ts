import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { analyze } from '../analyze.js'
import { analyzerRoot, resolvePaths } from '../config.js'
import type { AnalysisArtifact, Finding } from '../domain/findings.js'
import type { ProjectProfile } from '../domain/profile.js'
import { KitSpec } from '../kit/spec.js'
import { scanProject } from '../scanner/scan.js'
import { DASHBOARD_TEMPLATE, renderDashboard } from './render.js'

/**
 * The report generator, end to end against the real demo project.
 *
 * The dashboard cannot be asserted on visually here, so what is checked is the contract
 * between the two halves: that the payload arrives intact, that it survives being embedded
 * in HTML, and that the file stays openable. Those are the failures that would be silent
 * — a broken payload renders as an empty dashboard, not as an error.
 */

const DEMO_APP = resolve(analyzerRoot, '..', 'demo-app')

const templateBuilt = existsSync(DASHBOARD_TEMPLATE)

const extractPayload = (html: string): Record<string, unknown> => {
  const match = /<script type="application\/json" id="ds-data">([\s\S]*?)<\/script>/.exec(html)

  if (match?.[1] === undefined) {
    throw new Error('payload element missing from the rendered document')
  }

  return JSON.parse(match[1]) as Record<string, unknown>
}

describe.skipIf(!templateBuilt)('renderDashboard', () => {
  let profile: ProjectProfile
  let analysis: AnalysisArtifact
  let html: string

  beforeAll(async () => {
    const kit = KitSpec.load(resolvePaths().artifactsDir)
    const scan = scanProject({ path: DEMO_APP })

    profile = scan.profile
    analysis = analyze({ kit, profile, observations: scan.observations })
    html = await renderDashboard({ profile, analysis, generatedAt: '2026-07-28' })
  }, 120_000)

  it('substitutes the payload into the template', () => {
    expect(html).not.toContain('<script type="application/json" id="ds-data">null</script>')
    expect(html.startsWith('<!doctype html>')).toBe(true)
  })

  it('delivers every finding intact', () => {
    const payload = extractPayload(html)
    const findings = payload['findings'] as Finding[]

    expect(findings).toHaveLength(analysis.findings.length)
    expect(findings[0]?.id).toBe(analysis.findings[0]?.id)
    expect(findings.every((finding) => typeof finding.why === 'string' && finding.why.length > 0)).toBe(true)
  })

  it('pre-renders syntax highlighting so the browser does none', () => {
    const findings = extractPayload(html)['findings'] as (Finding & { snippet: { beforeHtml: string } })[]

    expect(findings.every((finding) => finding.snippet.beforeHtml.includes('class="shiki'))).toBe(true)
    // Shiki is a build-time dependency; none of it may reach the document.
    expect(html).not.toContain('shiki/dist')
  })

  it('carries the summary and the usage statistics', () => {
    const payload = extractPayload(html)

    expect(payload['summary']).toMatchObject({ healthScore: analysis.summary.healthScore })
    expect((payload['usage'] as { components: unknown[] }).components.length).toBe(analysis.usage.components.length)
  })

  it('names every rule it reports', () => {
    const payload = extractPayload(html)
    const descriptions = payload['ruleDescriptions'] as Record<string, string>

    for (const rule of Object.keys(analysis.summary.findings.byRule)) {
      expect(descriptions[rule], rule).toBeTypeOf('string')
    }
  })

  it('escapes a closing script tag hiding inside a code snippet', async () => {
    // A snippet containing `</script>` would otherwise terminate the data element early
    // and produce a file that renders as garbage with no error anywhere.
    const [firstFinding] = analysis.findings

    if (firstFinding === undefined) {
      throw new Error('the demo project must produce at least one finding')
    }

    const poisoned: AnalysisArtifact = {
      ...analysis,
      findings: [
        {
          ...firstFinding,
          snippet: {
            before: 'const html = "</script><h1>owned</h1>"',
            after: null,
            highlightLine: 1,
            startLine: 1,
          },
        },
      ],
    }

    const rendered = await renderDashboard({ profile, analysis: poisoned, generatedAt: '2026-07-28' })
    const findings = extractPayload(rendered)['findings'] as Finding[]

    expect(findings).toHaveLength(1)
    expect(findings[0]?.snippet.before).toContain('</script>')
  })

  it('stays small enough to open by double-clicking', () => {
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(2 * 1024 * 1024)
  })

  it('is deterministic for a fixed timestamp', async () => {
    const again = await renderDashboard({ profile, analysis, generatedAt: '2026-07-28' })

    expect(again).toBe(html)
  })
})
