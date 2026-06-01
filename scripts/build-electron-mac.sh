#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="YouTube Downloader"

cd "$ROOT"

npm run build
bash "$ROOT/scripts/make-app-icon.sh"
bash "$ROOT/scripts/fetch-binaries.sh"

if [[ ! -f "$ROOT/macos/AppIcon.icns" ]]; then
  echo "Missing macos/AppIcon.icns" >&2
  exit 1
fi

npx electron-builder --mac "$@"

echo
echo "Built Electron app in dist/electron/"
echo "Install: open dist/electron/mac-arm64/$APP_NAME.app (or mac/)"
