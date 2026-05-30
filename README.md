# YouTube Downloader

Download YouTube **320 kbps MP3** audio or **video** (best available format, merged to MP4 when needed) with a simple web UI or CLI.

Files are saved to your **Desktop**.

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

Open [http://localhost:47823](http://localhost:47823), paste a YouTube URL, and click **Download MP3** or **Download MP4**.

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
