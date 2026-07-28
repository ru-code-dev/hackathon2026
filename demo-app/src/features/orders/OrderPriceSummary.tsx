import * as React from 'react'
import { Text, Tag } from '@sds-eng/base'

/**
 * FIXTURE: copy 1 of 3 — a component the kit has no equivalent for.
 *
 * There is no "price summary" primitive in the kit and no near-synonym, so the top
 * match score stays below the ambiguity floor. That makes it `component.novel`, which
 * is explicitly NOT a violation (architecture.md §5.5): it is a candidate for the
 * design system.
 *
 * Its candidate rank is driven up by the fact that this exact structure is pasted into
 * three features under three names. Within-project MinHash must group all three, and
 * the "Кандидаты в ДС" screen must show it near the top.
 *
 * The inline `style={{…}}` object is also the fixture for the inline collector.
 */
export interface OrderPriceSummaryProps {
  subtotal: number
  discount: number
  total: number
  currency: string
}

export const OrderPriceSummary = ({
  subtotal,
  discount,
  total,
  currency,
}: OrderPriceSummaryProps): React.ReactElement => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 13, background: '#f7f9fc' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Text>Сумма</Text>
      <Text>{`${subtotal} ${currency}`}</Text>
    </div>

    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Text>Скидка</Text>
      <Tag>{`−${discount} ${currency}`}</Tag>
    </div>

    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#262626', fontSize: 15 }}>
      <Text>Итого</Text>
      <Text>{`${total} ${currency}`}</Text>
    </div>
  </div>
)
