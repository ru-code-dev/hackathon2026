# `extract-tokens` — спецификация

Реализация: `ds-analyzer/src/tokens/`
Выход: `ds-analyzer/artifacts/tokens.json`
Схема: `ds-analyzer/src/domain/tokens.ts` → `tokensArtifactSchema` (`$schema: "ds-analyzer/tokens@1"`)

---

## 1. Модель токенов в `sds-eng`

Кит использует трёхуровневую иерархию. Понимание её обязательно, потому что от неё зависит, какие отклонения вообще можно детектировать.

| Тир | Файл | Что это | Пример | Может ли потреблять продукт |
|---|---|---|---|---|
| `ref` | `packages/theme/src/ref.ts` | Примитивы без семантики: палитра, тайп-рамп, радиусы | `edsRef.palette.pink.pink500 = '#ff1f78'` | Нет — в обход тем |
| `sys` | `packages/theme/src/sys.ts` | Семантические алиасы, свои для светлой и тёмной темы | `edsSys.Background.backAccent = '{edsRef.palette.electric.electric600}'` | **Да, это целевой тир** |
| `comp` | `packages/theme/src/theme/*.ts` + `comp.ts` | Контракты конкретных компонентов | `comp.button.colorBackgroundContainedPrimary` | Нет — потребляется самими компонентами |

Разрешение ссылок выполняет `calcTheme()`:

```
sysLight ──replace({edsRef})──►  light.edsSys
comp     ──replace({edsRef, edsSys})──►  light.comp
```

Синтаксис ссылок — фигурные скобки, порождённые `makeTemplates()`:

```
'{edsRef.palette.pink.pink500}'          обычный алиас
'rgba({edsRef.palette.white},0.06)'      алиас с наложением альфы → #ffffff0f
'0px 1px 2px 0px rgba(10,22,43,0.1)'     литерал, ссылок нет
```

---

## 2. Как загружается тема

**Решение: исходники темы исполняются, а не парсятся.**

Рассмотренные и отклонённые варианты:

| Вариант | Почему отклонён |
|---|---|
| Импортировать собранный `@sds-eng/theme` | `node_modules` кита не установлены, пакета нет в публичном реестре |
| Разобрать AST и вычислить значения самому | Пришлось бы переписать `calcTheme()`, включая нетривиальное слияние `rgba({ref},0.06)` → `#rrggbbaa`. Любое расхождение реализаций тихо испортило бы артефакт |

Исполнение безопасно, потому что `packages/theme` **не имеет ни одного внешнего импорта** — это замкнутый набор объектных литералов и чистых функций. Загрузчик:

1. Проверяет наличие `ref.ts`, `sys.ts`, `comp.ts`, `light.ts`, `dark.ts`, `calcTheme.ts`.
2. Собирает синтетическую точку входа через **esbuild** (`bundle: true`, `format: 'esm'`, `platform: 'neutral'`).
3. Плагин `record-external-imports` перехватывает любой не-относительный импорт. Если такой найден — **экстракция падает** с `ExtractionError`. Это защита от того, что будущая версия кита введёт зависимость и исполнение перестанет быть корректным.
4. Импортирует бандл как `data:`-URL — без временных файлов и без риска подхватить устаревший модуль из кэша.
5. Валидирует форму результата (`edsRef`, `ref`, `sysLight`, `sysDark`, `comp`, `light`, `dark`).

Возвращаются **и авторские, и разрешённые** объекты, поэтому в одном проходе появляется и провенанс, и конечное значение.

---

## 3. Срезы

Тема раскладывается на четыре среза:

| Тир | Авторский источник | Разрешённый источник | CSS-переменные |
|---|---|---|---|
| `ref` | `edsRef` | `light.edsRef` / `dark.edsRef` | **да** |
| `ref` | `ref` (легаси-алиасы гарнитур) | `light.ref` / `dark.ref` | **нет** |
| `sys` | `sysLight` / `sysDark` | `light.edsSys` / `dark.edsSys` | **да** |
| `comp` | `comp` | `light.comp` / `dark.comp` | **нет** |

Легаси-экспорт `ref` вынесен в отдельный срез именно из-за CSS: генератор `createCssVariables.ts` эмитит только `edsRef` и `edsSys`. Слить его с `edsRef` значило бы выдумать CSS-переменные, которых кит не выпускает.

