# YouTube Downloader

Download YouTube media to your **Desktop** with a simple web UI or CLI:

- **MP3** — 320 kbps audio
- **MP4** — H.264 + AAC in MP4 for universal playback (QuickTime, TVs, editors)
- **Thumbnail** — JPG cover image
- **All** — MP3, MP4, and thumbnail in one go

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [ffmpeg](https://ffmpeg.org/) (`brew install ffmpeg`)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (`brew install yt-dlp`)

## Setup (once)

```bash
git clone https://github.com/pbosh/youtube-downloader.git
cd youtube-downloader
npm install
```

## Launch (kill + start)

Kills anything already on port **47823**, then starts the web UI:

```bash
cd youtube-downloader && npm run launch
```

Open [http://localhost:47823](http://localhost:47823), paste a YouTube URL, and choose **Download MP3**, **Download MP4**, **Download Thumb**, or **Download ALL**.

## Kill only

```bash
cd youtube-downloader && npm run kill
```

## CLI

```bash
cd youtube-downloader && npm run cli -- "https://www.youtube.com/watch?v=VIDEO_ID"
```

Optional custom output directory:

```bash
cd youtube-downloader && npm run cli -- "https://www.youtube.com/watch?v=VIDEO_ID" ./my-music
```

## Notes

- Single videos only (no playlists).
- YouTube source audio is often lower than 320 kbps; files are encoded at 320 kbps as requested.
- Thumbnail and metadata are embedded when available.
- Download progress covers the full pipeline (download, convert, merge, metadata, artwork) — see [docs/progress-pipeline.md](docs/progress-pipeline.md).

## Progress testing

```bash
npm run screenshot:all "https://www.youtube.com/watch?v=VIDEO_ID"
```

Captures UI screenshots every 2s during **Download ALL** (requires Playwright; run `npm install` first).

## Desktop app

See [docs/desktop-app.md](docs/desktop-app.md) for building the standalone Electron Mac app.
