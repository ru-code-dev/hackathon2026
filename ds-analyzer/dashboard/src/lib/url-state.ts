import { useCallback, useEffect, useState } from 'react'

/**
 * Navigation state lives in the URL.
 *
 * Every level of drill-down — screen, rule, subkind, file, finding, token — is a query
 * parameter, so any view can be pasted into a ticket and opened by somebody else at
 * exactly the same place. That is the whole reason for the indirection: a dashboard where
 * "look at this" means "click these six things" does not get used in review.
 *
 * The back button works for free, because each transition is a `pushState`.
 */

export type Screen = 'overview' | 'findings' | 'tokens'

export interface ViewState {
  screen: Screen
  /** Filter by rule id, e.g. `token.literal.color`. */
  rule: string | null
  /** Filter by subkind within a rule, e.g. `near`. */
  subkind: string | null
  severity: string | null
  file: string | null
  /** Selected finding id; opens its card expanded. */
  finding: string | null
  /** Selected kit component on the tokens screen. */
  component: string | null
  /** Free-text search across file, value and explanation. */
  query: string
  /** Only findings that can be patched without a human. */
  autoFixableOnly: boolean
}

const EMPTY: ViewState = {
  screen: 'overview',
  rule: null,
  subkind: null,
  severity: null,
  file: null,
  finding: null,
  component: null,
  query: '',
  autoFixableOnly: false,
}

const parse = (search: string): ViewState => {
  const params = new URLSearchParams(search)
  const read = (key: string): string | null => {
    const value = params.get(key)
    return value === null || value.length === 0 ? null : value
  }

  const screen = read('screen')

  return {
    screen: screen === 'findings' || screen === 'tokens' ? screen : 'overview',
    rule: read('rule'),
    subkind: read('subkind'),
    severity: read('severity'),
    file: read('file'),
    finding: read('finding'),
    component: read('component'),
    query: read('q') ?? '',
    autoFixableOnly: params.get('fix') === '1',
  }
}

const serialise = (state: ViewState): string => {
  const params = new URLSearchParams()
  const write = (key: string, value: string | null): void => {
    if (value !== null && value.length > 0) {
      params.set(key, value)
    }
  }

  // `overview` is the default, so it is left out to keep shared links short.
  write('screen', state.screen === 'overview' ? null : state.screen)
  write('rule', state.rule)
  write('subkind', state.subkind)
  write('severity', state.severity)
  write('file', state.file)
  write('finding', state.finding)
  write('component', state.component)
  write('q', state.query)
  if (state.autoFixableOnly) {
    params.set('fix', '1')
  }

  const query = params.toString()

  return query.length === 0 ? window.location.pathname : `${window.location.pathname}?${query}`
}

export const useViewState = (): {
  state: ViewState
  go: (patch: Partial<ViewState>) => void
  reset: (screen?: Screen) => void
} => {
  const [state, setState] = useState<ViewState>(() => parse(window.location.search))

  useEffect(() => {
    const onPop = (): void => {
      setState(parse(window.location.search))
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  const go = useCallback((patch: Partial<ViewState>): void => {
    setState((previous) => {
      const next = { ...previous, ...patch }
      window.history.pushState(null, '', serialise(next))
      return next
    })
  }, [])

  const reset = useCallback((screen: Screen = 'overview'): void => {
    const next = { ...EMPTY, screen }
    window.history.pushState(null, '', serialise(next))
    setState(next)
  }, [])

  return { state, go, reset }
}

/** Non-default filters, for the breadcrumb trail. */
export const activeFilters = (state: ViewState): { key: keyof ViewState; label: string; value: string }[] => {
  const crumbs: { key: keyof ViewState; label: string; value: string }[] = []

  if (state.severity !== null) crumbs.push({ key: 'severity', label: 'severity', value: state.severity })
  if (state.rule !== null) crumbs.push({ key: 'rule', label: 'правило', value: state.rule })
  if (state.subkind !== null) crumbs.push({ key: 'subkind', label: 'подвид', value: state.subkind })
  if (state.file !== null) crumbs.push({ key: 'file', label: 'файл', value: state.file })
  if (state.component !== null) crumbs.push({ key: 'component', label: 'компонент', value: state.component })
  if (state.query.length > 0) crumbs.push({ key: 'query', label: 'поиск', value: state.query })
  if (state.autoFixableOnly) crumbs.push({ key: 'autoFixableOnly', label: 'фильтр', value: 'авто-фикс' })

  return crumbs
}