Множество путей среза — **объединение обходов всех четырёх объектов**. Если ключ есть только в одной теме (реальный дефект авторинга), он всё равно попадёт в артефакт, а не исчезнет.

---

## 4. Структура записи токена

```jsonc
{
  "id": "sys.Background.backAccent",       // <tier>.<path...>, стабильный
  "tier": "sys",
  "path": ["Background", "backAccent"],
  "pathString": "Background.backAccent",
  "key": "backAccent",

  "kind": "color",                          // вид значения
  "category": "color",                      // укрупнённая группа

  "authored":  { "light": "{edsRef.palette.electric.electric600}",
                 "dark":  "{edsRef.palette.electric.electric500}" },
  "resolved":  { "light": "#2b5eff", "dark": "#4d78ff" },
  "themeDependent": true,

  "references": {                           // рёбра графа зависимостей
    "light": [{ "raw": "{edsRef.palette.electric.electric600}",
                "tier": "edsRef",
                "path": "palette.electric.electric600",
                "segments": ["palette","electric","electric600"],
                "alpha": null }],
    "dark":  [ /* ... */ ]
  },

  "color": { "light": { "hex": "#2b5effff",
                        "rgba": { "r": 43, "g": 94, "b": 255, "a": 1 },
                        "oklch": { "l": 0.545, "c": 0.238, "h": 264.3 },
                        "hasAlpha": false },
             "dark":  { /* ... */ } },
  "dimension": null,

  "cssVariable": "--sds-eng-Background-backAccent",
  "component": null,                        // только для tier=comp
  "facets": null,                           // только для tier=comp
  "anomalies": []
}
```

### Почему `authored` и `references` — per-mode

Тир `sys` **написан дважды**: `sysLight` и `sysDark` ссылаются на разные примитивы. `forePrimary` в светлой теме — это `gray900`, в тёмной — `gray100`. Одно поле `authored` потеряло бы половину информации. Для `ref` и `comp` оба значения совпадают — это цена единообразия схемы, и она оправдана: потребителю не нужно помнить, у какого тира какая форма.

### Идентичность токена не зависит от темы

Токен, который в тёмной теме выглядит иначе, — это **один** токен, а не два. `themeDependent` отмечает факт различия.

---

## 5. Классификация значений

`kind` определяется **сначала по пути, потом по форме значения**. Порядок принципиален: `borderRadius.none = 0` и `fontWeights.regular = 400` — оба голые числа, и только путь отличает длину от начертания.

Правила по пути (первое сработавшее выигрывает):

```
font+family / font+families   → fontFamily
font+weight / font+weights    → fontWeight
font+size                     → fontSize
line+height / line+heights    → lineHeight
letter+spacing                → letterSpacing
shadow / elevation            → shadow
palette / color               → color
```

Порядок внутри списка тоже важен: `bodyTypographyFontSize` содержит и `font`, и `size`, и должен стать `fontSize`, а не попасть под более широкое правило.

Если путь не дал сигнала — разбирается форма разрешённого значения (не авторского: авторское может быть неразрешённым шаблоном и формы не несёт): ключевое слово → тень → цвет → размер → шрифтовой стек.

Итоговое распределение на текущем ките:

| `kind` | Кол-во | | `category` | Кол-во |
|---|---:|---|---|---:|
| `color` | 1125 | | `color` | 1125 |
| `dimension` | 474 | | `dimension` | 474 |
| `fontSize` | 117 | | `typography` | 492 |
| `lineHeight` | 116 | | `shadow` | 98 |
| `shadow` | 98 | | `other` | 3 |
| `fontFamily` | 88 | | | |
| `fontWeight` | 86 | | | |
| `letterSpacing` | 85 | | | |
| `keyword` | 2 | | | |
| `unknown` | 1 | | | |

`dimension` заполняется **только** для длин (`dimension`, `fontSize`, `lineHeight`, `letterSpacing`). `fontWeight` исключён намеренно: `600` — это начертание, а не 600 пикселей, и его попадание в шкалу засорило бы `allDimensionPx` значениями 300/400/500/600.

---

## 6. Нормализация цвета

Каждый цвет приводится к каноническому `#rrggbbaa` и дополнительно проецируется в **OKLCH**.

