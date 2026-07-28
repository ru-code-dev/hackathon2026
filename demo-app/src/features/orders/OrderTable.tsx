import * as React from 'react'
import { Table, Tag, type ColumnProps, type RecordDataSource } from '@sds-eng/base'

/**
 * FIXTURE: clean reference file.
 *
 * Kit `Table` used as documented. Must produce ZERO findings.
 */
type Order = RecordDataSource<{
  number: string
  customer: string
  status: string
}>

const columns: ColumnProps<Order>[] = [
  { key: 'number', dataIndex: 'number', title: 'Номер' },
  { key: 'customer', dataIndex: 'customer', title: 'Клиент' },
  {
    key: 'status',
    dataIndex: 'status',
    title: 'Статус',
    render: (status: string) => <Tag>{status}</Tag>,
  },
]

const dataSource: Order[] = [
  { key: 1, number: 'A-1041', customer: 'ООО «Ромашка»', status: 'Оплачен' },
  { key: 2, number: 'A-1042', customer: 'ИП Кузнецов', status: 'В сборке' },
  { key: 3, number: 'A-1043', customer: 'ООО «Вектор»', status: 'Отменён' },
]

export const OrderTable = (): React.ReactElement => <Table dataSource={dataSource} columns={columns} />
