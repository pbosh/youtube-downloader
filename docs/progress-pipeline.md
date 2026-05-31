# Progress pipeline — design, history, and rationale

This document explains how download progress works in the web UI, how we got here, and why the current architecture looks the way it does.

## What we were trying to solve

Users click **Download MP3**, **Download MP4**, **Download Thumb**, or **Download ALL** and expect one honest answer: *“How far through **my** job am I?”*

That job is not just yt-dlp’s byte counter. For MP3 it includes:

1. Prepare (resolve URL, formats)
2. Download source audio/video
3. Extract / convert to MP3 (ffmpeg)
4. Finalize — write metadata, convert artwork, embed thumbnail in the file

For video: download (often split streams) → merge → finalize.  
For **Download ALL**: three full pipelines in sequence, plus a coordinated overall bar.

Early versions felt “fake”: bars stalled during invisible work, snapped backward, showed MP3 progress on unrelated buttons, or jumped from ~45% to 100% when metadata/artwork ran in the background.

## Architecture (current)

We split responsibilities deliberately:

| Layer | File | Role |
|-------|------|------|
| **Truth** | `src/pipeline-progress.ts` | Weighted multi-stage pipeline, `userPercent`, ETA, stage messages |
| **I/O** | `src/download.ts` | Spawn yt-dlp, parse stdout/stderr lines, feed the tracker |
| **Transport** | `src/server.ts` | SSE events; `overallUserPercent` for Download ALL |
| **Display** | `public/progress-engine.js` | Smooth, monotonic bar rendering only — never invents progress |
| **UI** | `public/index.html` | Button bars, console log, EventSource client |

**Principle:** the server owns meaning (`userPercent`, stage, message, ETA). The browser only animates toward that target and never moves backward.

## Weighted stages

Each download kind has a fixed list of stages with weights that sum to 100%:

**MP3**

| Stage | Weight | Typical work |
|-------|--------|--------------|
| prepare | 5% | URL / format resolution |
| download | 27.5% | Byte download (yt-dlp ETA when available) |
| extract | 20% | `[ExtractAudio]` / ffmpeg |
| finalize | 47.5% | metadata, artwork convert, embed |

Finalize gets almost half the bar because users perceived “almost done” at 100% download while ffmpeg + mutagen work was still running.

**Video:** prepare → download (62%) → merge (13%) → finalize (20%).  
**Thumb:** prepare → download → finalize.

Within each stage, progress is a fraction 0–1. Global percent:

```
userPercent = sum(completed stage weights) + (current stage weight × stageFraction)
```

A 200ms heartbeat **creeps** the current stage forward using expected duration when no finer signal exists (e.g. during ffmpeg convert). Download stage creep is disabled while yt-dlp reports a real ETA.

## Signals from yt-dlp

`detectPipelineSignal()` in `pipeline-progress.ts` maps log lines to stage transitions:

- `[info]` / webpage → prepare
- Thumbnail fetch lines → “Fetching artwork…” (early in MP3/video)
- `[download]` percent + ETA → download (ignored once past download stage — stale lines were corrupting merge/finalize messages)
- `[download] 100%` → advance to extract (MP3) or merge/finalize (other kinds)
- `[ExtractAudio]` → extract
- `[Merger]` → merge
- `[Metadata]`, `[ThumbnailsConvertor]`, `[EmbedThumbnail]` → finalize sub-steps with distinct messages

Finalize advances in **thirds** on each sub-signal (metadata → convert art → embed) so the bar moves visibly even when post-processing is fast.

## The root bug: `--print` silenced everything

We originally passed:

```text
--print after_move:filepath
--print title
```

to get the output path and title without guessing. **Side effect:** yt-dlp suppresses normal progress output when `--print` is used. Only the two print fields appeared on stdout — no `[ExtractAudio]`, no `[Metadata]`, no embed lines.

The tracker never entered finalize during the job. The bar crept through prepare/download/extract (heartbeat), then `complete()` jumped straight to 100%. Console showed “Converting to MP3…” then “Done”, skipping metadata/artwork entirely.

**Fix:** remove `--print`. Parse paths from ordinary log lines instead:

- `[ExtractAudio] Destination: …` (MP3)
- `[Merger] Merging formats into "…"` (video)
- `Adding metadata/thumbnail to "…"` (post-processors)

Title comes from the final filename. Thumbnail-only downloads still fall back to scanning the output directory.

This was verified by comparing yt-dlp output with and without `--print` — the difference was immediate and decisive.

## Why not other approaches?

| Approach | Why we rejected or limited it |
|----------|-------------------------------|
| Raw yt-dlp `%` only | Ignores convert, merge, metadata, embed — most of user-perceived MP3 time |
| Fake countdown / fixed ETAs | Feels dishonest when stage length varies |
| Client-side guessing | Duplicated logic; bars fought the server |
| Single shared bar for all buttons | MP3-only download looked like it was also downloading video/thumb |
| Auto-advance extract → finalize without signals | Skipped real finalize phase; bar lied |
| Keeping `--print` and hoping for stderr | Post-processor lines simply never arrive |

## Download ALL

Server runs MP3 → video → thumb sequentially. Each step emits its own `userPercent` and `step` / `stepIndex`. Overall bar:

```
overallUserPercent = (stepIndex - 1 + userPercent/100) / stepTotal × 100
```

The display engine scopes activity to the active step’s button; completed steps stay at 100%.

## Console and ETA

- **Message** and **ETA** are separate fields (ETA is not baked into the message string).
- Prepare: no ETA until we know more.
- Download: yt-dlp ETA when present.
- Post-download stages: adaptive ETA from elapsed time vs stage fraction + remaining stages.

## Testing

Manual: watch SSE or the in-app console during a download.

Automated: Playwright captures the UI every 2 seconds during Download ALL:

```bash
npm run launch
npm run screenshot:all "https://www.youtube.com/watch?v=VIDEO_ID"
```

Screenshots land in `test-output/all-download-screenshots/` (gitignored).

## Files to read first

1. `src/pipeline-progress.ts` — stages, weights, signals, emit logic
2. `src/download.ts` — yt-dlp spawn, line parsing, path extraction
3. `public/progress-engine.js` — monotonic smoothing, per-button scoping
4. `src/server.ts` — SSE shape for single vs ALL downloads

## Maintenance notes

- Do **not** re-add `--print` for filepath/title without checking that progress lines still stream.
- Any new yt-dlp post-processor should get a line matcher in `detectPipelineSignal()` and a weight in the pipeline table if it’s user-visible.
- If bars stall again, compare raw yt-dlp stderr to what `handleLine` receives — buffering or suppressed output is the first suspect.
