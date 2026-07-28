# To-Do

Проект: анализатор проектов на дизайн-системе `sds-eng` (`ui-kit-eds-ce`).
Архитектура: [`SPECS/architecture.md`](./SPECS/architecture.md) — единственный источник истины.
Контекст для подхвата: [`HANDOFF.md`](./HANDOFF.md).

Легенда оценок: `XS` < 1 ч · `S` 1–3 ч · `M` 3–8 ч · `L` 1–2 дня

---

## Готово

- [x] **Экстрактор токенов** — `ds-analyzer/src/tokens/`
      2192 токена (ref 317 · sys 258 · comp 1617), 571 CSS-переменная, 7 шкал, 4 обратных индекса, 6 диагностик
- [x] **Экстрактор компонентов** — `ds-analyzer/src/components/`
      61 компонент (57 публичных), 168 React-компонентов, 132 типа пропов / 373 члена, 38 наборов вариантов, 48 наборов слотов / 246 слотов, 462 публичных символа
- [x] **Контракты** — zod-схемы в `ds-analyzer/src/domain/`, типы выводятся из них, артефакт валидируется до записи
- [x] **Тесты** — 254 теста в 23 файлах, покрытие ≈97 % строк, typecheck + lint + prettier зелёные
- [x] **Артефакты** — `ds-analyzer/artifacts/tokens.json`, `components.json`, `extraction-summary.json`, детерминированные
- [x] **Спецификации** — `SPECS/specs.md`, `extract-tokens.md`, `extract-components.md`, `architecture.md`
- [x] **Отчёт по киту** — `REPORT.md`: найденные дефекты + что ещё можно извлечь
- [x] **Слой доступности** — 39 проверок: 9 своих правил + 30 канонических из `eslint-plugin-jsx-a11y`
      Артефакт `kit-a11y.json` (32 компонента, шкала отступов из `@v-uik`), движок контраста,
      категория `a11y` и грань `a11y` на `Finding`, наблюдения подняты до `@5`.
      Обкатано на трёх проектах, спека — [`SPECS/a11y.md`](./SPECS/a11y.md)

---

## Статус на 2026-07-28

| Веха | Статус | Проверено |
|---|---|---|
| **M1 · Оракул** | ✅ готово | 114 размеченных ожиданий (105 M3 + 9 M5) |
| **M2 · Ядро сканера** | ✅ готово | demo-app · ui-kit-eds-ce (2378 файлов) · ds-analyzer · Next.js-фикстура |
| **M3 · Правила и метрики** | ✅ готово | **precision 1.000 · recall 1.000** против оракула; 0 ложных срабатываний API-правил на 684 примерах кита |
| **M4 · Дашборд** | ✅ готово | один HTML без сети; 8 тестов генератора; прогон на 98 и на 1591 находке |
| **M5 · Кастомы и кандидаты** | ✅ готово | скоринг noisy-OR по kit-signatures; **M5 precision 1.000 · recall 1.000** (custom/fork/novel/duplicate); kit-cards.json под ИИ-бюджет |
| **M6 · Агентная обёртка** | ⬜ следующая | вход готов: needsAgent-находки, component.ambiguous, kit-cards.json |

**Сейчас работает:**

```bash
cd ds-analyzer
npm install
npm run analyze -- /path/to/your-project     # → <project>/ui-analyzer/dashboard.html + *.json
npm run scan    -- /path/to/your-project     # только профиль + наблюдения
npm run verify                               # typecheck + lint + 508 тестов
```

Флаги: `--kit-package <name>` (кит переименован), `--exclude <glob>`, `--out <dir>`, `--no-dashboard`.
Чекаут кита для анализа **не нужен** — спека закоммичена в `artifacts/`.

Артефакты: `dashboard.html`, `project-profile.json`, `.cache/observations.json`, `findings.json`, `usage.json`, `summary.json`.

`dashboard.html` открывается двойным кликом, без сервера и без сети: три экрана (Сводка · Находки · Токены и компоненты), интерактивные чарты на Recharts, дифф на `react-diff-viewer-continued`, виртуализованный список, подсветка Shiki на этапе генерации (0 КБ рантайма), состояние проваливания в URL — ссылкой можно делиться.

