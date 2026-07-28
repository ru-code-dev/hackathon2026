import { useState } from 'react'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'

import { SEVERITY_LABEL, type Finding } from '../data.js'
import { Badge, Button, CopyButton, cx, SEVERITY_DOT } from './ui.js'

/**
 * One finding, in the two states a reader needs.
 *
 * Collapsed it is a line: severity, rule, location, value. Expanded it has to answer
 * "what exactly, and what instead" without leaving the page, which is why the diff, the
 * explanation, the caveat and the copy button all live here rather than behind a further
 * click.
 *
 * The diff uses `react-diff-viewer-continued` — word-level highlighting inside a changed
 * line is what makes a one-character colour difference visible at all, and that is
 * precisely the case this tool exists to surface.
 */

const DIFF_STYLES = {
  variables: {
    dark: {
      diffViewerBackground: 'transparent',
      diffViewerColor: 'var(--color-fg)',
      addedBackground: 'color-mix(in oklch, var(--color-ok) 16%, transparent)',
      addedColor: 'var(--color-fg)',
      removedBackground: 'color-mix(in oklch, var(--color-error) 16%, transparent)',
      removedColor: 'var(--color-fg)',
      wordAddedBackground: 'color-mix(in oklch, var(--color-ok) 34%, transparent)',
      wordRemovedBackground: 'color-mix(in oklch, var(--color-error) 34%, transparent)',
      gutterBackground: 'transparent',
      gutterColor: 'var(--color-faint)',
      addedGutterBackground: 'transparent',
      removedGutterBackground: 'transparent',
      codeFoldBackground: 'var(--color-surface-2)',
      emptyLineBackground: 'transparent',
      gutterBackgroundDark: 'transparent',
    },
  },
  line: { fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.55' },
  gutter: { minWidth: '2.2em', padding: '0 6px' },
  contentText: { fontFamily: 'var(--font-mono)' },
} as const

/** Shiki output, pre-rendered at generation time — nothing is highlighted in the browser. */
const Highlighted = ({ html }: { html: string }): React.ReactElement => (
  <div className="overflow-x-auto px-3 py-2" dangerouslySetInnerHTML={{ __html: html }} />
)

export const FindingCard = ({
  finding,
  expanded,
  onToggle,
  onDrill,
}: {
  finding: Finding
  expanded: boolean
  onToggle: () => void
  onDrill: (patch: { rule?: string; subkind?: string; file?: string }) => void
}): React.ReactElement => {
  const [showAfter, setShowAfter] = useState(true)
  const hasDiff = finding.snippet.after !== null

  return (
    <article
      className={cx(
        'rounded-[var(--radius-card)] border bg-surface transition-colors',
        expanded ? 'border-border-strong' : 'border-border hover:border-border-strong',
      )}
    >
      <header className="flex cursor-pointer items-center gap-2 px-3 py-2" onClick={onToggle}>
        <span className={cx('size-1.5 shrink-0 rounded-full', SEVERITY_DOT[finding.severity])} />

        <button
          type="button"
          className="shrink-0 font-mono text-[11px] text-muted hover:text-fg"
          onClick={(event) => {
            event.stopPropagation()
            onDrill({ rule: finding.rule, ...(finding.subkind === null ? {} : { subkind: finding.subkind }) })
          }}
        >
          {finding.rule}
          {finding.subkind !== null && <span className="text-faint">/{finding.subkind}</span>}
        </button>

        <code className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg">
          {finding.actual}
        </code>

        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-faint hover:text-muted"
          onClick={(event) => {
            event.stopPropagation()
            onDrill({ file: finding.file })
          }}
        >
          {finding.file}:{finding.line}
        </button>

        {finding.impact.occurrences > 1 && (
          <Badge>
            {finding.impact.occurrences}× в {finding.impact.files} файл.
          </Badge>
        )}
        {finding.autoFixable && <Badge tone="ok">авто-фикс</Badge>}
        {finding.needsAgent && <Badge tone="candidate">🤖</Badge>}
      </header>

      {expanded && (
        <div className="ds-enter border-t border-border">
          <p className="px-3 py-2.5 text-[12px] leading-relaxed text-muted">{finding.why}</p>

          {finding.note !== null && (
            <p className="mx-3 mb-2.5 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2 text-[11px] leading-relaxed text-warning">
              {finding.note}
            </p>
          )}

          {finding.rootCause !== null && (
            <button
              type="button"
              onClick={() => {
                onDrill({ file: finding.rootCause?.file ?? '' })
              }}
              className="mx-3 mb-2.5 block w-[calc(100%-1.5rem)] rounded-md border border-border bg-surface-2 px-2.5 py-2 text-left text-[11px] text-muted hover:border-border-strong"
            >
              Корень проблемы — <span className="font-mono text-fg">{finding.rootCause.name}</span> в{' '}
              <span className="font-mono">
                {finding.rootCause.file}:{finding.rootCause.line}
              </span>
              . Починить надо там: одна правка закрывает все вхождения.
            </button>
          )}

          <div className="border-t border-border">
            {hasDiff && showAfter ? (
              <div className="overflow-x-auto">
                <ReactDiffViewer
                  oldValue={finding.snippet.before}
                  newValue={finding.snippet.after ?? ''}
                  splitView={false}
                  useDarkTheme
                  compareMethod={DiffMethod.WORDS}
                  hideLineNumbers={false}
                  linesOffset={finding.snippet.startLine - 1}
                  styles={DIFF_STYLES}
                />
              </div>
            ) : (
              <Highlighted html={finding.snippet.beforeHtml} />
            )}
          </div>

          <footer className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
            {finding.expected !== null && <CopyButton value={finding.expected.value} label="Скопировать замену" />}
            {finding.expected?.token !== null && finding.expected !== null && (
              <CopyButton value={finding.expected.token ?? ''} label="Скопировать токен" />
            )}
            {hasDiff && (
              <Button
                onClick={() => {
                  setShowAfter((previous) => !previous)
                }}
                active={showAfter}
              >
                {showAfter ? 'Показать исходник' : 'Показать дифф'}
              </Button>
            )}
            <CopyButton value={`${finding.file}:${String(finding.line)}:${String(finding.column)}`} label="Путь" />

            <span className="ml-auto font-mono text-[10px] text-faint">
              {SEVERITY_LABEL[finding.severity]} · confidence {finding.confidence.toFixed(2)} · {finding.id}
            </span>
          </footer>
        </div>
      )}
    </article>
  )
}
