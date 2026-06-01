#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv-scaffold"
PY_SCRIPT="scaffold_skins.py"

if [[ "${1:-}" == "--optimize-banners" ]]; then
  PY_SCRIPT="optimize_skin_banners.py"
  shift
elif [[ "${1:-}" == "--label-modes" ]]; then
  PY_SCRIPT="label_skin_modes.py"
  shift
fi

pick_python() {
  for candidate in python3.12 python3.13 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  echo "No python3 found." >&2
  exit 1
}

if [[ ! -x "$VENV/bin/python" ]]; then
  PY="$(pick_python)"
  echo "Creating scaffold venv at .venv-scaffold using $PY …"
  "$PY" -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$ROOT/scripts/requirements.txt"
fi

exec "$VENV/bin/python" "$ROOT/scripts/$PY_SCRIPT" "$@"
