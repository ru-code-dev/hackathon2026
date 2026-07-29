#!/usr/bin/env sh
# Установка Qwen-скиллов ds-audit / ds-deep / ds-fix.
#
#   ./install-skills.sh                  → ~/.qwen/skills (оригинальный Qwen Code)
#   ./install-skills.sh --dir .my-fork   → ~/.my-fork/skills (форк со своим каталогом)
#   ./install-skills.sh --dir /opt/qw    → /opt/qw/skills (абсолютный путь)
#
# Кроме копирования папок делает одну обязательную вещь: в установленных SKILL.md
# переписывает зашитые пути `$HOME/.qwen/skills/...` на фактический каталог установки —
# иначе сценарии зовут скрипт по несуществующему пути. Больше ничего: ни npm, ни сети.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"

CONFIG_DIR=".qwen"
if [ "${1:-}" = "--dir" ]; then
  if [ -z "${2:-}" ]; then
    echo "Ошибка: --dir требует значение, например: --dir .my-fork" >&2
    exit 1
  fi
  CONFIG_DIR="$2"
fi

case "$CONFIG_DIR" in
  /*) TARGET="$CONFIG_DIR/skills"; SKILL_REF="$CONFIG_DIR/skills" ;;
  *) TARGET="$HOME/$CONFIG_DIR/skills"; SKILL_REF="\$HOME/$CONFIG_DIR/skills" ;;
esac

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
  # sed -i несовместим между GNU и BSD — пишем во временный файл.
  sed "s|\$HOME/\.qwen/skills|$SKILL_REF|g" "$TARGET/$skill/SKILL.md" > "$TARGET/$skill/SKILL.md.tmp"
  mv "$TARGET/$skill/SKILL.md.tmp" "$TARGET/$skill/SKILL.md"
  echo "✓ $skill → $TARGET/$skill"
done

echo
echo "Готово. Перезапустите Qwen Code (или форк), затем: /ds-audit"
