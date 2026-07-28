import * as React from 'react'

/**
 * FIXTURE: inline SVG where the kit ships both a `Spinner` component and an icon set.
 *
 * Signals:
 *   - inline `<svg>` in product code
 *   - name `Spinner` collides exactly with a kit component
 *   - `#2969e3` is an exact sys.Background.backAccent literal
 *
 * Expected top candidate: Spinner (score ≥ 0.85).
 */
export const Spinner = ({ size = 16 }: { size?: number }): React.ReactElement => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7" stroke="#e9edf2" strokeWidth="2" />
    <path d="M15 8a7 7 0 0 0-7-7" stroke="#2969e3" strokeWidth="2" strokeLinecap="round">
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 8 8"
        to="360 8 8"
        dur="0.8s"
        repeatCount="indefinite"
      />
    </path>
  </svg>
)
