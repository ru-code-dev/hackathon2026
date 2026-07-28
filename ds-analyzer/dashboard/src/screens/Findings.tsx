import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { FindingCard } from '../components/FindingCard.js'
import { Badge, Button, cx, Empty, SEVERITY_DOT } from '../components/ui.js'
import { SEVERITY_LABEL, SEVERITY_ORDER, type Finding, type Payload, type Severity } from '../data.js'
import type { ViewState } from '../lib/url-state.js'

/**
 * The findings screen.
 *
 * Filters on the left, a virtualised feed on the right. Virtualisation is not premature:
 * a real product yields four figures of findings, and mounting them all makes the filters
 * feel broken.
 *
 * Sorting is by consequence rather than by position — severity first, then how often the
 * same mistake repeats. A deviation made forty times is one decision worth changing;
 * forty unique ones are forty conversations.
 */

const severityRank: Record<Severity, number> = { error: 0, warning: 1, info: 2, candidate: 3 }

const matches = (finding: Finding, state: ViewState): boolean => {
  if (state.rule !== null && finding.rule !== state.rule) return false
  if (state.subkind !== null && finding.subkind !== state.subkind) return false
  if (state.severity !== null && finding.severity !== state.severity) return false
  if (state.file !== null && finding.file !== state.file) return false
  if (state.component !== null && finding.appliedTo?.component !== state.component) return false
  if (state.autoFixableOnly && !finding.autoFixable) return false

  if (state.query.length > 0) {
    const needle = state.query.toLowerCase()
    const haystack = `${finding.file} ${finding.actual} ${finding.rule} ${finding.why} ${finding.expected?.token ?? ''}`
    if (!haystack.toLowerCase().includes(needle)) return false
  }

  return true
}

const FilterGroup = ({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement => (
  <div className="border-b border-border px-3 py-3 last:border-b-0">
    <h3 className="mb-2 text-[10px] uppercase tracking-wider text-faint">{title}</h3>
    <div className="flex flex-col gap-1">{children}</div>
  </div>
)

const FilterRow = ({
  label,
  count,
  active,
  onClick,
  dot,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  dot?: string
}): React.ReactElement => (
  <button
    type="button"
    onClick={onClick}
    className={cx(
      'flex items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors',
      active ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
    )}
  >
    {dot !== undefined && <span className={cx('size-1.5 shrink-0 rounded-full', dot)} />}
    <span className="min-w-0 flex-1 truncate font-mono">{label}</span>
    <span className="shrink-0 tabular-nums text-faint">{count}</span>
  </button>
)

export const FindingsScreen = ({
  payload,
  state,
  go,
}: {
  payload: Payload
  state: ViewState
  go: (patch: Partial<ViewState>) => void
}): React.ReactElement => {
  const [expandedId, setExpandedId] = useState<string | null>(state.finding)

  const visible = useMemo(
    () =>
      payload.findings
        .filter((finding) => matches(finding, state))
        .sort(
          (left, right) =>
            severityRank[left.severity] - severityRank[right.severity] ||
            right.impact.occurrences - left.impact.occurrences ||
            (left.file < right.file ? -1 : left.file > right.file ? 1 : left.line - right.line),
        ),
    [payload.findings, state],
  )

  // Counts are computed over everything, not over the current selection: a filter that
  // shows "0" for every other option tells you nothing about where else to look.
  const counts = useMemo(() => {
    const byRule = new Map<string, number>()
    const bySeverity = new Map<string, number>()
    const byFile = new Map<string, number>()

    for (const finding of payload.findings) {
      byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1)
      bySeverity.set(finding.severity, (bySeverity.get(finding.severity) ?? 0) + 1)
      byFile.set(finding.file, (byFile.get(finding.file) ?? 0) + 1)
    }

    return { byRule, bySeverity, byFile }
  }, [payload.findings])

  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    // Collapsed rows are a fixed height; an expanded one is measured, which is why
    // `measureElement` is wired up below.
    estimateSize: () => 38,
    overscan: 8,
    getItemKey: (index) => visible[index]?.id ?? index,
  })

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-border bg-surface/40">
        <div className="border-b border-border p-3">
          <input
            value={state.query}
            onChange={(event) => {
              go({ query: event.target.value })
            }}
            placeholder="Поиск по файлу, значению, тексту"
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[11px] outline-none placeholder:text-faint focus:border-border-strong"
          />
          <Button
            className="mt-2 w-full justify-center"
            active={state.autoFixableOnly}
            onClick={() => {
              go({ autoFixableOnly: !state.autoFixableOnly })
            }}
          >
            Только авто-фиксимые ({payload.summary.findings.autoFixable})
          </Button>
        </div>

        <FilterGroup title="Severity">
          {SEVERITY_ORDER.filter((severity) => (counts.bySeverity.get(severity) ?? 0) > 0).map((severity) => (
            <FilterRow
              key={severity}
              label={SEVERITY_LABEL[severity]}
              dot={SEVERITY_DOT[severity]}
              count={counts.bySeverity.get(severity) ?? 0}
              active={state.severity === severity}
              onClick={() => {
                go({ severity: state.severity === severity ? null : severity })
              }}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Правило">
          {[...counts.byRule.entries()]
            .sort((left, right) => right[1] - left[1])
            .map(([rule, count]) => (
              <FilterRow
                key={rule}
                label={rule}
                count={count}
                active={state.rule === rule}
                onClick={() => {
                  go({ rule: state.rule === rule ? null : rule, subkind: null })
                }}
              />
            ))}
        </FilterGroup>

        <FilterGroup title="Файлы">
          {[...counts.byFile.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 25)
            .map(([file, count]) => (
              <FilterRow
                key={file}
                label={file.split('/').slice(-2).join('/')}
                count={count}
                active={state.file === file}
                onClick={() => {
                  go({ file: state.file === file ? null : file })
                }}
              />
            ))}
        </FilterGroup>
      </aside>

      <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg/85 px-4 py-2 backdrop-blur">
          <span className="text-[12px] text-muted">
            <span className="font-semibold text-fg tabular-nums">{visible.length}</span> из {payload.findings.length}
          </span>
          {state.rule !== null && payload.ruleDescriptions[state.rule] !== undefined && (
            <Badge>{payload.ruleDescriptions[state.rule]}</Badge>
          )}
        </div>

        {visible.length === 0 ? (
          <Empty>Под фильтры ничего не попало.</Empty>
        ) : (
          <div className="relative px-4 py-3" style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
            {virtualizer.getVirtualItems().map((item) => {
              const finding = visible[item.index]
              if (finding === undefined) {
                return null
              }

              return (
                <div
                  key={finding.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="absolute left-4 right-4 pb-1.5"
                  style={{ transform: `translateY(${String(item.start)}px)` }}
                >
                  <FindingCard
                    finding={finding}
                    expanded={expandedId === finding.id}
                    onToggle={() => {
                      const next = expandedId === finding.id ? null : finding.id
                      setExpandedId(next)
                      go({ finding: next })
                    }}
                    onDrill={(patch) => {
                      go({ ...patch, finding: null })
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
