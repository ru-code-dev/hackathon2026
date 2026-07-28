import { useCallback, useEffect, useMemo, useState } from 'react'

import { PrFlow } from './components/PrFlow.js'
import { Badge, cx } from './components/ui.js'
import { readPayload, type Payload } from './data.js'
import { buildFileGroups, buildProblems } from './lib/model.js'
import { activeFilters, useViewState, type Screen } from './lib/url-state.js'
import { DesignScreen } from './screens/Design.js'
import { FilesScreen } from './screens/Files.js'
import { OverviewScreen } from './screens/Overview.js'
import { ProblemsScreen } from './screens/Problems.js'

/**
 * Shell: the left rail, the filter chips, the keyboard.
 *
 * The chip row is the visible half of the URL state — every active filter can be dropped
 * with one click, so it is always obvious why a list shows what it shows. Getting stuck
 * behind an invisible filter is the classic way a dashboard loses a reader, and it is the
 * single complaint this layout exists to kill.
 */

let payload: Payload | null = null
let payloadError: string | null = null

try {
  payload = readPayload()
} catch (error) {
  payloadError = error instanceof Error ? error.message : 'Не удалось прочитать данные'
}

export const App = (): React.ReactElement => {
  const { state, go, navigate, reset } = useViewState()

  // Finding ids picked for the PR flow. Deliberately not in the URL: a link that carries
  // somebody else's half-made selection would be surprising in exactly the wrong moment.
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())

  /** Toggle as a group: if every id is already selected, the whole group comes off. */
  const toggleSelection = useCallback((ids: readonly string[]): void => {
    setSelection((previous) => {
      const next = new Set(previous)
      const allSelected = ids.every((id) => next.has(id))
      for (const id of ids) {
        if (allSelected) {
          next.delete(id)
        } else {
          next.add(id)
        }
      }
      return next
    })
  }, [])

  const counts = useMemo(() => {
    if (payload === null) {
      return { problems: 0, files: 0 }
    }
    return {
      problems: buildProblems(payload.findings).length,
      files: buildFileGroups(payload.findings).length,
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target
      // Never steal a keystroke from a search box.
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.key === '1') reset('overview')
      if (event.key === '2') reset('problems')
      if (event.key === '3') reset('files')
      if (event.key === '4') reset('design')
      if (event.key === 'Escape') reset(state.screen)
      if (event.key === '/') {
        event.preventDefault()
        navigate({ screen: 'problems' })
        window.setTimeout(() => {
          document.querySelector('input')?.focus()
        }, 0)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [navigate, reset, state.screen])

  if (payload === null) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold text-error">Нет данных анализа</h1>
          <p className="text-[13px] text-muted">{payloadError}</p>
          <p className="font-mono text-[12px] text-faint">npm run analyze -- /путь/к/проекту</p>
        </div>
      </div>
    )
  }

  const data = payload
  const crumbs = activeFilters(state)
  const selectedFindings = data.findings.filter((finding) => selection.has(finding.id))

  const NAV: { key: Screen; label: string; count?: number; hint: string }[] = [
    { key: 'overview', label: 'Сводка', hint: 'вердикт и с чего начать' },
    { key: 'problems', label: 'План работ', count: counts.problems, hint: 'решения по приоритету' },
    { key: 'files', label: 'По файлам', count: counts.files, hint: 'правки файла сверху вниз' },
    { key: 'design', label: 'Дизайн-система', hint: 'кастомы, палитра, компоненты' },
  ]

  return (
    <div className="flex h-full">
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-surface/50">
        <div className="border-b border-border px-4 py-4">
          <div className="text-[14px] font-semibold tracking-tight">Аудит дизайн-системы</div>
          <div className="mt-1 truncate text-[12px] text-muted" title={data.project.root}>
            {data.project.name ?? data.project.root}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {data.project.kitVersion !== null && <Badge>sds-eng {data.project.kitVersion}</Badge>}
            <span className="text-[11px] text-faint">{data.generatedAt}</span>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                navigate({ screen: item.key })
              }}
              className={cx(
                'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors',
                state.screen === item.key ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
              )}
            >
              <span className="flex items-center gap-2 text-[13.5px] font-medium">
                <span className="w-3 text-[11px] tabular-nums text-faint">{index + 1}</span>
                {item.label}
                {item.count !== undefined && (
                  <span className="ml-auto tabular-nums text-[12px] text-faint">{item.count}</span>
                )}
              </span>
              <span className="pl-5 text-[11px] leading-tight text-faint">{item.hint}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-faint">
          1–4 — экраны · / — поиск
          <br />
          Esc — сбросить фильтры
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {crumbs.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-bg/70 px-5 py-2 backdrop-blur">
            <span className="text-[11px] uppercase tracking-wider text-faint">фильтры</span>
            {crumbs.map((crumb) => (
              <button
                key={crumb.key}
                type="button"
                onClick={() => {
                  go({ [crumb.key]: crumb.key === 'query' ? '' : crumb.key === 'autoFixableOnly' ? false : null })
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-2.5 py-0.5 text-[12px] text-fg transition-colors hover:border-accent"
              >
                <span className="text-faint">{crumb.label}:</span>
                <span className="max-w-48 truncate font-mono">{crumb.value}</span>
                <span className="text-faint">×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                reset(state.screen)
              }}
              className="ml-1 text-[12px] text-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
            >
              сбросить всё
            </button>
          </div>
        )}

        <main className="relative min-h-0 flex-1 overflow-hidden">
          {state.screen === 'overview' && <OverviewScreen payload={data} navigate={navigate} />}
          {state.screen === 'problems' && (
            <ProblemsScreen
              payload={data}
              state={state}
              go={go}
              reset={reset}
              selection={selection}
              onSelectToggle={toggleSelection}
            />
          )}
          {state.screen === 'files' && (
            <FilesScreen payload={data} state={state} go={go} selection={selection} onSelectToggle={toggleSelection} />
          )}
          {state.screen === 'design' && <DesignScreen payload={data} state={state} go={go} navigate={navigate} />}

          <PrFlow
            payload={data}
            selected={selectedFindings}
            onClear={() => {
              setSelection(new Set())
            }}
          />
        </main>
      </div>
    </div>
  )
}
