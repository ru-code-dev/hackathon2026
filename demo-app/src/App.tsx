import * as React from 'react'

// Imported through the project's OWN barrel, not from `@sds-eng/base` directly, and
// through the `@/` tsconfig alias on top of that. Both indirections have to be resolved
// before the kit-usage checks below can fire — see `shared/ui/index.ts`.
import { Button, Text } from '@/shared/ui'

import { LoginForm } from './features/auth/LoginForm.js'
import { PasswordField } from './features/auth/PasswordField.js'
import { OrderCard } from './features/orders/OrderCard.js'
import { OrderDialog } from './features/orders/OrderDialog.js'
import { OrderFilters } from './features/orders/OrderFilters.js'
import { OrderPriceSummary } from './features/orders/OrderPriceSummary.js'
import { OrderTable } from './features/orders/OrderTable.js'
import { SettingsTabs } from './features/settings/SettingsTabs.js'

import './shared/styles/theme.scss'

/**
 * FIXTURE: application shell.
 *
 * Planted deviations:
 *   L1  view="ghost"  — not a member of Button's `views`, and reached through the
 *                       project barrel + `@/` alias rather than a direct kit import
 *   L2  #00d4aa       — shade of ref.palette.arctic.arctic300 (ΔE 0.028)
 *   L3  21px          — padding magic number in an inline style
 */
export const App = (): React.ReactElement => {
  const [query, setQuery] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)

  return (
    <div className="app">
      <Text>Заказы</Text>

      <LoginForm />
      <PasswordField value={query} onChange={setQuery} />

      <OrderFilters
        query={query}
        onQueryChange={setQuery}
        onApply={() => {
          setDialogOpen(true)
        }}
        onReset={() => {
          setQuery('')
        }}
      />

      <OrderTable />
      <OrderCard
        number="A-1041"
        customer="ООО «Ромашка»"
        onOpen={() => {
          setDialogOpen(true)
        }}
      />
      <OrderPriceSummary subtotal={1200} discount={100} total={1100} currency="₽" />

      <div style={{ borderTop: '1px solid #00d4aa', padding: 21 }}>
        <Button
          view="ghost"
          size="md"
          onClick={() => {
            setDialogOpen(true)
          }}
        >
          Открыть заказ
        </Button>
      </div>

      <SettingsTabs
        items={[{ id: 'general', label: 'Общие', content: <Text>Общие настройки</Text> }]}
        value="general"
        onChange={() => undefined}
      />

      <OrderDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
        }}
        title="Заказ A-1041"
      >
        <Text>Содержимое заказа</Text>
      </OrderDialog>
    </div>
  )
}
