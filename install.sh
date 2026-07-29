#!/usr/bin/env sh
# Установка Qwen-скиллов ds-audit / ds-deep / ds-fix из этого репозитория.
#
#   ./install.sh                  → ~/.qwen/skills (оригинальный Qwen Code)
#   ./install.sh --dir .my-fork   → ~/.my-fork/skills (форк со своим каталогом настроек)
#
# Ни npm, ни сборки: папка skills/ уже собрана и закоммичена. Вся логика — в
# skills/install-skills.sh, этот файл лишь запускает её из корня.
set -eu

exec sh "$(cd "$(dirname "$0")" && pwd)/skills/install-skills.sh" "$@"
