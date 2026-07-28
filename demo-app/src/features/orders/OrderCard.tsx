import * as React from 'react'
import styled from 'styled-components'
import { Button, Text } from '@sds-eng/base'

/**
 * FIXTURE: styled-components collector target.
 *
 * Planted deviations (see fixtures/expected-findings.json):
 *   L1  #ff1f78   exact ref.palette.pink.pink500      + ref-instead-of-sys
 *   L2  #2969e3   exact sys.Background.backAccent
 *   L3  #ff2078   near ref.palette.pink.pink500 (ΔE ≈ 0.005)
 *   L4  #00d4aa   shade of ref.palette.arctic.arctic300 (ΔE 0.028)
 *   L5  6px       border-radius off the [0,2,4,8,9999] scale
 *   L6  13px      padding magic number
 *   L7  15px      font-size off the type ramp
 *   L8  26px      line-height off-scale next to an on-scale 16px font-size
 *   L9  Inter     foreign font family
 */
const Card = styled.div`
  background: #ff1f78;
  border: 1px solid #2969e3;
  box-shadow: 0 0 0 2px #ff2078;
  outline-color: #00d4aa;
  border-radius: 6px;
  padding: 13px;
  font-size: 15px;
  font-family: Inter, sans-serif;
`

const CardTitle = styled.h3`
  font-size: 16px;
  line-height: 26px;
  font-weight: 500;
  color: #262626;
`

export interface OrderCardProps {
  number: string
  customer: string
  onOpen: () => void
}

export const OrderCard = ({ number, customer, onOpen }: OrderCardProps): React.ReactElement => (
  <Card>
    <CardTitle>{number}</CardTitle>
    <Text>{customer}</Text>
    <Button view="primary" size="sm" onClick={onOpen}>
      Открыть
    </Button>
  </Card>
)
