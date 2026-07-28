import { useMemo } from 'react'

import { ScaleHistogram } from '../components/charts.js'
import { Badge, Card, CardHeader, cx, Empty } from '../components/ui.js'
import type { Payload } from '../data.js'
import type { ViewState } from '../lib/url-state.js'

/**
 * Navigation from the kit's side rather than the code's side.
 *
 * The findings screen answers "what is wrong in this file". This one answers the questions
 * the design-system team asks instead: which of our components does this product actually
 * use, which variants does it need, which colours does it keep reaching for, and where do
 * its raw sizes sit against our ramps.
 *
 * Every row leads back into the findings list, so the two directions meet.
 */

const swatchesFrom = (payload: Payload): { value: string; token: string | null; kind: string; count: number }[] => {
  const byValue = new Map<string, { value: string; token: string | null; kind: string; count: number }>()

  for (const finding of payload.findings) {
    if (finding.rule !== 'token.literal.color') {
      continue
    }
    const existing = byValue.get(finding.actual)
    if (existing) {
      existing.count += 1
      continue
    }
    byValue.set(finding.actual, {
      value: finding.actual,
      token: finding.expected?.token ?? null,
      kind: finding.subkind ?? 'foreign',
      count: 1,
    })
  }

  return [...byValue.values()].sort((left, right) => right.count - left.count)
}

const dimensionsFrom = (payload: Payload): { px: number; count: number }[] => {
  const byPx = new Map<number, number>()

  for (const finding of payload.findings) {
    if (finding.rule !== 'token.literal.dimension') {
      continue
    }
    const px = Number.parseFloat(finding.actual)
    if (Number.isFinite(px)) {
      byPx.set(px, (byPx.get(px) ?? 0) + 1)
    }
  }

  return [...byPx.entries()].map(([px, count]) => ({ px, count })).sort((left, right) => left.px - right.px)
}

const KIND_TONE = {
  exact: 'error',
  near: 'warning',
  shade: 'info',
  foreign: 'warning',
} as const

export const TokensScreen = ({
  payload,
  state,
  go,
}: {
  payload: Payload
  state: ViewState
  go: (patch: Partial<ViewState>) => void
}): React.ReactElement => {
  const swatches = useMemo(() => swatchesFrom(payload), [payload])
  const dimensions = useMemo(() => dimensionsFrom(payload), [payload])

  const selected = payload.usage.components.find((component) => component.name === state.component) ?? null

  return (
    <div className="ds-enter grid grid-cols-1 gap-3 p-4 xl:grid-cols-[1fr_400px]">
      <div className="space-y-3">
        <Card>
          <CardHeader
            title="Палитра проекта"
            hint="цвета, написанные литералом, рядом с тем, чем их надо было записать"
          />
          {swatches.length === 0 ? (
            <Empty>Сырых цветов не найдено.</Empty>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 p-3 sm:grid-cols-2">
              {swatches.map((swatch) => (
                <button
                  key={swatch.value}
                  type="button"
                  onClick={() => {
                    go({ screen: 'findings', rule: 'token.literal.color', query: swatch.value })
                  }}
                  className="flex items-center gap-2.5 rounded-md border border-border bg-surface-2/50 px-2.5 py-2 text-left transition-colors hover:border-border-strong"
                >
                  <span
                    className="size-8 shrink-0 rounded-md border border-border-strong"
                    style={{ background: swatch.value }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px]">{swatch.value}</div>
                    <div className="truncate font-mono text-[10px] text-faint">
                      {swatch.token ?? 'нет близкого токена'}
                    </div>
                  </div>
                  <Badge tone={KIND_TONE[swatch.kind as keyof typeof KIND_TONE] ?? 'neutral'}>{swatch.kind}</Badge>
                  <span className="shrink-0 tabular-nums text-[11px] text-muted">{swatch.count}×</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Размеры против шкал кита"
            hint="зелёные столбцы — значение есть в шкале, жёлтые — нет; клик показывает все места"
          />
          {dimensions.length === 0 ? (
            <Empty>Сырых размеров не найдено.</Empty>
          ) : (
            <ScaleHistogram
              values={dimensions}
              scale={[0, 2, 4, 8, 10, 12, 14, 16, 18, 20, 24, 30, 32, 36, 38, 46, 48]}
              onSelect={(px) => {
                go({ screen: 'findings', rule: 'token.literal.dimension', query: `${String(px)}px` })
              }}
            />
          )}
        </Card>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader
            title="Матрица компонентов"
            hint={`${String(payload.usage.components.length)} используется · ${String(payload.usage.unusedComponents.length)} ни разу`}
          />
          <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {payload.usage.components.map((component) => (
              <li key={component.name}>
                <button
                  type="button"
                  onClick={() => {
                    go({ component: state.component === component.name ? null : component.name })
                  }}
                  className={cx(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-2/60',
                    state.component === component.name && 'bg-surface-2',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-[12px]">{component.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-faint">{component.files} ф.</span>
                  <span className="shrink-0 tabular-nums text-[11px]">{component.usages}×</span>
                  {component.overrides > 0 && <Badge tone="warning">{component.overrides} перекр.</Badge>}
                  {component.findings === 0 && <Badge tone="ok">чисто</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {selected !== null && (
          <Card className="ds-enter">
            <CardHeader
              title={selected.name}
              hint={`${String(selected.usages)} использований в ${String(selected.files)} файлах`}
              right={
                <button
                  type="button"
                  className="text-[11px] text-muted hover:text-fg"
                  onClick={() => {
                    go({ screen: 'findings', component: selected.name })
                  }}
                >
                  Отклонения →
                </button>
              }
            />
            <div className="space-y-3 p-3">
              {Object.entries(selected.props).length === 0 ? (
                <p className="text-[11px] text-faint">Пропы с вариантами не использовались.</p>
              ) : (
                Object.entries(selected.props).map(([prop, values]) => {
                  const total = Object.values(values).reduce((sum, count) => sum + count, 0)

                  return (
                    <div key={prop}>
                      <div className="mb-1 font-mono text-[11px] text-muted">{prop}</div>
                      <div className="space-y-1">
                        {Object.entries(values)
                          .sort((left, right) => right[1] - left[1])
                          .map(([value, count]) => (
                            <div key={value} className="flex items-center gap-2">
                              <span className="w-20 shrink-0 truncate font-mono text-[11px]">{value}</span>
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                                <span
                                  className="block h-full rounded-full bg-info"
                                  style={{ width: `${String((count / total) * 100)}%` }}
                                />
                              </span>
                              <span className="w-8 shrink-0 text-right tabular-nums text-[11px] text-faint">
                                {count}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>
        )}

        {payload.usage.foreignComponents.length > 0 && (
          <Card>
            <CardHeader
              title="Компоненты не из кита"
              hint="локальные и сторонние — сырьё для детектора кастомов (M5)"
            />
            <div className="flex flex-wrap gap-1.5 p-3">
              {payload.usage.foreignComponents.slice(0, 40).map((component) => (
                <Badge key={component.name}>
                  {component.name} <span className="text-faint">{component.usages}</span>
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
