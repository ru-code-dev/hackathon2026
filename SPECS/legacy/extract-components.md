# `extract-components` — спецификация

Реализация: `ds-analyzer/src/components/`
Выход: `ds-analyzer/artifacts/components.json`
Схема: `ds-analyzer/src/domain/components.ts` → `componentsArtifactSchema` (`$schema: "ds-analyzer/components@1"`)

---

## 1. На какие вопросы обязан отвечать артефакт

1. **Входит ли символ `X` в публичный API кита?** → `publicSymbols`
2. **Какие значения допустимы у пропа `view` компонента `Button`?** → `components[].variants`
3. **Какие слоты стилей можно переопределить?** → `components[].slots`
4. **Какой пакет `@v-uik` оборачивает компонент кита?** → `components[].externalDependencies` / `.wraps`
5. **Что кит реэкспортирует из `@v-uik` целиком?** → `externalReExports`

Пятый вопрос — обратная сторона четвёртого. Прямой импорт `@v-uik/button` в продуктовом коде — это обход дизайн-системы, и обнаружить его нельзя, не зная соответствия «компонент кита → апстрим».

---

## 2. Почему извлечение чисто синтаксическое

`node_modules` кита не установлены. Значит:

* тайпчекера нет — `getExportedDeclarations()` и любые операции с типами через пакеты недоступны;
* типы из `@v-uik/*` не разрешаются.

Проект ts-morph поэтому загружается намеренно **без программы**:

```ts
new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,   // не гоняться за @v-uik/*
  compilerOptions: { jsx: preserve, noResolve: true },
})
```

`tsConfigFilePath` не передаётся: конфиг кита включает `packages` целиком, то есть все воркспейс-пакеты.

Всё нужное доступно синтаксически: export-декларации, члены интерфейсов, `as const`-литералы, наличие JSX. Там, где факт действительно требует межпакетных типов, экстрактор **сообщает о пробеле, а не угадывает** — см. §9.

Артефакт объявляет это в метаданных: `meta.typeCheckerAvailable: false`.

---

## 3. Разрешение модулей

Реализовано вручную (проект загружен с `noResolve`). Встречаются три семейства спецификаторов:

| Форма | Вид | Как разрешается |
|---|---|---|
| `./Button`, `../shared/types` | relative | относительно импортирующего файла |
| `@src/shared/constants` | alias | `packages/base/src/*` — алиас из корневого tsconfig кита |
| `@v-uik/base`, `react` | external | не разрешается; сохраняется имя пакета |

Пробуются расширения `.ts`, `.tsx`, `.d.ts`, `.js`, `.jsx`, затем `<base>/index.<ext>` — порядок совпадает с резолвингом Node/TS.

Проверка существования файла вынесена в инжектируемый `FileProbe`. Это позволяет прогонять резолвер на in-memory фикстурах в тестах и оставляет возможность подменить его кэшированным индексом вместо обращения к диску на каждое расширение-кандидат.

---

## 4. Определение React-компонентов

С формы, без типов. Требуется PascalCase-имя — именно оно отделяет компонент от хука или хелпера и совпадает с правилом самого JSX: строчный тег всегда DOM-элемент.

| Форма в исходнике | `detection` |
|---|---|
| `React.forwardRef(...)` / `forwardRef(...)` | `forwardRef` |
| `React.memo(...)` / `memo(...)` | `memo` |
| `function Grid(props) { return <div/> }` | `functionWithJsx` |
| `const Icon = () => <svg/>` | `arrowWithJsx` |
| `class Legacy extends React.Component` | `classComponent` |
| `const Input = PVInput` | `reExportedAlias` |

Приведения типов раскрываются перед анализом — кит использует их, чтобы навесить подкомпоненты:

```tsx
export const Button = React.forwardRef(...) as unknown as ButtonComponent
Button.Icon = Icon
```

Присваивания вида `Parent.Child = …` на уровне модуля собираются в `subcomponents`: потребители пишут `<Button.Icon/>`, и без этой связи анализатор не разрешит такое JSX-имя.

### Исключение демо-файлов

