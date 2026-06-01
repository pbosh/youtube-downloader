# Desktop App (Electron)

How to build, run, and troubleshoot the standalone Mac app.

## Summary

The **Electron** build is the distribution target:

- Embedded window (no external browser)
- Express server + existing web UI unchanged
- Bundled `yt-dlp` and `ffmpeg` (no Homebrew required)
- Harbor Long skin banner → Dock icon (`macos/AppIcon.icns`)
- Fixed window size hugging the UI panel (~608 CSS px wide)

The older shell launcher (`npm run build:mac-launcher`) opens Safari/Chrome and requires Node on `PATH`. Dev shortcut only.

## Architecture

```
YouTube Downloader.app
├── Electron main (electron/main.cjs)
│   ├── Start Express on 127.0.0.1:47823
│   ├── Configure bundled yt-dlp / ffmpeg paths
│   ├── Seed skins → ~/Library/Application Support/youtube-downloader/skins
│   └── BrowserWindow → http://127.0.0.1:47823/
├── app.asar (dist, public, node deps)
├── app.asar.unpacked/skins (writable skin seed source)
└── Resources/bin/ (yt-dlp, ffmpeg)
```

1. User launches the app.
2. Main process sets `YT_DLP_PATH`, `FFMPEG_PATH`, `SKINS_DIR`.
3. Express serves the UI and download API.
4. Files save to the user’s Desktop.

## Build (Mac)

**Requirements:** Node.js 18+, Xcode CLT (`iconutil`).

```bash
cd youtube-downloader
npm install
npm run build:mac
```

**Output:**

| Artifact | Path |
|---|---|
| App | `dist/electron/mac-arm64/YouTube Downloader.app` |
| DMG | `dist/electron/YouTube Downloader-1.0.0-arm64.dmg` |

**Install:**

```bash
npm run install:mac
```

Or drag the `.app` to Applications / Dock.

**First launch (unsigned):** Right-click → Open if Gatekeeper blocks it.

## Dev commands

| Command | Purpose |
|---|---|
| `npm run electron:dev` | Electron shell against repo (uses system tools if binaries not fetched) |
| `npm run electron:fetch-binaries` | Download yt-dlp + ffmpeg into `resources/bin/` |
| `npm run launch` | Browser-only dev (port 47823) |
| `npm run build:mac-launcher` | Legacy `.app` that opens the system browser |

## Key files

| Path | Role |
|---|---|
| `electron/main.cjs` | Window lifecycle, server boot, binary paths |
| `electron/preload.cjs` | `desktop-app` class, resize IPC (no-op after launch) |
| `scripts/build-electron-mac.sh` | Full Mac build pipeline |
| `scripts/fetch-binaries.sh` | Pull yt-dlp + ffmpeg for darwin/arm64 |
| `scripts/make-app-icon.sh` | Harbor Long banner → `macos/AppIcon.icns` |
| `src/binaries.ts` | Resolve bundled vs PATH tools for yt-dlp/ffmpeg |
| `package.json` → `build` | `electron-builder` config |

## electron-builder config

- **`asar: true`** — pack app code
- **`asarUnpack: ["skins/**"]`** — skins must live outside asar (see fixes below)
- **`extraResources`** — `resources/bin/${platform}/${arch}` → `Resources/bin`
- **`files`** — `dist`, `public`, `skins`, `electron`, `package.json`

## Fixes shipped in this Electron pass

### Skins: `ENOTDIR` on launch

**Problem:** First launch tried `fs.cpSync` from `app.asar/skins` — not a real directory.

**Fix:** `asarUnpack` for `skins/**`; copy from `app.asar.unpacked/skins` into user data.

### Template flash on open

**Problem:** Window appeared before skin CSS loaded (~0.5s of default red template).

**Fix:** Window stays hidden until `document.documentElement` has class `skin-ready` (set after skin CSS loads). No visibility-hiding hacks in HTML.

### Banner stuck when switching skins

**Problem:** Banner update moved inside stylesheet `onload`; cached CSS often skips `onload`.

**Fix:** `applyBanner()` runs **immediately** when a skin is picked; CSS load only gates `skin-ready` / picker render.

### Window snapping to center on download

**Problem:** `fitWindowToContent()` called `win.center()` on every resize IPC (download console, skin change).

**Fix:** Center **once** at first show. `window:resize-to-content` IPC is a no-op so user-placed windows stay put.

### Window size

- **Fixed, non-resizable** (`resizable: false`).
- Initial size from measuring `main` + body padding → **608×~height CSS px** (560px panel + 24px padding each side).
- Not user-resizable; auto-resize after launch disabled to avoid fighting placement.

## Display size on 4K / Retina

The UI is **560 CSS px** wide (`--main-max-width`), not 560 physical pixels.

| Layer | Typical value |
|---|---|
| Panel | 560 CSS px |
| Window content | ~608 CSS px (+ padding) |
| Retina 2× physical | ~1,216 px on screen |
| Fraction of scaled 4K desktop | ~25–32% width |

Electron renders at native DPI; the app feels large on 4K because it uses **fixed logical dimensions** and generous neumorphic spacing — not because it runs at 1× resolution.

To shrink later: lower `--main-max-width`, or a desktop-only Electron `zoomFactor` (e.g. 0.85).

## App size (~950 MB)

| Component | ~Size |
|---|---|
| Electron (Chromium) | 244 MB |
| Bundled yt-dlp + ffmpeg | 115 MB |
| Skins + app code | ~20 MB |
| `app.asar` bloat (dev deps packed) | remainder |

Production deps are small; most asar weight is accidental inclusion of devDependencies (`electron`, `typescript`, etc. in `node_modules` during pack). Fine for personal use; trim `files` / prod install before wider distribution.

## Code signing

Unsigned builds are OK for personal use. For sharing: Apple Developer ID + notarization in `electron-builder` mac config.

## App Store

Not recommended — sandbox blocks subprocesses, Desktop writes, and policy risk for YouTube downloaders.

## Windows / Linux

Add `win` / `linux` targets to `electron-builder` and extend `scripts/fetch-binaries.sh` for platform binaries.
