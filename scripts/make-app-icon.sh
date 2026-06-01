#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/skins/freequency-qui-the-free-creativity-logo-he-488d-bd76-d4610c118b16-2/banner.jpg"
ICONSET="$ROOT/macos/AppIcon.iconset"
ICNS="$ROOT/macos/AppIcon.icns"
WORK="$ROOT/macos/.icon-work"

if [[ ! -f "$SOURCE" ]]; then
  echo "Harbor Long banner not found: $SOURCE" >&2
  exit 1
fi

rm -rf "$ICONSET" "$WORK"
mkdir -p "$ICONSET" "$WORK"

# Wide banner → square crop from center (triangle hero), then scale to 1024.
sips -s format png -c 720 720 "$SOURCE" --out "$WORK/base.png" >/dev/null
sips -s format png -z 1024 1024 "$WORK/base.png" --out "$WORK/icon-1024.png" >/dev/null

make_size() {
  local size="$1"
  local out="$2"
  sips -s format png -z "$size" "$size" "$WORK/icon-1024.png" --out "$out" >/dev/null
}

make_size 16  "$ICONSET/icon_16x16.png"
make_size 32  "$ICONSET/icon_16x16@2x.png"
make_size 32  "$ICONSET/icon_32x32.png"
make_size 64  "$ICONSET/icon_32x32@2x.png"
make_size 128 "$ICONSET/icon_128x128.png"
make_size 256 "$ICONSET/icon_128x128@2x.png"
make_size 256 "$ICONSET/icon_256x256.png"
make_size 512 "$ICONSET/icon_256x256@2x.png"
make_size 512 "$ICONSET/icon_512x512.png"
cp "$WORK/icon-1024.png" "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$ICNS"
rm -rf "$ICONSET" "$WORK"

echo "Wrote $ICNS"
