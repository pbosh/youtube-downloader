#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="YouTube Downloader"

if [[ -d "$ROOT/dist/electron/mac-arm64/$APP_NAME.app" ]]; then
  SOURCE="$ROOT/dist/electron/mac-arm64/$APP_NAME.app"
elif [[ -d "$ROOT/dist/electron/mac/$APP_NAME.app" ]]; then
  SOURCE="$ROOT/dist/electron/mac/$APP_NAME.app"
else
  echo "Electron app not found. Run: npm run build:mac" >&2
  exit 1
fi

TARGET="/Applications/$APP_NAME.app"

if [[ -d "$TARGET" ]]; then
  rm -rf "$TARGET"
fi

cp -R "$SOURCE" "$TARGET"
echo "Installed to $TARGET"
