#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="${1:-darwin}"
TARGET_ARCH="${2:-$(uname -m)}"

case "$TARGET_ARCH" in
  arm64|aarch64) ELECTRON_ARCH="arm64" ;;
  x86_64|amd64) ELECTRON_ARCH="x64" ;;
  *)
    echo "Unsupported architecture: $TARGET_ARCH" >&2
    exit 1
    ;;
esac

DEST="$ROOT/resources/bin/$PLATFORM/$ELECTRON_ARCH"
mkdir -p "$DEST"

echo "Fetching yt-dlp for $PLATFORM/$ELECTRON_ARCH..."
curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" \
  -o "$DEST/yt-dlp"
chmod +x "$DEST/yt-dlp"

echo "Fetching ffmpeg for $PLATFORM/$ELECTRON_ARCH..."
TMP_ZIP="$(mktemp -t ffmpeg.XXXXXX.zip)"
curl -fsSL "https://evermeet.cx/ffmpeg/getrelease/zip" -o "$TMP_ZIP"
unzip -jo "$TMP_ZIP" "ffmpeg" -d "$DEST" >/dev/null
chmod +x "$DEST/ffmpeg"
rm -f "$TMP_ZIP"

xattr -cr "$DEST" 2>/dev/null || true

echo "Bundled tools:"
ls -lh "$DEST"
