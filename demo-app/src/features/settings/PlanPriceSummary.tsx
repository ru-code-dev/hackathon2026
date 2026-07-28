import * as React from 'react'
import { Text, Tag } from '@sds-eng/base'

/**
 * FIXTURE: copy 3 of 3 — see `orders/OrderPriceSummary.tsx`.
 *
 * Three copies in three features is the strongest possible argument for promoting a
 * component into the library, so this cluster must outrank every single-use candidate.
 */
export interface PlanPriceSummaryProps {
  subtotal: number
  discount: number
  total: number
  currency: string
}

export const PlanPriceSummary = ({
  subtotal,
  discount,
  total,
  currency,
}: PlanPriceSummaryProps): React.ReactElement => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 13, background: '#f7f9fc' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Text>Тариф</Text>
      <Text>{`${subtotal} ${currency}`}</Text>
    </div>

    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Text>Промокод</Text>
      <Tag>{`−${discount} ${currency}`}</Tag>
    </div>

    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#262626', fontSize: 15 }}>
      <Text>Спишется</Text>
      <Text>{`${total} ${currency}`}</Text>
    </div>
  </div>
)
