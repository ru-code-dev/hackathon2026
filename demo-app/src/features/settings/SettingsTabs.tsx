import * as React from 'react'

/**
 * FIXTURE: hand-rolled tabs.
 *
 * The name gives nothing away beyond `Tabs`, but the ARIA contract is unmistakable:
 *   - role="tablist" / role="tab" / role="tabpanel"
 *   - aria-selected, aria-controls
 *
 * This is the case where the ARIA heuristic carries the detection on its own —
 * prop-signature similarity is weak here ({items, value, onChange} is generic).
 *
 * Expected top candidate: Tabs (score ≥ 0.7).
 */
export interface SettingsTabsProps {
  items: { id: string; label: string; content: React.ReactNode }[]
  value: string
  onChange: (id: string) => void
}

export const SettingsTabs = ({ items, value, onChange }: SettingsTabsProps): React.ReactElement => (
  <div>
    <div role="tablist" aria-label="Настройки">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          aria-controls={`panel-${item.id}`}
          onClick={() => {
            onChange(item.id)
          }}
          style={{
            padding: '9px 14px',
            border: 'none',
            borderBottom: item.id === value ? '2px solid #2969e3' : 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          {item.label}
        </button>
      ))}
    </div>

    {items.map((item) => (
      <div key={item.id} id={`panel-${item.id}`} role="tabpanel" hidden={item.id !== value}>
        {item.content}
      </div>
    ))}
  </div>
)
