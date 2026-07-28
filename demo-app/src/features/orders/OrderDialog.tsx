import * as React from 'react'
import { Button, Text } from '@sds-eng/base'

import styles from './OrderDialog.module.scss'

/**
 * FIXTURE: custom component that duplicates the kit's `Modal`.
 *
 * Signals the detector must pick up:
 *   - name contains the synonym `Dialog`
 *   - `role="dialog"` + `aria-modal`
 *   - prop set {open, onClose, title, children} ≈ ModalProps
 *   - raw `<div>` overlay instead of the kit's Underlay
 *   - `<button>` close control instead of Button
 *
 * Expected top candidate: Modal (score ≥ 0.75).
 */
export interface OrderDialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export const OrderDialog = ({ open, onClose, title, children }: OrderDialogProps): React.ReactElement | null => {
  if (!open) {
    return null
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.header}>
          <Text>{title}</Text>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className={styles.body}>{children}</div>

        <footer className={styles.footer}>
          <Button view="secondary" size="md" onClick={onClose}>
            Отмена
          </Button>
        </footer>
      </div>
    </div>
  )
}