`*.stories.tsx`, `examples/`, `doc/`, `stories/` **загружаются** (нужны для резолвинга и инвентаризации ассетов), но исключаются из API-обходов. Без этого `Button` «объявлял» бы `FilledButtons`, `IconSizes`, `DifferentSizeButtons` — это документация, а не API. Разница ощутима: 956 «компонентов» против 168 настоящих.

---

## 5. Публичная поверхность API

`components/index.ts` — бочка бочек: 40+ локальных директорий через `export *` и 25 пакетов `@v-uik`. Ответ на «публичен ли `Chip`?» требует обхода всего графа.

Обход `collectModuleExports`:

1. Сначала `export * from` — локальные разворачиваются рекурсивно (глубина ≤ 8, защита от циклов по посещённым файлам).
2. Затем именованные реэкспорты — с учётом переименования (`Classes as SelectClasses`) и `export type`.
3. Затем локальные объявления — они **затеняют** реэкспорты, как и в семантике TypeScript.

Внешние `export * from '@v-uik/…'` в имена развернуть невозможно. Они не выдумываются как символы, а записываются как рёбра в `externalReExports` с честным `resolved: false`.

Параллельно `readBarrel` читает бочку **дословно** — какие директории экспортированы, какие пакеты пропущены насквозь, что переименовано и что type-only. Это то, что читает человек; плоский набор символов — то, с чем сопоставляет машина.

---

## 6. Варианты — допустимые значения пропов

Кит кодирует их `as const`-объектами, отображающими **публичное** значение на **внутреннее**, передаваемое в `@v-uik`:

```ts
export const views = { primary: 'primary', secondary: 'secondary', negative: 'error' } as const
export const sizes = { xs: 'sm', sm: 'md', md: 'lg' } as const
```

Частью контракта потребителя являются **только ключи**: `<Button view="error"/>` невалиден, хотя `'error'` стоит справа. Сохраняются обе стороны:

* `keys` — валидация пропов;
* `values` — распознавание сырого использования `@v-uik` в обход маппинга кита.

Вложенные объекты (`ButtonIconSize = { xxs: { size: 'xxs' } }`) дают ключи, но не скалярные значения.

Второй поддерживаемый вид — строковые литеральные юнионы (`type Size = 'sm' | 'md'`).

Ключи с `@deprecated` попадают в `deprecatedKeys`. Распознаётся и опечатка `@depreated`, реально присутствующая в `Tag/constants.ts`, — иначе устаревший размер `lg` молча считался бы актуальным API.

На текущем ките: **38 наборов вариантов**.

---

## 7. Пропы и слоты

Ищутся по соглашению об именовании — `*Props` и `*Classes`, — которому кит следует без исключений. Это единственный доступный способ без тайпчекера, и это то же соглашение, на которое опираются потребители.

Обе группы объявлены как пересечение литерала типа с неразрешимыми типами:

```ts
type ButtonClasses = ButtonProps['classes'] & { spinner?: string; onlyIcon?: string; contentContainer?: string }
```

Литеральная часть даёт настоящие члены; остальное дословно попадает в `extends` / `unresolvedBases`. Артефакт прямо говорит, что список членов неполон, вместо того чтобы намекать, будто у компонента всего три пропа.

Слоты несут флаг `doc.inner` (тег `@inner`): потребитель, целящийся в такой слот, переопределяет приватную стилизацию.

На текущем ките: **132 типа пропов / 373 члена**, **48 наборов слотов / 246 слотов**.

---

## 8. Ассеты

Для каждой директории: сторисы, `.mdx`-доки, тест-файлы, число PNG-снапшотов Playwright, число файлов в `examples/`.

Это не бухгалтерия:

* **Сторисы и примеры — заведомо корректные образцы использования.** Отличный калибровочный корпус: детектор отклонений, срабатывающий на сторисах самого кита, имеет проблему с ложными срабатываниями, и это можно проверять автоматически.
* **Число снапшотов** показывает, насколько жёстко зафиксирован рендер компонента, а значит — насколько уверенно можно называть отклонением его переопределение в проекте. У `Button` — 594 снапшота.

---

## 9. Диагностики

