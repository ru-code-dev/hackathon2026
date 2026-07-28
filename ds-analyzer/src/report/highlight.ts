import { createHighlighter, type Highlighter } from 'shiki'

import { extensionOf } from '../shared/path.js'

/**
 * Syntax highlighting, performed once when the report is generated.
 *
 * Shiki ships TextMate grammars and weighs several megabytes; loading it in the browser to
 * colour a few hundred five-line snippets would dwarf everything else in the file. But the
 * highlighting is static — the code never changes after the report is written — so it runs
 * here, in Node, and the dashboard receives finished HTML.
 *
 * The result is VS Code-grade accuracy at zero runtime cost, which is the whole trade.
 */

/** Grammars actually needed. Loading the full set would cost seconds per run. */
const LANGUAGES = ['tsx', 'typescript', 'javascript', 'scss', 'css', 'less'] as const

type Language = (typeof LANGUAGES)[number]

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, Language>> = {
  '.tsx': 'tsx',
  '.jsx': 'tsx',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.scss': 'scss',
  '.sass': 'scss',
  '.css': 'css',
  '.less': 'less',
}

export const languageFor = (file: string): Language => LANGUAGE_BY_EXTENSION[extensionOf(file)] ?? 'typescript'

export interface CodeHighlighter {
  readonly toHtml: (code: string, file: string) => string
  /** `<style>` rules for the classes {@link CodeHighlighter.toHtml} emits. */
  readonly stylesheet: () => string
  readonly dispose: () => void
}

/**
 * Inline colours are folded into shared classes.
 *
 * Shiki emits `style="color:#79C0FF"` on every token. Across a large report that is the
 * single biggest thing in the file — the kit's own repository produced 8.4 MB of it — even
 * though a real theme uses a few dozen distinct colours. Hoisting them into a class table
 * cuts the highlighted markup by roughly four times and changes nothing about how it looks.
 */
class ColorTable {
  private readonly classByColor = new Map<string, string>()

  classFor(color: string): string {
    const existing = this.classByColor.get(color)
    if (existing !== undefined) {
      return existing
    }

    const name = `sk${this.classByColor.size.toString(36)}`
    this.classByColor.set(color, name)
    return name
  }

  toCss(): string {
    return [...this.classByColor.entries()].map(([color, name]) => `.${name}{color:${color}}`).join('')
  }
}

/** `style="color:#X"` → `class="skN"`, leaving every other attribute alone. */
const foldColors = (html: string, table: ColorTable): string =>
  html.replace(/ style="color:(#[0-9a-fA-F]{3,8})"/g, (_, color: string) => ` class="${table.classFor(color)}"`)

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Builds a highlighter for the whole run.
 *
 * `github-dark-default` because the dashboard is dark by default and a theme that fights
 * the surrounding surface makes code harder to read, not easier.
 */
export const createCodeHighlighter = async (): Promise<CodeHighlighter> => {
  let highlighter: Highlighter | null = null

  try {
    highlighter = await createHighlighter({ themes: ['github-dark-default'], langs: [...LANGUAGES] })
  } catch {
    // Highlighting is a nicety. A report with plain code beats no report at all.
    highlighter = null
  }

  const table = new ColorTable()

  return {
    toHtml: (code, file) => {
      if (highlighter === null) {
        return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`
      }

      try {
        const html = highlighter.codeToHtml(code, { lang: languageFor(file), theme: 'github-dark-default' })
        return foldColors(html, table)
      } catch {
        // A snippet the grammar chokes on still has to reach the reader.
        return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`
      }
    },
    stylesheet: () => table.toCss(),
    dispose: () => {
      highlighter?.dispose()
    },
  }
}
