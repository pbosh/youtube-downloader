#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="YouTube Downloader"
BUILD_DIR="$ROOT/dist/macos"
APP="$BUILD_DIR/$APP_NAME.app"
PAYLOAD="$APP/Contents/Resources/app"

cd "$ROOT"

echo "Building TypeScript..."
npm run build

echo "Generating Harbor Long app icon..."
bash "$ROOT/scripts/make-app-icon.sh"

echo "Assembling $APP_NAME.app..."
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$PAYLOAD"

cp "$ROOT/macos/Info.plist" "$APP/Contents/Info.plist"
cp "$ROOT/macos/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp "$ROOT/macos/launcher" "$APP/Contents/MacOS/launcher"
chmod +x "$APP/Contents/MacOS/launcher"

rsync -a "$ROOT/dist/" "$PAYLOAD/dist/"
rsync -a "$ROOT/public/" "$PAYLOAD/public/"
rsync -a "$ROOT/skins/" "$PAYLOAD/skins/"
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$PAYLOAD/"

echo "Installing production dependencies into app bundle..."
(
  cd "$PAYLOAD"
  npm ci --omit=dev
)

echo
echo "Built: $APP"
echo "Install to Applications: npm run install:mac"
echo "Or drag the app from dist/macos/ to your Dock."