Зачем OKLCH, а не сравнение по каналам: анализатору нужно отвечать не только «это точно токен X», но и «это почти токен X». Евклидово расстояние в RGB не соответствует восприятию — `#ff1f78` и `#ff2078` отличаются на 1 в канале, а `#000000` и `#010101` тоже на 1, но воспринимаются совершенно по-разному. В OKLab расстояние перцептивно равномерно, поэтому пороги имеют смысл:

| Расстояние в OKLab | Трактовка для анализатора |
|---|---|
| `0` | Точное совпадение с токеном — автофиксится |
| `< 0.02` | Визуально неотличимо: почти наверняка опечатка или пипетка из Figma |
| `< 0.1` | Осознанный близкий оттенок |
| `≥ 0.1` | Чужой цвет вне палитры |

Поддерживаются формы: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()` с запятыми и в современном слэш-синтаксисе, процентные каналы, ключевые слова `transparent` / `black` / `white`.

Именованные цвета CSS **намеренно не поддерживаются полностью**: при сканировании продуктового кода слово `gold` почти всегда идентификатор, а не цвет, и полная таблица дала бы поток ложных срабатываний.

---

## 7. CSS-переменные

Правило воспроизведено из `packages/theme/src/cssVariables.ts` + `packages/base/createCssVariables.ts`.

Ключевая деталь: **имя тира не входит в путь**. Генератор вызывается уже с развёрнутым тиром (`createCssTemplateFile(theme.edsRef, …)`), а `recursiveGetVariables` стартует с пути `['sds-eng']`. Поэтому:

```
edsRef.palette.pink.pink500        →  --sds-eng-palette-pink-pink500
edsSys.Background.backAccent       →  --sds-eng-Background-backAccent
comp.button.colorBackground…       →  переменной нет
ref.typography.fontFamily.brand    →  переменной нет (срез не эмитится)
```

Регистр сегментов сохраняется. Значение оборачивается в кавычки, если листовой ключ ровно `fontFamily`.

На текущем ките: **571 CSS-переменная**, коллизий нет (проверяется тестом).

---

## 8. Разбор ключей comp-токенов

Ключи `comp`-тира следуют позиционному соглашению:

```
[slot?] [category] [modifiers…] [state?]
```

| Ключ | slot | category | modifiers | state | size | view |
|---|---|---|---|---|---|---|
| `colorBackgroundContainedPrimaryHover` | — | `color` | background, contained, primary | `hover` | — | `contained` |
| `closeButtonShapeBorderRadiusTopLeft` | `closeButton` | `shape` | border, radius, top, left | — | — | — |
| `bodyTypographyFontSize` | `body` | `typography` | font, size | — | — | — |
| `inputShapeBorderRadiusTopLeftMd` | `input` | `shape` | border, radius, top, left, md | — | `md` | — |
| `colorBackgroundSelectableCheckedHover` | — | `color` | background, selectable | `checkedHover` | — | — |

Разбор **эвристический** — машиночитаемой грамматики у кита нет, — поэтому все поля nullable, а `words` всегда сохраняется дословно, чтобы потребитель мог откатиться на сырое сопоставление. Из 1617 comp-токенов не разобрались 2 (`comp-key-unparsed`).

---

## 9. Шкалы

Снимаются **только с тира `ref`**: `sys` и `comp` лишь алиасят примитивы, и их включение раздуло бы шкалу дубликатами, не добавив ни одного разрешённого значения.

```json
{
  "borderRadiusPx": [0, 2, 4, 8, 9999],
  "borderWidthPx":  [0, 2],
  "fontSizePx":     [10, 12, 14, 16, 18, 20, 24, 30, 38, 48],
  "lineHeightPx":   [12, 14, 16, 20, 24, 30, 32, 36, 46, 62],
  "fontWeights":    [300, 400, 500, 600],
  "fontFamilies":   ["SB Sans Display, …", "SB Sans Text, …"],
  "letterSpacing":  ["0"],
  "allDimensionPx": [0, 1, 2, 4, 8, 10, 12, 14, 16, 18, 20, 24, 30, 32, 36, 38, 46, 48, 62, 9999]
}
```

---

## 10. Обратный индекс

Самая нагруженная структура артефакта. Анализатор находит в коде литерал и должен за O(1) узнать, токен ли это, **прежде** чем запускать дорогой перцептивный поиск ближайшего.

```jsonc
{
  "cssVariable": { "--sds-eng-palette-pink-pink500": "ref.palette.pink.pink500" },
  "color":       { "light": { "#ff1f78ff": ["ref.palette.pink.pink500"] }, "dark": { … } },
  "dimensionPx": { "light": { "8": ["ref.borderRadius.l", …] },            "dark": { … } },
  "literal":     { "light": { "SB Sans Text, …": ["ref.fontFamilies.text"] }, "dark": { … } }
}
```

Индексы построены **по темам**, потому что один литерал может быть светлым значением одного токена и тёмным значением другого. Нормализация ключей означает, что `#fff`, `#ffffff` и `rgba(255,255,255,1)` из продуктового кода попадут в одну корзину.