**Размер:** 931 КБ шаблона + ~3,2 КБ на находку. demo-app (98 находок) — 1,2 МБ; проект на 300 находок — ~1,9 МБ. Репозиторий самого кита с 1591 находкой даёт 6 МБ — это выброс, а не типичный случай.

### Что изменилось против плана

* **Критерий «0 находок на 684 примерах кита» оказался неверным** и заменён на измеримый. Примеры — это демо-обвязка (`<div style={{ display: 'flex', columnGap: 15 }}>`), в ней 384 честных сырых значения. Осмысленная калибровка — API-правила: `prop.invalid`, `api.deprecated`, `style.override.inner`, `font.foreign` дают **ровно ноль** срабатываний на всём корпусе. Зафиксировано тестом `src/rules/calibration.test.ts`.
* **`npm run build` в demo-app не проходит и не должен.** Его зависимость `@sds-eng/base` — воркспейс-пакет неустановленной монорепы. Фикстура нужна для разбора, а не для запуска; сканер обязан работать на неустановленном чекауте, и это отдельно проверено.
* **Размерные правила сузились до свойств, у которых есть замена.** `width`/`height`/`min-*`/`margin*`/`inset`/`top`… исключены: токена, который мог бы их заменить, не существует, а находка без действия — шум. Полный список и обоснование — `demo-app/fixtures/expected-findings.json` → `conventions`.

---

## План реализации — 6 вех

Ниже — сведение 17 шагов в исполнимые блоки. Каждая веха даёт **демонстрируемый результат** и заканчивается зелёными тестами. Детализация по шагам — дальше в документе.

### M1 · Оракул `~3 ч` ✅

> Тестовая база, без которой качество детекторов нечем измерить.

```
demo-app/
├── src/                     дособрать: App, main, vite.config, index.html
│   ├── features/            перевести CSS-модули → SCSS-модули
│   ├── shared/styles/_vars.scss     переменная, используемая в 3+ местах
│   └── shared/ui/legacy/OldCard.tsx форк кита для clone detection
└── fixtures/expected-findings.json  ~70 размеченных находок
```

**Сделано:** 108 ожиданий в `fixtures/expected-findings.json`, 19 из 20 правил.
`component.ambiguous` не посажен намеренно — это диапазон скора, а не паттерн в коде.

---

### M2 · Ядро сканера `~2 дня` — шаги 2, 2bis, 3 ✅

> От «дай путь» до `observations.json`. Синтаксис-зависимая часть заканчивается здесь.

```
ds-analyzer/src/
├── domain/
│   ├── findings.ts          Finding      (architecture.md §6)
│   ├── observations.ts      StyleValue · JsxElement · Import · Declaration
│   └── profile.ts           ProjectProfile
├── scanner/
│   ├── profile/
│   │   ├── root.ts          поиск корня вверх по дереву
│   │   ├── tsconfig.ts      все конфиги + extends
│   │   ├── aliases.ts       5 источников, статический разбор
│   │   ├── ignore.ts        жёсткий список + .gitignore + .dsignore
│   │   └── kit-sources.ts   транзитивное замыкание бочек
│   ├── walk.ts              обход по расширениям, симлинки не идём
│   └── collectors/
│       ├── index.ts         интерфейс Collector + нормализатор
│       ├── tsx.ts           JSX · импорты · объявления · ARIA · теги
│       ├── css.ts           postcss
│       ├── scss.ts          postcss-scss + резолвинг переменных (2 прохода)
│       ├── css-in-js.ts     styled-components · emotion
│       └── inline.ts        style={{…}} · JSS
└── cli/scan.ts
```

**Демо:** `npx tsx src/cli/scan.ts ../demo-app` → `project-profile.json` + `observations.json`.
**Проверка:** отработать на трёх входах — demo-app, сам `ui-kit-eds-ce`, любой сторонний React-проект. Нигде не падать.

---

### M3 · Правила и метрики `~1.5 дня` — шаги 4, 5, 6 ✅

> Чистая функция `(observations, kitSpec) → findings`. Ни ФС, ни синтаксиса, ни ИИ.

