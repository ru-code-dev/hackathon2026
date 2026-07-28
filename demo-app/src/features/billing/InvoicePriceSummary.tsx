import * as React from 'react'
import { Text, Tag } from '@sds-eng/base'

/**
 * FIXTURE: copy 2 of 3 — see `orders/OrderPriceSummary.tsx`.
 *
 * Renamed and reworded, structurally identical. Normalised-AST MinHash must still
 * cluster it with the other two copies; a name-based check would not.
 */
export interface InvoicePriceSummaryProps {
  subtotal: number
  discount: number
  total: number
  currency: string
}

export const InvoicePriceSummary = ({
  subtotal,
  discount,
  total,
  currency,
}: InvoicePriceSummaryProps): React.ReactElement => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 13, background: '#f7f9fc' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Text>Начислено</Text>
      <Text>{`${subtotal} ${currency}`}</Text>
    </div>

    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Text>Списано</Text>
      <Tag>{`−${discount} ${currency}`}</Tag>
    </div>

    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#262626', fontSize: 15 }}>
      <Text>К оплате</Text>
      <Text>{`${total} ${currency}`}</Text>
    </div>
  </div>
)