`literal` — «сеть безопасности»: ловит шрифты, тени и ключевые слова, для которых нет специализированного индекса.

---

## 11. Диагностики

| Код | Severity | Кол-во | Смысл |
|---|---|---:|---|
| `spacing-scale-missing` | warning | 14 | В тире `ref` нет шкалы отступов — см. ниже |
| `value-non-finite` | error | 1 | Токен вычисляется в `NaN` |
| `comp-token-literal` | warning | 25 | Comp-токен захардкожен литералом вместо ссылки на тир — не меняется при смене темы |
| `sys-color-theme-invariant` | info | 44 | Семантический цвет одинаков в обеих темах: намеренно для семейств `*Const`, подозрительно для остальных |
| `value-kind-unknown` | info | 1 | Вид значения не выведен |
| `comp-key-unparsed` | info | 2 | Ключ не лёг на соглашение об именовании |

### 11.1 `value-non-finite` — реальный дефект кита

`packages/theme/src/theme/textField.ts:46`

```ts
widthShadowFocus: -THEME_TEMPLATES.edsSys.borderWidth.none,
```

Унарный минус применяется к строке `'{edsSys.borderWidth.none}'` → `NaN`. Токен доезжает до потребителя как `NaN` и отбрасывается браузером как невалидное CSS-значение. В артефакте (JSON не умеет `NaN`) значение сохранено как `null`, а факт зафиксирован в `anomalies: ["non-finite-number"]` — тихое приведение к нулю скрыло бы баг.

Проявляется как `comp.input.widthShadowFocus`: файл называется `textField.ts`, но экспортируемая константа — `input`.

### 11.2 `spacing-scale-missing` — самое важное следствие для анализатора

Тир `ref` содержит только: `palette`, `a`, `Switch`, `fontFamilies`, `lineHeights`, `fontWeights`, `fontSize`, `letterSpacing`, `paragraphSpacing`, `textCase`, `textDecoration`, `borderRadius`, `borderWidth`.

**Шкалы отступов нет.** Padding, margin и gap живут внутри реализаций компонентов (в `@v-uik`), а не в токенах.

Прямое следствие: правило «кастомный padding» **нельзя** определить как «значение вне шкалы» — сравнивать не с чем. Придётся использовать более слабую эвристику: частотный анализ по проекту (значения, встречающиеся один-два раза, подозрительны на фоне доминирующих 4/8/12/16) плюс `allDimensionPx` как приблизительный ориентир. Это ограничение продиктовано китом, и артефакт сообщает о нём явно, чтобы никто не построил правило на несуществующем основании.

---

## 12. Гарантии, закреплённые тестами

`ds-analyzer/src/tokens/extract.test.ts` — интеграционные проверки на реальном ките:

* **Полнота** — множество id токенов совпадает с независимо посчитанным множеством листьев темы (все четыре среза).
* **Достоверность** — каждое разрешённое значение тира `ref` сверяется с тем, что вычислил сам `calcTheme()`.
* **Обратимость** — каждый цвет, размер и CSS-переменная находятся в обратном индексе.
* **Детерминизм** — два запуска дают побайтово идентичный JSON.
* **Схема** — артефакт парсится своей же схемой; сериализуется в JSON без потерь.
* **Отсутствие регрессий** — нет неразрешённых ссылок, нет коллизий CSS-переменных.

`loader.test.ts` дополнительно проверяет, что загрузчик **падает**, а не деградирует, если тема перестала быть самодостаточной или потеряла тир.