```
ds-analyzer/src/rules/
├── index.ts                 реестр правил, единый прогон
├── tokens/
│   ├── color.ts             literal.color: exact · near · shade · foreign
│   ├── dimension.ts         literal.dimension: onScale · offScale · noScale
│   ├── typography.ts        partial — кортеж 3–4 из 5
│   ├── font.ts              foreign
│   └── tier.ts              ref→sys, поиск эквивалента
├── api/
│   ├── props.ts             prop.invalid
│   ├── imports.ts           bypass · internal
│   ├── deprecated.ts        deprecated · dnu
│   └── overrides.ts         style.override.* по CSS-свойствам
├── autofix.ts               генерация fix.after
└── metrics/
    ├── usage.ts             adoption, распределение вариантов
    └── health.ts            health score, чистые файлы
```

**Демо:** `npx tsx src/cli/analyze.ts ../demo-app` → `findings.json` + `usage.json` + `summary.json`.
**Проверка:** precision/recall против оракула ≥ 0.95. Прогон по 684 примерам кита даёт 0 находок.

---

### M4 · Дашборд `~2.5 дня` — шаги 7, 8, 9 ✅

> Веха, после которой это уже продукт. Ноль токенов LLM.

```
ds-analyzer/dashboard/            отдельное Vite-приложение
├── src/
│   ├── components/ui/            shadcn/ui (Radix + Tailwind v4)
│   ├── screens/
│   │   ├── Overview.tsx          health · чарты · treemap файлов
│   │   └── Findings.tsx          виртуализация · фильтры · дифф
│   ├── charts/                   обёртки Recharts
│   ├── lib/url-state.ts          drill-down в URL
│   └── data.ts                   чтение <script id="ds-data">
└── vite.config.ts                vite-plugin-singlefile

ds-analyzer/src/report/
├── highlight.ts                  Shiki на этапе генерации
└── render.ts                     подстановка JSON в шаблон
```

**Демо:** открыть `ui-analyzer/dashboard.html` двойным кликом.
**Проверка:** < 2 МБ, 6 уровней drill-down, состояние в URL, копирование работает.

---

### M5 · Знание о ките и кастомные компоненты — ✅ готово (шаги 10, 11, 12)

```
ds-analyzer/src/kit/
├── examples.ts              684 сниппета → examples-index.json
├── cards.ts                 T0 (~3k токенов) / T1 (~700 на компонент)
├── signatures.ts            propSignature · TF-IDF · ARIA · domShape · синонимы
└── icons.ts                 466 SVG + хеш path

ds-analyzer/src/rules/components/
├── score.ts                 7 эвристик с весами
├── minhash.ts               форки кита + дубликаты внутри проекта
└── rank.ts                  custom · ambiguous · novel + ранг кандидата

dashboard/src/screens/
├── Candidates.tsx           кандидаты в дизайн-систему
└── Tokens.tsx               палитра · гистограммы шкал · матрица компонентов
```

**Демо:** `OrderDialog → Modal` в топе кандидатов, `OrderCard → novel`.
**Проверка:** обратная навигация со стороны кита работает.

---

### M6 · Агентная обёртка `~1.5 дня` — шаги 13–16 ⬅ следующая

```
.claude/
├── skills/
│   ├── ds-audit/SKILL.md    B0 → B → C → D, инкрементальность по хешам
│   ├── ds-deep/SKILL.md     fan-out по needsAgent → E → D'
│   └── ds-fix/SKILL.md      .patch из autoFixable
└── agents/
    └── ds-matcher.md        сниппет + T0 + T1 → код замены

ds-analyzer/src/enrich/
├── prompt.ts                сборка ~8k токенов
├── verify.ts                3 линзы, правило 2 из 3
└── synthesize.ts            темы, паттерны, план миграции
```

**Демо:** `/ds-audit --deep` из Claude Code → дашборд с готовым кодом замен.
**Проверка:** сгенерированный JSX для `OrderDialog` компилируется; `git apply` патча проходит.

---

### Сводка

| Веха | Шаги | Оценка | Что появляется |
|---|---|---|---|
| M1 | 1 | ~3 ч | Оракул |
| M2 | 2, 2bis, 3 | ~2 дня | `observations.json` из любого проекта |
| M3 | 4, 5, 6 | ~1.5 дня | `findings.json`, метрики |
| M4 | 7, 8, 9 | ~2.5 дня | **Дашборд — продукт готов** |
| M5 | 10, 11, 12 | ~2 дня | Кастомы и кандидаты в ДС |
| M6 | 13–16 | ~1.5 дня | Скиллы и ИИ-слой |

