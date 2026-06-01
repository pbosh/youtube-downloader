# Batch skins

Create many neumorphism skins from banner art with one command: **`npm run scaffold:skins`**.

Design rules: [`neumorphism-design-philosophy.md`](neumorphism-design-philosophy.md) · folder layout: [`skins/README.md`](../skins/README.md)

---

## Folder layout

```
assets/skin-incoming/
  queued-art-01.png          ← pending (not yet scaffolded)
  queued-art-02.png
  _DONE/
    finished-art.png           ← complete (skin exists / scaffolded)
    another-finished.png
```

| Location | Meaning |
|----------|---------|
| `assets/skin-incoming/` (top level) | **Queue** — waiting to scaffold |
| `assets/skin-incoming/_DONE/` | **Complete** — local source copy for tracking (not in git; large PNGs) |

When scaffold succeeds (default), the source is **copied** to `_DONE/` and **removed** from the queue.

---

## 1. Drop images or videos

Put new banner files in the **top level** of `assets/skin-incoming/` (not inside `_DONE/`).

**Still images:** `.png`, `.jpg`, `.jpeg`, `.webp`

**Video banners:** `.mp4`, `.mov`, `.webm`, `.m4v` — requires **ffmpeg** on PATH. Scaffold copies the video as `banner.<ext>`, extracts frame 0 to `banner-thumb.jpg` for the skin picker, and loops the video in the app banner. There is no still-image fallback if playback fails.

---

## 2. Mark already-finished skins (optional)

If a skin already exists under `skins/` (hand-built or from a prior scaffold), move its source out of the queue:

```bash
npm run mark-skins-done
```

This compares each queued file to every `skins/*/banner.png` by hash. Matches are copied to `_DONE/` and removed from the queue. Run this after dropping in a batch that includes art you've already shipped.

Preview:

```bash
npm run mark-skins-done -- --dry-run
```

---

## 3. Optional manifest

Edit [`scripts/skin-manifest.json`](../scripts/skin-manifest.json) to override auto-naming:

```json
{
  "defaults": {
    "prefix": "freequency",
    "template": "auto",
    "icon": "✦"
  },
  "skins": {
    "my-cool-art.png": {
      "id": "freequency-cool",
      "title": "Cool Art",
      "icon": "◈",
      "template": "dark"
    }
  }
}
```

| Field | Values |
|-------|--------|
| `template` | `auto` (luminance), `dark`, or `light` |
| `id` | Folder under `skins/` |
| `title` | Hover name in picker (auto: random two-word name from word list) |
| `icon` | Fallback emoji if banner missing |

Without manifest entries, id = `freequency-<slug-from-filename>` and title = **two random words** from [`scripts/skin-name-words.txt`](../scripts/skin-name-words.txt) (e.g. "Halo Drift"). Override with `"title"` in the manifest when you want a fixed name.

**Mark complete manually:** add filenames to the `"done"` array in the manifest, then run `npm run mark-skins-done`:

```json
"done": [
  "my-already-finished.png"
]
```

Hash matches against existing `skins/*/banner.*` assets are also detected automatically.

---

## 4. Run scaffold

One-time: `npm run scaffold:skins` creates `.venv-scaffold/` and installs Pillow automatically.

Scaffold everything still in the queue:

```bash
npm run scaffold:skins
```

By default each successful scaffold **copies the source to `_DONE/` immediately** (then removes it from the queue) so you can track progress during a long batch. To leave files in place:

```bash
npm run scaffold:skins -- --no-archive
```

Other flags:

```bash
npm run scaffold:skins -- --dry-run
npm run scaffold:skins -- --force
npm run scaffold:skins -- --jpeg-quality 70
```

**Convert existing PNG banners** (one-time or after manual imports):

```bash
npm run optimize:skin-banners
```

**What the script creates** for each queued file:

**Still image:**

```
skins/<id>/
  banner.jpg     ← JPEG at quality 70 (7/10) from source
  skin.json      ← title, icon, banner filename
  skin.css       ← reference template + auto-extracted palette
```

**Video:**

```
skins/<id>/
  banner.mp4     ← copied from source (extension preserved)
  banner-thumb.jpg ← frame 0 for skin picker thumbnail
  skin.json      ← banner + bannerThumb fields
  skin.css       ← palette sampled from frame 0
```

Each still banner is converted **per image** to `banner.jpg` at **quality 70** (7 on a 0–10 scale). Override with `--jpeg-quality N` (Pillow 1–95). Alpha is flattened onto white before encode. Video thumbs use the same JPEG quality setting.

Reference templates:

- **Dark** → [`skins/_scaffold-dark/`](../skins/_scaffold-dark/)
- **Light** → [`skins/_scaffold-light/`](../skins/_scaffold-light/)

Scaffold picks **dark vs light** from image luminance (`auto`) or manifest override. Progress fill follows deck mode (brighter on dark, darker on light). Skins are **ready to use** after scaffold — refresh the app.

**Titles:** two random words from [`scripts/skin-name-words.txt`](../scripts/skin-name-words.txt) (e.g. "Velvet Nova"). The list has 582 words → **338,142** distinct pairs. To reach ~100k combinations you need **317 words** (317×316 = 100,172). Edit the word list to taste; set `"title"` in the manifest to override.

To tweak a skin later, edit `skin.json` (title/icon) or `skin.css` by hand; see [`neumorphism-design-philosophy.md`](neumorphism-design-philosophy.md).

---

## 5. Verify

```bash
npm run launch
```

Refresh [http://localhost:47823](http://localhost:47823) → shuffle / ← → through skins → favorite filter → one test download.

Optional screenshots:

```bash
npm run screenshot:all
```

---

## What scaffold does

| | Scaffold output |
|--|-----------------|
| Folder + banner + skin.json | ✓ |
| `--banner-aspect-ratio` | ✓ from image/video pixels |
| `--neu-*` + accent hex from image | ✓ sampled palette (frame 0 for video) |
| `@skin-analysis` | auto hex + metadata |
| Body / banner motion & frame | reference template |
| Progress fill (dark/light rule) | ✓ |
| Banner JPEG (quality 7/10) | ✓ per still image |
| Video banner loop in app | ✓ when source is video |
| Source tracking in `_DONE/` | ✓ (default) |

---

## Troubleshooting

**`Missing dependency: Pillow`** — run `npm run scaffold:skins` once (creates venv) or `pip install -r scripts/requirements.txt`

**Video scaffold fails** — install ffmpeg: `brew install ffmpeg`

**Skin already exists** — use `--force` or pick a new `id` in the manifest

**Wrong dark/light** — set `"template": "dark"` or `"light"` in manifest and re-run with `--force`

**Queue file still sitting in incoming after scaffold** — you passed `--no-archive`; otherwise check for scaffold errors

**Hand-built skin but source still in queue** — run `npm run mark-skins-done`
