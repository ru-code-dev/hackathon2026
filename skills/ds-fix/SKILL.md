---
name: ds-fix
description: Применение автофиксов дизайн-системы после аудита ds-audit — новая ветка, git apply готового диффа, коммит, пуш и Pull Request. Запускай при словах «ds-fix», «примени автофиксы», «закоммить исправления дизайн-системы», «создай PR с фиксами».
---

# ds-fix — ветка → патч → коммит → пуш → Pull Request

Требуется завершённый аудит: в `<PROJECT_DIR>/ui-analyzer/` лежит `patches.json`
(его создаёт команда `patches` скилла **ds-audit**). Нет файла — сначала ds-audit.

Правила стабильности: команды дословно; при ошибке любой команды — показать вывод и
остановиться; файлы проекта руками НЕ править — меняет их только `git apply`;
`git push --force` запрещён всегда.

## Шаг 1 — предполётная проверка

```bash
git -C "<PROJECT_DIR>" rev-parse --is-inside-work-tree
```

Маркер успеха: `true`. Иначе скажи «Каталог не является git-репозиторием — коммит невозможен» и остановись.

```bash
git -C "<PROJECT_DIR>" status --porcelain
```

Если вывод НЕ пуст — задай вопрос `ask_user_question`: «В проекте есть незакоммиченные
изменения. Продолжить поверх них?» (Да, продолжить / Нет, остановиться). «Нет» → остановись.

## Шаг 2 — выбор правок

Прочитай файл `<PROJECT_DIR>/ui-analyzer/patches.json` (он небольшой). Задай вопрос
`ask_user_question` с множественным выбором:

- Вопрос: «Какие правки включить в коммит?»
- Первый вариант, предвыбранный: «Рекомендованные (N решений)» — N из `totals.recommendedGroups`
- Дальше до 3 вариантов — самые крупные группы из `groups` с `recommended: false`:
  подпись — поле `title` группы + `(occurrences×)`

Собери список ключей: для «Рекомендованных» возьми массив `recommendedKeys` целиком,
для остальных выбранных — их `impactKey`. Склей через запятую БЕЗ пробелов → `<KEYS>`.

## Шаг 3 — построить и применить патч

```bash
node "$HOME/.qwen/skills/ds-audit/scripts/ds.mjs" select-patch "<PROJECT_DIR>" --keys "<KEYS>"
```

Маркер успеха: JSON в stdout с полем `path`. Если в JSON есть непустой `skipped` —
покажи пользователю эти строки («пропущено: файл:строка — причина») и продолжай.

```bash
git -C "<PROJECT_DIR>" checkout -b "ds-fix/$(date +%Y%m%d-%H%M)"
```

```bash
git -C "<PROJECT_DIR>" apply --check ui-analyzer/selected.patch
```

Маркер успеха: пустой вывод, код 0. Ошибка → покажи её, ничего не правь, остановись.

```bash
git -C "<PROJECT_DIR>" apply ui-analyzer/selected.patch
```

```bash
git -C "<PROJECT_DIR>" add -A ':!ui-analyzer'
```

```bash
git -C "<PROJECT_DIR>" commit -m "ДС: автофиксы токенов (ds-analyzer)"
```

```bash
git -C "<PROJECT_DIR>" push -u origin HEAD
```

Маркер успеха: код 0. Ошибка пуша (нет прав, нет origin) → покажи её и скажи, что
коммит остался в локальной ветке; остановись.

## Шаг 4 — Pull Request

Задай вопрос `ask_user_question`: «Создать Pull Request?» (Да / Нет — оставить ветку).
«Нет» → сообщи имя ветки и остановись.

«Да» → пробуй по лестнице, переходя к следующей ступени только если текущая недоступна:

1. **MCP системы контроля версий.** Посмотри список доступных MCP-инструментов. Если есть
   инструмент создания pull request (например `create_pull_request`) — вызови его:
   head = текущая ветка (`git -C "<PROJECT_DIR>" branch --show-current`),
   base = ветка по умолчанию (`git -C "<PROJECT_DIR>" remote show origin | grep 'HEAD branch'`),
   title = «ДС: автофиксы токенов (ds-analyzer)»,
   body = список `title` применённых групп + строка «Сгенерировано ds-analyzer».
2. **gh CLI.** `gh pr create --title "ДС: автофиксы токенов (ds-analyzer)" --body "<тот же body>"`
   (выполнять в каталоге `<PROJECT_DIR>`).
3. **Jenkins-вебхук** (корпоративный контур):

```bash
curl -X POST 'https://sbt-jenkins.sigma.sbrf.ru/sberworks/generic-webhook-trigger/invoke?token=77j8ZrC6rpBi7E5E9PpStqQmwsRzOJKj' \
  -H 'Content-Type: application/json' \
  -d "$(node -e 'const fs=require("fs");const dir=process.argv[1];const branch=process.argv[2];const target=process.argv[3];const remote=process.argv[4];console.log(JSON.stringify({repository_url:remote,branch_name:branch,target_branch:target,pr_title:"ДС: автофиксы токенов (ds-analyzer)",pr_body:"Сгенерировано ds-analyzer",diff_content:fs.readFileSync(dir+"/ui-analyzer/selected.patch","utf8")}))' "<PROJECT_DIR>" "<ВЕТКА>" "<БАЗОВАЯ_ВЕТКА>" "<URL_ORIGIN>")"
```

4. Ничего не доступно → выведи пользователю ссылку вида
   `<URL репозитория>/compare/<базовая ветка>...<ветка>` и попроси открыть PR руками.

В конце сообщи результат: ссылка на PR, либо имя ветки и почему PR не создан.