| Код | Severity | Кол-во | Смысл |
|---|---|---:|---|
| `external-reexport-unresolved` | warning | 25 | Пакеты, реэкспортированные целиком; их экспорты не перечислимы |
| `props-type-not-found` | warning | 3 | `Radio`, `Slider`, `Splitter` — контракт пропов целиком в `@v-uik` |
| `do-not-use-exported` | warning | 1 | Бочка реэкспортирует `./_DNU_ST_` |
| `component-not-in-barrel` | info | 4 | `Container`, `Dropdown`, `Grid`, `Labelled` — есть на диске, но не экспортированы напрямую |
| `component-entry-missing` | info | 2 | `Dropdown`, `Labelled` — без `index.ts` |
| `component-passthrough` | info | 2 | `Box`, `Illustration` — кит здесь неймспейс, а не обёртка |
| `public-symbol-deprecated` | info | 9 | В т.ч. `Input`, `BrowserTab`, `SelectProps` |
| `symbol-kind-unresolved` | info | 39 | Вид символа не определён — реэкспорт из неразрешимого пакета |

`external-reexport-unresolved` — самая важная. Она сообщает: **`publicSymbols` (462) — нижняя граница публичного API, а не точный список.** Потребитель, принявший его за исчерпывающий, ошибочно пометил бы любой символ из `@v-uik/grid` как «не из кита». Установка зависимостей кита закрывает этот пробел без изменения контракта.

---

## 10. Что получается на выходе

```
61  директория компонентов (57 публичных)
168 React-компонентов
132 типа пропов / 373 члена
38  наборов вариантов
48  наборов слотов / 246 слотов
462 публичных символа (9 deprecated)
25  нерезолвимых внешних реэкспортов
```

Пример записи (сокращённо):

```jsonc
{
  "name": "Button",
  "directory": "packages/base/src/components/Button",
  "entryFile": "packages/base/src/components/Button/index.ts",
  "public": true,
  "deprecated": false,

  "components": [
    { "name": "Button", "detection": "forwardRef", "subcomponents": ["Icon"],
      "location": { "file": "…/Button.tsx", "line": 11 } },
    { "name": "Icon", "detection": "forwardRef", "subcomponents": [] },
    { "name": "PolymorphicButton", "detection": "forwardRef", "subcomponents": [] }
  ],

  "variants": [
    { "name": "views", "kind": "constObject",
      "keys": ["primary", "secondary", "negative"],
      "values": { "primary": "primary", "secondary": "secondary", "negative": "error" } },
    { "name": "sizes", "kind": "constObject",
      "keys": ["xs", "sm", "md"], "values": { "xs": "sm", "sm": "md", "md": "lg" } }
  ],

  "slots": [
    { "name": "ButtonClasses",
      "slots": [{ "name": "spinner", "doc": { "inner": true, … } }, … ],
      "unresolvedBases": ["ButtonProps['classes']"] }
  ],

  "props": [
    { "name": "ButtonProps", "members": [],
      "extends": ["Omit<PVButtonProps, OmitKeysPVButtonsProps>", "CommonButtonProps"] }
  ],

  "externalDependencies": ["@v-uik/base", "@v-uik/button", "react"],
  "wraps": ["@v-uik/base", "@v-uik/button"],

  "assets": { "stories": ["Button.stories.tsx", …], "docs": ["Button.mdx", …],
              "testFiles": ["__tests__/Button.test.tsx", …],
              "e2eSnapshots": 594, "examples": 13 }
}
```

---

## 11. Гарантии, закреплённые тестами

`ds-analyzer/src/components/extract.test.ts` — на реальном ките:

* **Покрытие** — найдены все директории на диске; экспортированные из бочки помечены публичными.
* **Эталонный кейс** — `Button` даёт ровно три `view`, три `size`, подкомпонент `Icon`, три слота `ButtonClasses` и `@v-uik/button` в `wraps`.
* **Граница** — демо-компоненты из `examples/` не просачиваются в API; `externalReExports` содержит `@v-uik/grid`, `@v-uik/container` и все помечены `resolved: false`.
* **Deprecated** — `Input` помечен устаревшим.
* **Уникальность** — в `publicSymbols` нет повторяющихся имён.
* **Схема и детерминизм** — артефакт парсится своей схемой и побайтово воспроизводим.
