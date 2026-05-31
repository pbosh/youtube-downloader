# YouTube Downloader

Download YouTube media to your **Desktop** with a simple web UI or CLI:

- **MP3** — 320 kbps audio
- **MP4** — max quality available (best video + audio, merged to MP4)
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

## Desktop app

See [docs/desktop-app.md](docs/desktop-app.md) for guidance on packaging this as a downloadable desktop app.
