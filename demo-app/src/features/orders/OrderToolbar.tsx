import * as React from 'react'
import { Button } from '@sds-eng/base'
// Reaches past the public barrel into the package's source tree. Survives bundling, and
// breaks silently on any kit release that reorganises files.
import { Text } from '@sds-eng/base/src/components/Text'
// The kit's own naming says do not use this.
import { LegacyGrid } from '@sds-eng/base/_DNU_ST_'

import styles from './OrderToolbar.module.scss'

/**
 * FIXTURE: the four rules the rest of the corpus does not reach.
 *
 * Planted deviations:
 *   L5   import.internal       `@sds-eng/base/src/…` bypasses the public API
 *   L7   api.dnu               `_DNU_ST_` is the kit's own "do not use" marker
 *   L32  style.override.inner  `contentContainer` is a slot the kit tags @inner
 *   scss token.tier.violation  a ref CSS variable where a sys role exists (:13)
 *   scss token.literal.dimension 2px on the border-width scale (:13, :18)
 */
export interface OrderToolbarProps {
  onExport: () => void
}

export const OrderToolbar = ({ onExport }: OrderToolbarProps): React.ReactElement => (
  <div className={styles.bar}>
    <Text>Действия</Text>

    <Button
      view="primary"
      size="md"
      onClick={onExport}
      classes={{ contentContainer: styles.slot }}
    >
      Экспорт
    </Button>

    <LegacyGrid rows={[]} />
  </div>
)
