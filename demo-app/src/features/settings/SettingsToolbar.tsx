/**
 * FIXTURE: the accessibility mistakes that have exactly one correct edit.
 *
 * Every other accessibility deviation in this project needs a human to decide the words —
 * the right alt text, the right label, the right colour. These four do not: a role that
 * repeats the tag can only be deleted, a misspelled role has one plausible spelling, a
 * positive tabindex has one correct value, and an autofocus has none. The analyzer must
 * ship each of them as an applicable diff rather than as advice, and this file is what
 * proves it still does.
 *
 * Deliberately free of styles and of kit components: it exists to exercise the patch
 * builders, and any design value here would show up as a token finding that has nothing to
 * do with what is being tested.
 */
import * as React from 'react'

export const SettingsToolbar = (): React.ReactElement => (
  <div className="settings-toolbar">
    {/* `ul` already has role="list"; the attribute survives a refactor that changes the tag. */}
    <ul role="list">
      <li>
        {/* Positive tabindex reorders the whole page, not just this control. */}
        <a href="/settings/profile" tabIndex={3}>
          Профиль
        </a>
      </li>
      <li>
        <a href="/settings/billing">Оплата</a>
      </li>
    </ul>

    {/* `buton` is not a role. The attribute is ignored and the div stays a div. */}
    <div role="buton">Сохранить</div>

    {/* Focus jumps here on mount, throwing away wherever the reader was. */}
    <input autoFocus name="query" placeholder="Поиск по настройкам" />
  </div>
)
