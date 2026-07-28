import { useMemo } from 'react'

import { Donut, RankedBars, type Slice } from '../components/charts.js'
import { Badge, Card, CardHeader, cx, Empty, Meter, Stat } from '../components/ui.js'
import { CATEGORY_LABEL, SEVERITY_LABEL, SEVERITY_ORDER, type Payload, type Severity } from '../data.js'
import type { ViewState } from '../lib/url-state.js'

/**
 * The summary screen.
 *
 * Answers four questions in the order somebody actually asks them: how bad is it, what
 * kind of bad, where, and what is already right. The last one is not politeness — a report
 * consisting only of complaints gets read once, and this one has to survive being opened
 * every sprint.
 *
 * Everything here is a way into the findings list. Nothing on this screen is terminal.
 */

const SEVERITY_COLOR: Record<Severity, string> = {
  error: 'var(--color-error)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
  candidate: 'var(--color-candidate)',
}

const healthTone = (score: number): 'ok' | 'warning' | 'error' =>
  score >= 75 ? 'ok' : score >= 45 ? 'warning' : 'error'

/**
 * File density map.
 *
 * Area is findings, colour is severity of the worst one. A treemap would be prettier; a
 * sorted grid is easier to scan and does not need a layout library, and the question being
 * answered — "which files should I open first" — is a ranking question.
 */
const FileMap = ({ payload, onSelect }: { payload: Payload; onSelect: (file: string) => void }): React.ReactElement => {
  const files = useMemo(() => {
    const byFile = new Map<string, { total: number; worst: Severity }>()

    for (const finding of payload.findings) {
      const entry = byFile.get(finding.file) ?? { total: 0, worst: 'info' as Severity }
      entry.total += 1
      const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2, candidate: 3 }
      if (rank[finding.severity] < rank[entry.worst]) {
        entry.worst = finding.severity
      }
      byFile.set(finding.file, entry)
    }

    return [...byFile.entries()].sort((left, right) => right[1].total - left[1].total)
  }, [payload.findings])

  if (files.length === 0) {
    return <Empty>Ни одного отклонения — карта пуста.</Empty>
  }

  const max = files[0]?.[1].total ?? 1

  return (
    <div className="flex flex-wrap gap-1.5 p-3">
      {files.map(([file, entry]) => (
        <button
          key={file}
          type="button"
          onClick={() => {
            onSelect(file)
          }}
          title={`${file} — ${String(entry.total)} отклонений`}
          className={cx(
            'rounded-md border px-2 py-1.5 text-left transition-transform hover:scale-[1.03]',
            entry.worst === 'error'
              ? 'border-error/40 bg-error/12'
              : entry.worst === 'warning'
                ? 'border-warning/40 bg-warning/12'
                : 'border-info/40 bg-info/12',
          )}
          style={{ flexGrow: entry.total / max, minWidth: '120px' }}
        >
          <div className="truncate font-mono text-[10px] text-fg">{file.split('/').slice(-1)[0]}</div>
          <div className="truncate text-[9px] text-faint">{file.split('/').slice(0, -1).join('/')}</div>
          <div className="mt-0.5 text-[11px] font-semibold tabular-nums">{entry.total}</div>
        </button>
      ))}
    </div>
  )
}

