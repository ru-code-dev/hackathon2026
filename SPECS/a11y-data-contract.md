# A11y-слой: контракт данных для UI

Версия: 1
Дата: 2026-07-28
Статус: логика реализована, покрыта тестами и обкатана на трёх проектах; UI не начат
Связанные: [`a11y-research.md`](./a11y-research.md), [`architecture.md`](./architecture.md)

Этот документ описывает **всё, что a11y-слой кладёт в данные**, чтобы экран доступности можно было построить, не читая код анализатора. Ничего нового изобретать не нужно: a11y — это грань существующих сущностей, а не параллельная ветка.

---

## 1. Где именно появляются данные

Три места, все уже существуют:

```
ds-analyzer/artifacts/kit-a11y.json     ← НОВЫЙ артефакт: что умеет сам кит
<project>/ui-analyzer/findings.json     ← findings[].category === 'a11y' + поле a11y
<project>/ui-analyzer/summary.json      ← byCategory.a11y + limitations[]
```

Дашборд получает `findings.json` и `summary.json` внутри `window.__DS_DATA__` как обычно. **`kit-a11y.json` в payload пока не попадает** — если экрану нужна матрица «что умеет кит», её надо добавить в генератор отчёта отдельно (см. §6).

---

## 2. Грань `a11y` на находке

Добавлена в `findingSchema` как **вложенный nullable-объект**, а не три плоских поля:

```ts
a11y: {
  wcag: string[]        // ['1.4.3'] — критерии успеха; [] если критерий не применим
  pattern: string | null // 'tabs', 'dialog-modal', 'tablist' — паттерн/роль; null вне паттернов
  impact: string        // одна фраза: что теряет пользователь. Никогда не пустая
} | null
```

`null` на всех находках, кроме a11y-правил. Поле **всегда присутствует** в JSON явным `null` — артефакт коммитится и диффится, поэтому форма стабильна.

`impact` — не пересказ правила, а последствие. Пример: «Навигация с клавиатуры становится невидимой — непонятно, какой элемент сейчас активен». Это то, что стоит показывать крупно, а `why` — мелко.

**Категория `'a11y'`** добавлена в `findingCategorySchema` и в `summary.findings.byCategory`. На demo-app сейчас:

```json
{"token":81,"typography":1,"font":4,"api":7,"override":5,"component":0,"icon":0,"a11y":5}
```

---

## 3. Реестр правил

Десять правил, все детерминированные, ноль токенов LLM. Девять — свои; десятое, `a11y.lint`, оборачивает канонический `eslint-plugin-jsx-a11y` (30 активных правил), потому что базовый слой воспроизводить руками нельзя: спека дрейфует, а ручная реализация accname в этом же проекте уже дала 11 ложных из 11.

| Правило | Severity | subkind | `a11y.wcag` | autoFix | needsAgent |
|---|---|---|---|---|---|
| `a11y.focus.suppressed` | error | `blanket`, `onFocus` | `2.4.7` | ✗ | ✗ |
| `a11y.pattern.keyboard` | error / warning | `noHandler`, `handlerUnreadable` | `2.1.1` | ✗ | ✅ |
| `a11y.pattern.focus` | error | `noEscape`, `noFocusTrap` | `2.1.2`, `2.4.3` | ✗ | ✅ |
| `a11y.pattern.relations` | error / warning | `danglingId`, `unmatchedExpression` | `1.3.1`, `4.1.2` | ✗ | частично |
| `a11y.aria.invalid` | error / warning | `unknownRole`, `abstractRole`, `unknownAttribute`, `unsupportedAttribute`, `prohibitedAttribute` | `4.1.2` | ✗ | ✗ |
| `a11y.aria.required` | error | имя роли (`checkbox`, `slider`, …) | `4.1.2` | ✗ | ✗ |
| `a11y.aria.redundant` | info | `null` | — | ✅ | ✗ |
| `a11y.name.missing` | error | `iconOnly`, `unlabelled` | `4.1.2` | ✗ | ✅ |
| `a11y.contrast.text` | error / warning | `normalText`, `largeText` | `1.4.3` | ✗ | ✗ |
| `a11y.lint` | error / warning / info | **имя правила плагина** (`alt-text`, `click-events-have-key-events`, …) | 1.1.1, 1.2.2, 1.3.1, 1.3.5, 2.1.1, 2.2.2, 2.4.3, 2.4.4, 3.1.1, 4.1.2 | ✗ | ✗ |

