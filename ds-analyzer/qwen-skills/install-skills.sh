#!/usr/bin/env sh
# Установка Qwen-скиллов ds-audit / ds-deep / ds-fix в ~/.qwen/skills/.
# Запускать из каталога дистрибутива (dist/qwen-skills). Единственное действие —
# копирование папок; никакого npm install, сети или сборки.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/.qwen/skills"

for skill in ds-audit ds-deep ds-fix; do
  if [ ! -f "$HERE/$skill/SKILL.md" ]; then
    echo "Ошибка: в $HERE нет $skill/SKILL.md — запускайте скрипт из dist/qwen-skills." >&2
    exit 1
  fi
done

mkdir -p "$TARGET"
for skill in ds-audit ds-deep ds-fix; do
  rm -rf "$TARGET/$skill"
  cp -R "$HERE/$skill" "$TARGET/$skill"
  echo "✓ $skill → $TARGET/$skill"
done

echo
echo "Готово. Перезапустите Qwen Code, затем: /ds-audit"
