import * as React from 'react'
import styled from 'styled-components'

/**
 * FIXTURE: shadow-named fork of the kit's Button.
 *
 * Signals:
 *   - name `MyButton` normalises to `Button` after stripping the `My` prefix
 *   - raw `<button>` primitive
 *   - prop set {view, size, disabled, onClick, children} ≈ ButtonProps
 *   - style fingerprint matches comp.button tokens (background + radius + padding
 *     + :hover + cursor:pointer + text content)
 *   - the variant maps below are a hand-copied, drifted version of the kit's
 *     `views` / `sizes` — `danger` does not exist in the kit at all
 *
 * Expected top candidate: Button (score ≥ 0.9).
 */
const VIEW_COLORS = {
  primary: '#2969e3',
  secondary: '#f1f3f6',
  danger: '#e31227',
} as const

const SIZE_PADDING = {
  sm: '5px 11px',
  md: '9px 15px',
  lg: '13px 19px',
} as const

const Root = styled.button<{ $view: keyof typeof VIEW_COLORS; $size: keyof typeof SIZE_PADDING }>`
  background: ${(props) => VIEW_COLORS[props.$view]};
  padding: ${(props) => SIZE_PADDING[props.$size]};
  border-radius: 6px;
  border: none;
  color: #ffffff;
  font-family: Inter, sans-serif;
  font-size: 15px;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }
`

export interface MyButtonProps {
  view?: keyof typeof VIEW_COLORS
  size?: keyof typeof SIZE_PADDING
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
}

export const MyButton = ({
  view = 'primary',
  size = 'md',
  disabled,
  onClick,
  children,
}: MyButtonProps): React.ReactElement => (
  <Root type="button" $view={view} $size={size} disabled={disabled} onClick={onClick}>
    {children}
  </Root>
)
