import { useEffect } from 'react'

import { Badge, Button, cx } from './components/ui.js'
import { readPayload, type Payload } from './data.js'
import { activeFilters, useViewState, type Screen } from './lib/url-state.js'
import { FindingsScreen } from './screens/Findings.js'
import { OverviewScreen } from './screens/Overview.js'
import { TokensScreen } from './screens/Tokens.js'

/**
 * Shell: navigation, breadcrumbs, keyboard.
 *
 * The breadcrumb row is the visible half of the URL state — every active filter is a chip
 * you can drop, so it is always obvious why the list is showing what it shows. Getting
 * stuck behind an invisible filter is the classic way a dashboard loses a reader.
 */

const SCREENS: { key: Screen; label: string }[] = [
  { key: 'overview', label: 'Сводка' },
  { key: 'findings', label: 'Находки' },
  { key: 'tokens', label: 'Токены и компоненты' },
]

let payload: Payload | null = null
let payloadError: string | null = null

try {
  payload = readPayload()
} catch (error) {
  payloadError = error instanceof Error ? error.message : 'Не удалось прочитать данные'
}

export const App = (): React.ReactElement => {
  const { state, go, reset } = useViewState()

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target
      // Never steal a keystroke from the search box.
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.key === '1') reset('overview')
      if (event.key === '2') reset('findings')
      if (event.key === '3') reset('tokens')
      if (event.key === 'Escape') reset(state.screen)
      if (event.key === '/') {
        event.preventDefault()
        go({ screen: 'findings' })
        window.setTimeout(() => {
          document.querySelector('input')?.focus()
        }, 0)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [go, reset, state.screen])

  if (payload === null) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold text-error">Нет данных анализа</h1>
          <p className="text-[12px] text-muted">{payloadError}</p>
          <p className="font-mono text-[11px] text-faint">npm run analyze -- /path/to/project</p>
        </div>
      </div>
    )
  }

  const crumbs = activeFilters(state)

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface/60 px-4 py-2.5">
        <h1 className="text-[13px] font-semibold tracking-tight">
          Design System Audit
          <span className="ml-2 font-normal text-faint">{payload.project.name ?? payload.project.root}</span>
        </h1>

        <nav className="flex gap-1">
          {SCREENS.map((screen) => (
            <button
              key={screen.key}
              type="button"
              onClick={() => {
                go({ screen: screen.key })
              }}
              className={cx(
                'rounded-md px-2.5 py-1 text-[12px] transition-colors',
                state.screen === screen.key ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {screen.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-faint">
          {payload.project.kitVersion !== null && <Badge>sds-eng {payload.project.kitVersion}</Badge>}
          <span title="1 · 2 · 3 — экраны, / — поиск, Esc — сбросить фильтры">{payload.generatedAt}</span>
        </div>
      </header>

      {crumbs.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-bg px-4 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-faint">фильтры</span>
          {crumbs.map((crumb) => (
            <Button
              key={crumb.key}
              onClick={() => {
                go({ [crumb.key]: crumb.key === 'query' ? '' : crumb.key === 'autoFixableOnly' ? false : null })
              }}
              active
            >
              <span className="text-faint">{crumb.label}:</span> {crumb.value} <span className="text-faint">×</span>
            </Button>
          ))}
          <Button
            onClick={() => {
              reset(state.screen)
            }}
          >
            сбросить всё
          </Button>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {state.screen === 'overview' && <OverviewScreen payload={payload} go={go} />}
        {state.screen === 'findings' && <FindingsScreen payload={payload} state={state} go={go} />}
        {state.screen === 'tokens' && <TokensScreen payload={payload} state={state} go={go} />}
      </main>
    </div>
  )
}
