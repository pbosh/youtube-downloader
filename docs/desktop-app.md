# Desktop App Distribution

This document covers how to turn the YouTube downloader into a installable desktop app for Mac, Windows, and Linux.

## Summary

**Bundle what you already have.** Do not rewrite the app per platform unless you specifically need Mac App Store or Microsoft Store distribution — and even then, a YouTube downloader is a poor fit for those stores.

The current architecture is already well suited for desktop packaging:

- Local Express server
- Web UI in the browser window
- `yt-dlp` and `ffmpeg` invoked as subprocesses
- Files saved to the user's Desktop

## Recommended approach: wrap the existing app

Use **Electron** or **Tauri** to package the Node server, static UI, and external binaries into a double-clickable app.

| | Electron | Tauri |
|---|---|---|
| Effort | Lowest — reuse Node/Express almost as-is | Medium — Rust shell, still spawns `yt-dlp` |
| App size | ~150 MB+ | ~10–30 MB |
| Maturity | Very proven for this pattern | Lighter, newer |

### Typical packaged flow

1. User launches the app
2. App starts the Express server on a fixed local port (currently `47823`)
3. App opens a window pointing at `http://localhost:47823`
4. App bundles `yt-dlp` and `ffmpeg` binaries (or downloads them on first run)
5. User never runs `npm install` or `npm run launch`

### What to bundle

- Compiled/bundled Node app
- `yt-dlp` binary (per platform: macOS, Windows, Linux)
- `ffmpeg` binary (per platform)
- A small launcher that starts the server and opens the window

## Distribution channels

### Direct download (recommended)

Ship installers outside app stores:

- **macOS:** `.dmg`
- **Windows:** `.exe` installer or portable build
- **Linux:** `.AppImage` or distro package

**Tools:** [electron-builder](https://www.electron.build/) or Tauri + its bundler

Users download, install, and run. No Node.js required on their machine.

**Code signing:** Optional at first. Add Apple/notarization (Mac) and Authenticode (Windows) later to avoid scary install warnings.

### App stores (not recommended for this app)

**Mac App Store** and **Microsoft Store** impose sandboxing that blocks or heavily restricts:

- Spawning arbitrary subprocesses (`yt-dlp`, `ffmpeg`)
- Writing files to the Desktop
- Downloading from YouTube (policy/ToS concerns)

A rewrite for store compliance would be a major effort with limited benefit. Store review may reject YouTube downloaders outright.

## Rewrite per platform?

Only worth considering if you need:

- Minimal native footprint without bundling binaries
- Deep OS integration (menu bar app, Share extension, Finder integration)
- App Store distribution

A native Swift (macOS) or C# (Windows) rewrite is months of work for little gain over Electron/Tauri for this use case.

## Practical roadmap

1. **Electron + electron-builder** — fastest path from the current repo
2. Bundle `yt-dlp` + `ffmpeg` for target platforms (start with macOS if that is your primary audience)
3. Ship unsigned builds for testing
4. Add code signing and notarization when ready for wider distribution
5. Skip app stores unless requirements change

## Next steps in this repo

When ready to implement packaging:

1. Add an Electron main process that starts `src/server.ts` (or compiled `dist/server.js`)
2. Point the BrowserWindow at `http://localhost:47823`
3. Resolve bundled binary paths for `yt-dlp` and `ffmpeg` instead of relying on `$PATH`
4. Configure `electron-builder` for `.dmg` / `.exe` targets
5. Replace user-facing docs with “download the app” instead of `npm run launch`

## Current dev workflow (unchanged)

Until packaging is implemented, run locally with:

```bash
cd youtube-downloader && npm run launch
```

Open [http://localhost:47823](http://localhost:47823).