**MVP = M1 + M2 + M3 + M4** ≈ 6 дней. Полностью рабочий сканер с дашбордом, без единого токена LLM.

Если время ограничено — резать надо M5 и M6, а не качество M2–M4: детектор кастомов без надёжного сканера бесполезен.

---

## Шаг 1 · demo-app + оракул `S`

Тестовый оракул. Без него качество детекторов нечем измерить.

- [ ] Дособрать `demo-app/` — React + TS + Vite, три способа стилизации
      **Частично готово**, см. [HANDOFF.md](./HANDOFF.md#demo-app--частично-готов)
- [ ] Перевести CSS-модули на SCSS-модули (целевой стек) + добавить `_vars.scss` с переменной, используемой в 3+ местах
- [ ] Добавить недостающие файлы: `App.tsx`, `main.tsx`, `vite.config.ts`, `index.html`, `shared/styles/theme.scss`, `shared/ui/legacy/OldCard.tsx` (форк для clone detection)
- [ ] Добавить дубликат кастома в 3 местах — для `component.duplicate` и ранга кандидата в ДС
- [ ] `fixtures/expected-findings.json` — ~70 размеченных вручную находок: правило, файл, строка, ожидаемая замена
- [ ] Проверить, что покрыты все 20 правил из реестра `architecture.md` §5.9

## Шаг 2 · Контракты `XS`

- [ ] `ds-analyzer/src/domain/findings.ts` — `Finding` по схеме `architecture.md` §6
- [ ] `observations.ts` — `StyleValue`, `JsxElement`, `Import`, `Declaration`, `Skipped`
- [ ] `summary.ts` — health score, метрики, ограничения
- [ ] Схемы валидируют `expected-findings.json` оракула

## Шаг 2bis · Профилировщик проекта `M`

Сканер обязан переваривать **любой** React/TS-проект без настройки. Никаких допущений о `src/`, фреймворке, структуре папок. См. `architecture.md` §3bis.

- [ ] Определение области: вход = файл / папка / корень репо / ничего (→ cwd)
- [ ] Поиск корня вверх по дереву: `package.json` → `.git` → сам путь
- [ ] Сбор **всех** `tsconfig.json` / `jsconfig.json` с раскруткой `extends`, привязка файла к ближайшему
- [ ] Алиасы из 5 источников: tsconfig `paths`, `vite.config.*`, `webpack/craco`, `package.json#imports`, `next.config`/babel `module-resolver`
- [ ] **Конфиги разбираются статически, не выполняются**
- [ ] Игнор: жёсткий список (`node_modules`, `dist`, `.next`, `*.d.ts`, …) + `.gitignore` + `.dsignore` + `--exclude`
- [ ] Расширения: `.ts .tsx .js .jsx .mts .cts .mjs .cjs` + `.css .scss .sass .less .styl`
- [ ] Симлинки не разыменовываются (циклы в монорепах)
- [ ] **Транзитивное определение источников кита** — прямой импорт, алиас/воркспейс, собственная ре-экспортная бочка проекта; замыкание до стабилизации
- [ ] Если кит не используется — сказать прямо, а не показать health 100
- [ ] Определение фактических `styleSyntaxes` — включаются только нужные коллекторы
- [ ] Опциональный `ds.config.json` для нестандартных случаев
- [ ] Устойчивость: ошибка разбора файла → `limitations[]`, сканирование продолжается
- [ ] `project-profile.json` по схеме §3bis.5
- [ ] **Проверка:** работает на demo-app, на самом ките и на произвольном чужом React-проекте без настройки

## Шаг 3 · Коллекторы `M`

Единственное место конвейера, зависящее от синтаксиса.

- [ ] Общий интерфейс `Collector` + нормализатор в `StyleValue[]`
- [ ] `collectors/tsx.ts` — JSX-элементы, импорты, объявления, ARIA-роли, нативные теги
- [ ] `collectors/css.ts` — postcss для `*.css` / `*.module.css`
- [ ] `collectors/scss.ts` — postcss-scss + разрешение цепочек переменных (два прохода, `architecture.md` §4.2)
- [ ] `collectors/css-in-js.ts` — styled-components и emotion, теговые шаблоны
- [ ] `collectors/inline.ts` — `style={{…}}` и объектные литералы JSS
- [ ] Поле `appliedTo` — связь CSS-класса с JSX-элементом, на который он навешен
- [ ] Пометка динамики (`${fn}`, вычисляемые значения) вместо молчаливого пропуска
- [ ] **Проверка:** на demo-app собрано ожидаемое число значений, координаты точные

## Шаг 4 · Токенные правила `M`

- [ ] `token.literal.color` с подвидами `exact` / `near` / `shade` / `foreign` (OKLab ΔE)
- [ ] `token.literal.dimension` с подвидами `onScale` / `offScale` / `noScale`
- [ ] Частотный анализ для свойств без шкалы (padding/gap/margin)
- [ ] `token.typography.partial` — совпадение кортежа 3–4 из 5
- [ ] `font.foreign`
- [ ] `token.tier.violation` + поиск sys-эквивалента для ref-совпадения
- [ ] Генерация авто-фиксов (`fix.after`)
- [ ] **Проверка:** precision/recall против оракула ≥ 0.95

## Шаг 5 · API-правила `S`

- [ ] `prop.invalid` — по `components.variants[].keys`
- [ ] `api.deprecated`, `api.dnu`
- [ ] `import.bypass` (`@v-uik/*`), `import.internal` (`@sds-eng/base/src/…`)
- [ ] `style.override.repaint` / `.inner` / `.important` — политика по CSS-свойствам, `architecture.md` §5.6
- [ ] Классификация обёрток (алиас / дефолты / переопределение / форк), §5.7

## Шаг 6 · Статистика и health score `S`

- [ ] `usage.json` — использование компонентов, распределение вариантов
- [ ] Adoption, token coverage, чистые файлы, компоненты без замечаний
- [ ] Формула health score — публикуется в отчёте
- [ ] Блок ограничений: что не проанализировано и почему

## Шаг 7 · Каркас дашборда `M`

- [ ] `ds-analyzer/dashboard/` — Vite + React 18 + TS
- [ ] Tailwind v4 + shadcn/ui, тёмная тема по умолчанию, токены из `architecture.md` §7.6
- [ ] `vite-plugin-singlefile` → один HTML
- [ ] Чтение данных из `<script id="ds-data">`
- [ ] Роутинг по URL-параметрам (`?screen=…&rule=…&file=…&finding=…`)
- [ ] JetBrains Mono инлайном (variable subset)
- [ ] **Проверка:** `dashboard.html` открывается двойным кликом, < 2 МБ

## Шаг 8 · Экран 1 — сводка `M`

- [ ] Health score, adoption, token coverage, счётчики
- [ ] Чарты на Recharts через `shadcn/ui charts`
- [ ] Карта файлов (treemap: размер = строки, цвет = плотность)
- [ ] Панель «Что хорошо»
- [ ] **Проверка:** клик по сегменту проваливает на экран находок с применённым фильтром

## Шаг 9 · Экран 2 — находки `L`

- [ ] Виртуализированный список (`@tanstack/react-virtual`)
- [ ] Фильтры: severity · правило · файл · autoFixable · confidence
- [ ] Командная палитра (shadcn `Command`) по `/`
- [ ] Карточка находки: дифф (`react-diff-viewer-continued`), контекст ±20 строк
- [ ] Shiki-подсветка **на этапе генерации**, в JSON кладётся готовый HTML
- [ ] Копирование в буфер, «показать все N вхождений»
- [ ] Клавиатура: `j`/`k`, `c`, `f`, `?`
- [ ] **Проверка:** все 6 уровней drill-down работают, состояние в URL

> После шага 9 — законченный продукт без единого токена LLM.

## Шаг 10 · Layer-0 спеки кита `M`

- [ ] `examples-index.json` — 684 сниппета, нормализованных и размеченных
- [ ] Вывод реального API компонентов из примеров (закрывает `props-type-not-found`)
- [ ] `cards.json` — T0 (~3000 токенов на весь кит) и T1 (~700 на компонент)
- [ ] `signatures.json` — propSignature, TF-IDF-веса, ARIA-роли, domShape, синонимы
- [ ] `icons.json` — 466 SVG с нормализованным хешем path
- [ ] **Проверка:** прогон анализатора по 684 примерам кита даёт **0 находок**

## Шаг 11 · Детектор кастомных компонентов `L`

- [ ] 7 эвристик из `architecture.md` §5.5 с весами
- [ ] MinHash + LSH: форки кита и дубликаты внутри проекта
- [ ] Ранжирование кандидатов с человекочитаемыми `reasons`
- [ ] Категории `component.custom` / `.ambiguous` / `.novel`
- [ ] Ранг кандидата в ДС: `использований × log(файлов) × (1 + дублей)`
- [ ] **Проверка:** `OrderDialog → Modal` в топе, `OrderCard → novel`

## Шаг 12 · Экраны 3 и 4 `M`

- [ ] Экран «Кандидаты в дизайн-систему» — ранжирование, код, места использования
- [ ] Экран «Токены и компоненты»: палитра со swatch'ами и ΔE, гистограммы шкал, матрица компонентов
- [ ] Блок «Пробелы кита» — цвета без семантической роли
- [ ] Обратная навигация со стороны кита (компонент → использования → отклонения)

## Шаг 13 · Скилл `ds-audit` `S`

- [ ] `.claude/skills/ds-audit/SKILL.md`
- [ ] Запись в `ui-analyzer/` в корне анализируемого проекта
- [ ] Ограничение обхода путём: `/ds-audit src/features/orders`
- [ ] Инкрементальность по хешам файлов (`.cache/hashes.json`)
- [ ] **Проверка:** одна команда из CLI → дашборд; повторный запуск заметно быстрее

## Шаг 14 · Субагент `ds-matcher` + скилл `ds-deep` `L`

- [ ] `.claude/agents/ds-matcher.md`
- [ ] Сборка промпта: сниппет + T0-каталог + T1-карточки топ-3 + `reasons` ≈ 8k токенов
- [ ] Fan-out по находкам с `needsAgent: true`
- [ ] `enriched-findings.json` + перегенерация дашборда
- [ ] Агент-синтезатор: темы, паттерны, план миграции
- [ ] **Проверка:** сгенерированный JSX для `OrderDialog` компилируется

## Шаг 15 · Состязательная верификация `M`

- [ ] 3 верификатора с разными линзами для `confidence < 0.75`
- [ ] Правило 2 из 3
- [ ] **Проверка:** заведомо неверная замена отбраковывается

## Шаг 16 · Скилл `ds-fix` `S`

- [ ] `.patch` из находок с `autoFixable: true`
- [ ] `--dry-run`
- [ ] **Проверка:** `git apply` проходит, demo-app собирается

---

## Критический путь до первой демонстрации

```
1 → 2 → 2bis → 3 → 4 → 7 → 8 → 9
```

Шаги 5 и 6 параллелятся с 7.

## Осталось по доступности

- [ ] Экран «Доступность» в дашборде — `architecture.md` §7.6, контракт данных в [`SPECS/a11y.md`](./SPECS/a11y.md)
- [ ] Прокинуть `kit-a11y.json` в payload дашборда (`src/report/render.ts`) — для матрицы «что умеет кит»
- [ ] Аудит контраста comp-токенов кита: движок готов и покрыт тестами, правило не написано
- [ ] Отделить демо-код (`__tests__`, `examples/`, `*.stories.tsx`) от продуктового — на ките это 134 находки из 175, свойство сканера, а не правил
- [ ] Расширить оракул: 5 a11y-ожиданий из 113 — для a11y метрика статистически пустая
- [ ] Прогон на стороннем продуктовом проекте: все три найденных ложных срабатывания нашлись так, а не тестами

## Открытые вопросы

- [ ] Нужен ли Tailwind-коллектор — зависит от целевых проектов
- [ ] Порог `component.custom` (сейчас 0.6) — калибруется на demo-app
- [ ] Веса категорий в формуле health score
- [ ] Нужен ли режим CI (exit code при превышении порога)
- [ ] Включать ли соседние пакеты кита (`data-grid`, `rich-textarea`, `tree-dnd`, `browser-tabs`) в спеку
- [ ] Устанавливать ли зависимости кита, чтобы закрыть `external-reexport-unresolved` (25 пакетов) и `props-type-not-found`
