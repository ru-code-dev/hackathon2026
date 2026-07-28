import { useMemo, useState } from 'react'

import { ruleLabel, type Finding, type Payload } from '../data.js'
import { buildUnifiedDiff, toCurlCommand, type PrRequest } from '../lib/diff.js'
import { Badge, Button, CopyButton, cx } from './ui.js'

/**
 * The hand-off: selected fixes → unified diff → Jenkins webhook → pull request.
 *
 * Two paths, both honest about their limits. The in-browser POST works only when the
 * Jenkins instance answers CORS preflight; when the browser blocks it, the UI says so and
 * puts the equivalent curl command one click away instead of pretending the send worked.
 * The webhook token is never baked into this file — the report is committed and shared —
 * it is typed once and kept in the browser's localStorage.
 */

const STORAGE_KEYS = {
  webhookUrl: 'ds-analyzer.ci.webhookUrl',
  repositoryUrl: 'ds-analyzer.ci.repositoryUrl',
  targetBranch: 'ds-analyzer.ci.targetBranch',
} as const

const stored = (key: string): string => {
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

const store = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable for file:// pages under strict policies; the form still works.
  }
}

const defaultBranchName = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `ds-autofix-${String(now.getFullYear())}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; response: string | null }
  | { kind: 'blocked'; message: string }

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  mono = true,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
}): React.ReactElement => (
  <label className="block">
    <span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
    <input
      value={value}
      onChange={(event) => {
        onChange(event.target.value)
      }}
      placeholder={placeholder}
      spellCheck={false}
      className={cx(
        'w-full rounded-md border border-border bg-bg px-3 py-1.5 text-[13px] outline-none placeholder:text-faint focus:border-accent/60',
        mono && 'font-mono text-[12.5px]',
      )}
    />
  </label>
)

export const PrFlow = ({
  payload,
  selected,
  onClear,
}: {
  payload: Payload
  selected: readonly Finding[]
  onClear: () => void
}): React.ReactElement | null => {
  const [open, setOpen] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [sendState, setSendState] = useState<SendState>({ kind: 'idle' })

  const [webhookUrl, setWebhookUrl] = useState(() => stored(STORAGE_KEYS.webhookUrl) || (payload.ci?.webhookUrl ?? ''))
  const [repositoryUrl, setRepositoryUrl] = useState(
    () => stored(STORAGE_KEYS.repositoryUrl) || (payload.ci?.repositoryUrl ?? ''),
  )
  const [targetBranch, setTargetBranch] = useState(
    () => stored(STORAGE_KEYS.targetBranch) || (payload.ci?.targetBranch ?? 'master'),
  )
  const [branchName, setBranchName] = useState(defaultBranchName)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const result = useMemo(() => buildUnifiedDiff(selected), [selected])

  const problems = useMemo(() => {
    const byKey = new Map<string, { label: string; actual: string; expected: string | null; count: number }>()
    for (const finding of selected) {
      const entry = byKey.get(finding.impactKey)
      if (entry) {
        entry.count += 1
        continue
      }
      byKey.set(finding.impactKey, {
        label: ruleLabel(finding.rule),
        actual: finding.actual,
        expected: finding.expected?.token ?? finding.expected?.value ?? null,
        count: 1,
      })
    }
    return [...byKey.values()].sort((left, right) => right.count - left.count)
  }, [selected])

  if (selected.length === 0) {
    return null
  }

  const autoTitle = `Дизайн-система: ${String(problems.length)} автозамен${problems.length === 1 ? 'а' : ''} (${String(result.changedLines)} строк)`
  const autoBody = [
    ...problems.map(
      (problem) =>
        `- ${problem.label}: ${problem.actual}${problem.expected !== null ? ` → ${problem.expected}` : ''} (${String(problem.count)}×)`,
    ),
    '',
    `Сгенерировано ds-analyzer · health ${String(payload.summary.healthScore)}/100 · ${payload.generatedAt}`,
  ].join('\n')

  const request: PrRequest = {
    repository_url: repositoryUrl,
    branch_name: branchName,
    target_branch: targetBranch,
    pr_title: title.length > 0 ? title : autoTitle,
    pr_body: body.length > 0 ? body : autoBody,
    diff_content: result.diff,
  }

  const curl = toCurlCommand(webhookUrl.length > 0 ? webhookUrl : '<webhook-url>', request)
  const ready = webhookUrl.length > 0 && repositoryUrl.length > 0 && targetBranch.length > 0 && result.diff.length > 0

  const send = (): void => {
    store(STORAGE_KEYS.webhookUrl, webhookUrl)
    store(STORAGE_KEYS.repositoryUrl, repositoryUrl)
    store(STORAGE_KEYS.targetBranch, targetBranch)
    setSendState({ kind: 'sending' })

    void fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
      .then(async (response) => {
        const text = await response.text().catch(() => '')
        setSendState({ kind: 'sent', response: text.length > 0 ? text.slice(0, 400) : null })
      })
      .catch(() => {
        setSendState({
          kind: 'blocked',
          message:
            'Браузер заблокировал запрос (CORS) или Jenkins недоступен отсюда. Скопируйте curl — он делает ровно то же самое из терминала.',
        })
      })
  }

  return (
    <>
      {/* The selection bar: appears with the first checkbox, never covers content it can't scroll. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-surface/90 px-5 py-3 shadow-2xl backdrop-blur">
          <span className="text-[13px]">
            <span className="font-semibold tabular-nums">{problems.length}</span> решений ·{' '}
            <span className="tabular-nums">{result.changedLines}</span> правок ·{' '}
            <span className="tabular-nums">{result.files.length}</span> файлов
            {result.skipped.length > 0 && (
              <span className="ml-2 text-warning" title={result.skipped.map((entry) => entry.reason).join('; ')}>
                {result.skipped.length} пропущено
              </span>
            )}
          </span>
          <Button
            onClick={() => {
              setOpen(true)
              setSendState({ kind: 'idle' })
            }}
            className="border-accent/60 bg-accent/15 text-fg hover:border-accent"
          >
            Создать PR →
          </Button>
          <CopyButton value={result.diff} label="Дифф" />
          <Button onClick={onClear}>Снять выбор</Button>
        </div>
      </div>

      {open && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 p-6 backdrop-blur-sm"
          onClick={() => {
            setOpen(false)
          }}
        >
          <div
            className="ds-enter flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-[15px] font-semibold tracking-tight">Создать pull request</h2>
              <button
                type="button"
                className="text-[18px] leading-none text-faint transition-colors hover:text-fg"
                onClick={() => {
                  setOpen(false)
                }}
              >
                ×
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <Field
                label="Вебхук Jenkins (с токеном — хранится только в этом браузере, в отчёт не попадает)"
                value={webhookUrl}
                onChange={setWebhookUrl}
                placeholder="https://…/generic-webhook-trigger/invoke?token=…"
              />
              <Field
                label="Репозиторий"
                value={repositoryUrl}
                onChange={setRepositoryUrl}
                placeholder="https://…/project.git"
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ветка с фиксами" value={branchName} onChange={setBranchName} />
                <Field label="Целевая ветка" value={targetBranch} onChange={setTargetBranch} />
              </div>
              <Field
                label="Заголовок PR"
                value={title.length > 0 ? title : autoTitle}
                onChange={setTitle}
                mono={false}
              />

              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-muted">Описание PR</span>
                <textarea
                  value={body.length > 0 ? body : autoBody}
                  onChange={(event) => {
                    setBody(event.target.value)
                  }}
                  rows={Math.min(8, problems.length + 3)}
                  spellCheck={false}
                  className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-accent/60"
                />
              </label>

              <div className="rounded-md border border-border">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-muted transition-colors hover:text-fg"
                  onClick={() => {
                    setShowDiff((previous) => !previous)
                  }}
                >
                  <span className={cx('text-faint transition-transform', showDiff && 'rotate-90')}>›</span>
                  Дифф — {result.files.length} файлов, {result.changedLines} правок
                  {result.skipped.length > 0 && <Badge tone="warning">{result.skipped.length} пропущено</Badge>}
                </button>
                {showDiff && (
                  <div className="border-t border-border">
                    {result.skipped.length > 0 && (
                      <ul className="border-b border-border px-3 py-2 text-[12px] text-warning">
                        {result.skipped.map((entry) => (
                          <li key={entry.finding.id}>
                            {entry.finding.file}:{entry.finding.line} — {entry.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                    <pre className="max-h-64 overflow-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed text-muted">
                      {result.diff}
                    </pre>
                  </div>
                )}
              </div>

              {sendState.kind === 'sent' && (
                <div className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2.5 text-[12.5px] leading-relaxed">
                  <span className="font-medium text-ok">Отправлено.</span>{' '}
                  <span className="text-muted">
                    {sendState.response !== null
                      ? `Ответ Jenkins: ${sendState.response}`
                      : 'Ответ прочитать не удалось (CORS) — проверьте очередь задач в Jenkins.'}
                  </span>
                </div>
              )}
              {sendState.kind === 'blocked' && (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-warning">
                  {sendState.message}
                </div>
              )}
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                disabled={!ready || sendState.kind === 'sending'}
                onClick={send}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-md border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                  ready && sendState.kind !== 'sending'
                    ? 'border-accent/60 bg-accent/20 text-fg hover:border-accent'
                    : 'cursor-not-allowed border-border text-faint',
                )}
              >
                {sendState.kind === 'sending' ? 'Отправляю…' : 'Отправить в Jenkins'}
              </button>
              <CopyButton value={curl} label="Скопировать curl" />
              <CopyButton value={result.diff} label="Скопировать дифф" />
              {!ready && (
                <span className="text-[12px] text-faint">
                  {result.diff.length === 0 ? 'В выборе нет применимых правок.' : 'Заполните вебхук и репозиторий.'}
                </span>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