У `a11y.lint` **`subkind` — это имя правила плагина**, по нему же ищется документация. Дашборду стоит группировать по нему, а не показывать 58 одинаковых строк. Severity назначается нами, а не линтером: `alt-text` — `error`, `click-events-have-key-events` — `warning`, `prefer-tag-over-role` — `info`. Неклассифицированное правило (появившееся после обновления плагина) всё равно попадает в отчёт — `info` без критерия.

**Severity зависит от подвида**, а не только от правила: `pattern.keyboard/noHandler` — `error` при `confidence 0.95`, а `handlerUnreadable` — `warning` при `0.5` и `needsAgent: true`. UI не должен считать severity функцией от `rule`.

### Что показывать в карточке

* `expected.component` заполнен у `pattern.keyboard` и `pattern.focus` — это **канонический компонент кита**, уже выбранный (`Tabs`, а не `BrowserTabs`; `Modal`, а не `DatePicker`).
* `candidates[]` заполнен у тех же двух правил: `{component, score, reasons[]}`, где `reasons` — человекочитаемо («рендерит role="tablist"», «обрабатывает ArrowLeft, ArrowRight», «управляет фокусом»).
* `rootCause` заполнен у `pattern.focus` (указывает на объявление компонента) и у `contrast.text`/`focus.suppressed`, когда значение пришло из SCSS-переменной.
* `expected` = `null` у `aria.*`, `name.missing`, `contrast.text` — предложить готовую замену нечем, и выдумывать её нельзя.

---

## 4. `kit-a11y.json` — что умеет сам кит

Собирается из установленного `@v-uik`: `npm run extract:kit-a11y`.

```jsonc
{
  "$schema": "ds-analyzer/kit-a11y@1",
  "meta": {
    "upstreamVersion": "1.23.0",
    "packagesScanned": 63,
    "upstreamAvailable": true    // false ⇒ все коллекции пусты, см. §5
  },
  "patterns": [
    {
      "component": "Tabs",
      "packages": ["@v-uik/tabs"],
      "matchedBy": "wraps",          // 'wraps' | 'name' — как найден апстрим
      "roles": ["tab", "tablist"],
      "ariaAttributes": ["aria-selected", "aria-controls", "aria-orientation"],
      "keysHandled": ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"],
      "managesFocus": true
    }
  ],
  "spacing": {
    "steps": [{ "px": 0, "occurrences": 99 }, { "px": 4, "occurrences": 36 }],
    "offGridSteps": [{ "px": 2, "occurrences": 8 }],
    "totalDeclarations": 281,
    "coverage": 0.97,
    "gridBase": 4,
    "gridCoverage": 0.907
  },
  "diagnostics": [{ "code": "…", "severity": "info", "message": "…", "samples": [], "count": 0 }]
}
```

Текущие цифры: **32 компонента** с a11y-признаками (16 найдены по имени, потому что импортируют через бочку `@v-uik/base`), шкала **0/4/8/12/16/20/24/32** при 90.7% покрытии сетки, вне сетки — 2/6/10/15.

Диагностики: `spacing-scale-derived`, `kit-widget-without-keyboard-evidence`, `upstream-not-installed`.

### Как это подавать в UI

`matchedBy: 'name'` — **догадка**, и она должна быть видна как догадка. То же с `spacing`: это шкала, которой кит следует, а не публикует. Отклонение от неё стоит `info`, а не `error`, в отличие от опубликованной шкалы радиусов.

---

## 5. Отличать «чисто» от «не проверено»

Самое важное для UI. Пустой список a11y-находок означает **одно из двух**, и путать их нельзя.

Без установленного `@v-uik` правило `a11y.pattern.keyboard` молчит — но не молча: оно заявляет об этом через `summary.limitations[]`:

```jsonc
{
  "file": "src/features/settings/SettingsTabs.tsx",
  "line": 23,
  "reason": "spec-unavailable",     // новый код, отличается от parse-error и dynamic-styles
  "detail": "Клавиатурная доступность виджета не проверена: артефакт kit-a11y.json не собран…"
}
```

**Правило для UI:** если в `limitations[]` есть хоть один `spec-unavailable`, шапка раздела «Доступность» обязана сказать, что проверка неполная. Пустой список находок рядом с молчаливой лимитацией читается как «здесь чисто» — это ложь, и она хуже, чем отсутствие раздела.

Прочие лимитации, которые касаются a11y косвенно: `dynamic-styles` (значение не вычислено), `parse-error` (файл не разобран).

---

## 6. Чего в данных пока нет

Честный список, чтобы UI не проектировался под то, чего не существует.

