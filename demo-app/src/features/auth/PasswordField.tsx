import * as React from 'react'
import { TextField } from '@sds-eng/base'

import styles from './PasswordField.module.scss'

/**
 * FIXTURE: wrapper around a kit component that overrides its styling.
 *
 * This is the "hidden custom" case — it imports the kit, so an import-graph check
 * alone would clear it, yet it repaints the component through the `classes` slot map
 * and targets `input`, a slot the kit does not document as public.
 *
 * Expected classification: wrapper / style-override (not a replaceable custom).
 */
export interface PasswordFieldProps {
  value: string
  onChange: (value: string) => void
}

export const PasswordField = ({ value, onChange }: PasswordFieldProps): React.ReactElement => (
  <TextField
    size="md"
    value={value}
    onChange={onChange}
    placeholder="Пароль"
    className={styles.field}
    classes={{ root: styles.root, input: styles.input }}
  />
)