export const OverviewScreen = ({
  payload,
  go,
}: {
  payload: Payload
  go: (patch: Partial<ViewState>) => void
}): React.ReactElement => {
  const { summary, usage } = payload

  const severitySlices: Slice[] = SEVERITY_ORDER.filter((severity) => summary.findings.bySeverity[severity] > 0).map(
    (severity) => ({
      key: severity,
      label: SEVERITY_LABEL[severity],
      value: summary.findings.bySeverity[severity],
      color: SEVERITY_COLOR[severity],
    }),
  )

  const ruleSlices: Slice[] = Object.entries(summary.findings.byRule)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([rule, value]) => ({ key: rule, label: rule, value, color: 'var(--color-info)' }))

  const topComponents = [...usage.components].sort((left, right) => right.usages - left.usages).slice(0, 8)

  return (
    <div className="ds-enter space-y-3 p-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr]">
        <Card className="flex flex-col items-center justify-center gap-2 p-5">
          <div className="relative">
            <Donut
              height={150}
              data={[
                {
                  key: 'have',
                  label: 'health',
                  value: summary.healthScore,
                  color: `var(--color-${healthTone(summary.healthScore)})`,
                },
                { key: 'rest', label: 'до 100', value: 100 - summary.healthScore, color: 'var(--color-surface-2)' },
              ]}
              centre={
                <div className="text-center">
                  <div className="text-3xl font-semibold tabular-nums">{summary.healthScore}</div>
                  <div className="text-[10px] uppercase tracking-wider text-faint">health</div>
                </div>
              }
            />
          </div>
          <p className="text-center font-mono text-[9px] leading-relaxed text-faint" title={summary.healthFormula}>
            {summary.healthFormula.split(';')[0]}
          </p>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <Stat
            label="Adoption"
            value={`${String(Math.round(summary.adoption * 100))}%`}
            hint={<Meter value={summary.adoption} tone="ok" />}
          />
          <Stat
            label="Token coverage"
            value={`${String(Math.round(summary.tokenCoverage * 100))}%`}
            hint={<Meter value={summary.tokenCoverage} tone="info" />}
          />
          <Stat
            label="Чистых файлов"
            value={`${String(summary.files.clean)}/${String(summary.files.scanned)}`}
            hint={<Meter value={summary.files.clean / Math.max(1, summary.files.scanned)} tone="ok" />}
          />
          <Stat
            label="Отклонений"
            value={summary.findings.total}
            hint={`${String(summary.findings.bySeverity.error)} error · ${String(summary.findings.bySeverity.warning)} warn`}
            onClick={() => {
              go({ screen: 'findings' })
            }}
          />
          <Stat
            label="Авто-фиксится"
            value={summary.findings.autoFixable}
            hint={`${String(Math.round((summary.findings.autoFixable / Math.max(1, summary.findings.total)) * 100))}% одной командой`}
            onClick={() => {
              go({ screen: 'findings', autoFixableOnly: true })
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card>
          <CardHeader title="По типам" hint="клик проваливает в находки с фильтром" />
          <RankedBars
            data={ruleSlices}
            onSelect={(rule) => {
              go({ screen: 'findings', rule })
            }}
          />
        </Card>

        <Card>
          <CardHeader title="По severity" />
          <Donut
            data={severitySlices}
            height={220}
            onSelect={(severity) => {
              go({ screen: 'findings', severity })
            }}
            centre={
              <div className="text-center">
                <div className="text-2xl font-semibold tabular-nums">{summary.findings.total}</div>
                <div className="text-[10px] text-faint">всего</div>
              </div>
            }
          />
        </Card>

        <Card>
          <CardHeader title="Что хорошо" hint="отчёт из одних претензий читают один раз" />
          <ul className="space-y-2 p-3">
            {summary.positives.map((positive) => (
              <li key={positive.label} className="flex gap-2">
                <span className="mt-0.5 shrink-0 text-ok">✓</span>
                <div className="min-w-0">
                  <div className="text-[12px] font-medium">{positive.label}</div>
                  <div className="text-[11px] leading-relaxed text-muted">{positive.detail}</div>
                </div>
              </li>
            ))}
            {summary.positives.length === 0 && <Empty>Пока нечего отметить.</Empty>}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader
            title="Карта файлов"
            hint="размер — число отклонений, цвет — худшая severity; клик открывает файл"
          />
          <FileMap
            payload={payload}
            onSelect={(file) => {
              go({ screen: 'findings', file })
            }}
          />
        </Card>

        <Card>
          <CardHeader title="Топ компонентов кита" hint="клик — все отклонения на компоненте" />
          <ul className="divide-y divide-border">
            {topComponents.map((component) => (
              <li key={component.name}>
                <button
                  type="button"
                  onClick={() => {
                    go({ screen: 'tokens', component: component.name })
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2/60"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px]">{component.name}</span>
                  <span className="shrink-0 tabular-nums text-[11px] text-muted">{component.usages}×</span>
                  {component.findings === 0 ? (
                    <Badge tone="ok">чисто</Badge>
                  ) : (
                    <Badge tone="warning">{component.findings}</Badge>
                  )}
                </button>
              </li>
            ))}
            {topComponents.length === 0 && <Empty>Компоненты кита не найдены.</Empty>}
          </ul>
        </Card>
      </div>

      {summary.kitGaps.length > 0 && (
        <Card>
          <CardHeader
            title="Пробелы кита"
            hint="цвета, для которых в дизайн-системе нет семантической роли — это вход для команды ДС, а не претензия к продукту"
          />
          <div className="flex flex-wrap gap-2 p-3">
            {summary.kitGaps.map((gap) => (
              <div
                key={`${gap.value}:${gap.role}`}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1.5"
              >
                <span
                  className="size-4 shrink-0 rounded border border-border-strong"
                  style={{ background: gap.value }}
                />
                <div className="text-[11px]">
                  <div className="font-mono">{gap.value}</div>
                  <div className="text-faint">
                    нет роли «{gap.role}» · есть {gap.token} · {gap.occurrences}×
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {summary.limitations.length > 0 && (
        <Card>
          <CardHeader
            title="Что не проанализировано"
            hint="молчаливый пропуск читается как «здесь чисто» — поэтому перечислено честно"
          />
          <ul className="divide-y divide-border">
            {summary.limitations.slice(0, 40).map((limitation, index) => (
              <li key={`${limitation.file}:${String(index)}`} className="flex gap-2 px-3 py-1.5 text-[11px]">
                <Badge>{limitation.reason}</Badge>
                <span className="shrink-0 font-mono text-faint">
                  {limitation.file}
                  {limitation.line !== null && `:${String(limitation.line)}`}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">{limitation.detail}</span>
              </li>
            ))}
          </ul>
          {summary.limitations.length > 40 && (
            <p className="px-3 py-2 text-[11px] text-faint">…и ещё {summary.limitations.length - 40}</p>
          )}
        </Card>
      )}

      <p className="px-1 text-[10px] text-faint">
        Категории:{' '}
        {Object.entries(summary.findings.byCategory)
          .filter(([, count]) => count > 0)
          .map(([category, count]) => `${CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL]} ${String(count)}`)
          .join(' · ')}
      </p>
    </div>
  )
}