1. **`kit-a11y.json` не попадает в payload дашборда.** Экран «что умеет кит» (матрица компонент × роли × клавиши) потребует правки генератора `src/report/render.ts`.
2. **Нет агрегата по WCAG.** `summary` не содержит `byWcag`. Считается по `findings[].a11y.wcag` на клиенте — их немного, это дёшево.
3. **Нет контраста токенов кита.** Движок (`src/a11y/contrast.ts`) готов и покрыт 16 тестами, но правило считает только пары, найденные в коде проекта. Аудит comp-токенов кита (пары `colorText*`/`colorBackground*` по конвенции имён) не написан.
4. **Нет отделения демо-кода.** Находки в `__tests__`, `examples/` и `*.stories.tsx` смешаны с продуктовыми. Для отчёта по библиотеке это шум; фильтр по пути — вопрос к сканеру, а не к правилам.
5. **Нет отдельной оси «A11y» в health score.** `healthScore` остаётся одним числом; a11y-находки входят в него наравне с остальными по severity. Если ось нужна, её надо добавить в `summarySchema`.
6. **APG не извлечён.** Контракт паттернов сейчас — список из 11 ролей внутри `pattern-keyboard.ts` плюс данные `aria-query`. Артефакта `apg-patterns.json` нет.

---

## 7. Границы правил — что UI не должен обещать

Формулировки в интерфейсе не должны быть сильнее того, что проверено.

| Правило | Не видит |
|---|---|
| `pattern.keyboard` | `role={expr}` — только литеральные роли. Паттерн, размазанный по файлам |
| `pattern.focus` | Фокус, перенесённый через внешний хук. Признаки читаются синтаксически |
| `pattern.relations` | Целевой элемент в другом файле — тогда `danglingId` ложный, и `note` про это говорит |
| `name.missing` | Текст из выражения (`{label}`) и дочерний компонент — вердикт «недоказуемо», правило молчит |
| `focus.suppressed` | Объектные стили (`jss`, `inline-style`, `ts-literal`): вложенность схлопывается при сборе, состояния не различимы → лимитация вместо находки |
| `contrast.text` | Унаследованный фон. Пара считается, только если `color` и `background` в одном блоке |
| `aria.invalid` | Атрибуты на компонентах — роль кастомного компонента неизвестна |
| всё | Порядок фокуса, экранные дикторы, зум — статически неразрешимо |

Каждое из этих ограничений уже отражено в `note` соответствующих находок. UI стоит показывать `note` рядом с `why`, а не прятать.

---

## 8. Как воспроизвести

```bash
cd ds-analyzer
npm run extract:kit-a11y          # нужен установленный @v-uik, см. ниже
npx tsx src/cli/analyze.ts ../demo-app
# → demo-app/ui-analyzer/{findings,summary,usage}.json + dashboard.html
```

`@v-uik` ставится из корпоративного реестра и **требует scoped-конфига** — без него `npm i` падает на публичном `react`:

```
# ui-kit-eds-ce/.vuik/.npmrc
@v-uik:registry=https://gitverse.ru/api/packages/sbertech/npm/
```

Анализатор ищет апстрим в `<kit>/node_modules/@v-uik`, затем в `<kit>/.vuik/node_modules/@v-uik`. Без него всё работает, но `kit-a11y.json` пишется с `upstreamAvailable: false`.

---

## 9. Состояние проверок

```
typecheck  ✅  анализатор + дашборд
lint       ✅
prettier   ✅
тесты      ✅  664 / 51 файл
оракул     ✅  precision/recall ≥ 0.95, 113 ожиданий (5 из них a11y)
калибровка ✅  684 примера кита → 0 находок
апстрим    ✅  9 проверок против настоящего @v-uik (пропускаются, если не установлен)
```

### Обкатка на реальном коде

| Проект | Файлов | A11y-находок | Ложных |
|---|---|---|---|
| `demo-app` (фикстура) | 18 | 6 | 0 |
| `ds-analyzer/dashboard` (React+Tailwind, писал не я) | 18 | 11 | 0 |
| `ui-kit-eds-ce/packages/base` (реальный, ~1000 файлов) | 967 | 78 | 0 |

На ките 4 находки в продакшн-коде, 16 — в `__tests__`, `examples/` и `*.stories.tsx`. Отделять демо-код от продуктового сканер пока не умеет; это общее свойство всех правил, не только a11y.

**Первый прогон на дашборде дал 11 ложных срабатываний из 11**, все — `name.missing`. Это и переписало правило: см. §7.

Калибровка — важнейшая из них: прогон всех девяти a11y-правил по собственным примерам кита не даёт ни одной находки. Детектор, срабатывающий на эталонном коде, откалиброван неверно.
