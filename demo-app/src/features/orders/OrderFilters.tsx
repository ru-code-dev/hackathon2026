import * as React from 'react'
import { Button, Input, Select } from '@sds-eng/base'
// Bypasses the design system: the kit wraps this package as `Button`.
import { Button as RawButton } from '@v-uik/button'

/**
 * FIXTURE: API-level violations that need no style parsing at all.
 *
 * Planted deviations:
 *   - `view="danger"` — not in Button's `views` ({primary, secondary, negative})
 *   - `size="xl"`     — not in Button's `sizes` ({xs, sm, md})
 *   - `Input`         — exported but marked @deprecated ("Используйте компонент TextField")
 *   - `@v-uik/button` — direct import bypassing the kit wrapper
 */
export interface OrderFiltersProps {
  query: string
  onQueryChange: (value: string) => void
  onApply: () => void
  onReset: () => void
}

export const OrderFilters = ({
  query,
  onQueryChange,
  onApply,
  onReset,
}: OrderFiltersProps): React.ReactElement => (
  <div>
    <Input value={query} onChange={onQueryChange} placeholder="Поиск по номеру" />

    <Select
      options={[
        { value: 'all', label: 'Все' },
        { value: 'paid', label: 'Оплачен' },
      ]}
    />

    <Button view="primary" size="md" onClick={onApply}>
      Применить
    </Button>

    <Button view="danger" size="xl" onClick={onReset}>
      Сбросить
    </Button>

    <RawButton onClick={onReset}>Сброс (raw)</RawButton>
  </div>
)
