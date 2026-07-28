import { useEffect, useState, type ReactNode } from 'react'

import type { Severity } from '../data.js'

/**
 * The primitive set.
 *
 * shadcn/ui's visual language, copied in rather than installed — which is what shadcn is
 * anyway. Only the pieces this dashboard uses exist here, so there is no unused surface
 * and no Radix runtime for behaviour we do not need. Anything genuinely interactive
 * (virtualised lists, charts, diffs) uses a real library.
 */

export const cx = (...values: (string | false | null | undefined)[]): string => values.filter(Boolean).join(' ')

export const SEVERITY_CLASS: Record<Severity, string> = {
  error: 'text-error border-error/40 bg-error/10',
  warning: 'text-warning border-warning/40 bg-warning/10',
  info: 'text-info border-info/40 bg-info/10',
  candidate: 'text-candidate border-candidate/40 bg-candidate/10',
}

export const SEVERITY_DOT: Record<Severity, string> = {
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-info',
  candidate: 'bg-candidate',
}

export const Card = ({
  children,
  className,
  as: Element = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}): React.ReactElement => (
  <Element className={cx('rounded-[var(--radius-card)] border border-border bg-surface', className)}>
    {children}
  </Element>
)

export const CardHeader = ({ title, hint, right }: { title: ReactNode; hint?: ReactNode; right?: ReactNode }) => (
  <header className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3">
    <div className="min-w-0">
      <h2 className="truncate text-[13px] font-semibold tracking-tight">{title}</h2>
      {hint !== undefined && <p className="mt-0.5 truncate text-[11px] text-faint">{hint}</p>}
    </div>
    {right}
  </header>
)

export const Badge = ({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: Severity | 'neutral' | 'ok'
  className?: string
}): React.ReactElement => {
  const toneClass =
    tone === 'neutral'
      ? 'text-muted border-border bg-surface-2'
      : tone === 'ok'
        ? 'text-ok border-ok/40 bg-ok/10'
        : SEVERITY_CLASS[tone]

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-4',
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  )
}

export const Button = ({
  children,
  onClick,
  active,
  title,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  active?: boolean
  title?: string
  className?: string
}): React.ReactElement => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={cx(
      'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
      active
        ? 'border-border-strong bg-surface-2 text-fg'
        : 'border-border bg-transparent text-muted hover:border-border-strong hover:text-fg',
      className,
    )}
  >
    {children}
  </button>
)

/** Copy-to-clipboard with the confirmation the user asked for on every suggestion. */
export const CopyButton = ({ value, label = 'Копировать' }: { value: string; label?: string }): React.ReactElement => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = window.setTimeout(() => {
      setCopied(false)
    }, 1400)
    return () => {
      window.clearTimeout(timer)
    }
  }, [copied])

  return (
    <Button
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true)
          },
          () => {
            // Clipboard access can be denied when the file is opened from disk under a
            // strict policy. Saying so beats a button that silently does nothing.
            window.prompt('Скопируйте вручную:', value)
          },
        )
      }}
      active={copied}
      title={value}
    >
      {copied ? '✓ Скопировано' : label}
    </Button>
  )
}

/**
 * Class names are written out rather than composed.
 *
 * Tailwind extracts classes by scanning source text, so `bg-${tone}` is invisible to it
 * and would ship a bar with no colour.
 */
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const METER_TONE = {
  info: 'bg-info',
  ok: 'bg-ok',
  warning: 'bg-warning',
  error: 'bg-error',
} as const

export const Meter = ({
  value,
  tone = 'info',
}: {
  value: number
  tone?: keyof typeof METER_TONE
}): React.ReactElement => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
    <div
      className={cx('h-full rounded-full transition-[width] duration-500', METER_TONE[tone])}
      style={{ width: `${String(Math.round(clamp01(value) * 100))}%` }}
    />
  </div>
)

export const Stat = ({
  label,
  value,
  hint,
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  onClick?: () => void
}): React.ReactElement => (
  <div
    className={cx(
      'rounded-lg border border-border bg-surface px-3 py-2.5',
      onClick !== undefined && 'cursor-pointer transition-colors hover:border-border-strong',
    )}
    onClick={onClick}
  >
    <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
    <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    {hint !== undefined && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
  </div>
)

export const Empty = ({ children }: { children: ReactNode }): React.ReactElement => (
  <div className="px-4 py-10 text-center text-[12px] text-faint">{children}</div>
)
