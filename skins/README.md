# Skins

Drop a new folder here to add a UI skin. Each skin is **visual only** — download behavior does not change.

## Folder structure

```
skins/
  my-skin/
    skin.json
    skin.css
    banner.png          optional — top banner image
    icon.png            optional — picker thumbnail when no banner.png
```

Folders starting with `_` (e.g. `_template/`) are ignored by the picker.

After adding a folder, refresh the app. The skin appears automatically.

## skin.json

```json
{
  "title": "My Skin",
  "icon": "🎨",
  "iconImage": "icon.png"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Skin name (shown on hover) |
| `icon` | No | Emoji or short text (default: 🎨) |
| `iconImage` | No | Picker image when no banner (center-cropped square) |
| `banner` | No | Banner filename (default: `banner.png` if present). Also used as the picker icon — center square crop |

## Favorites, filter, and cycle

The skin bar is managed by `public/skins.js` (`SkinSystem`):

- **Hover** a skin tile to see its name (tooltip).
- **☆ / ★** on each tile toggles that skin as a favorite (stored in `localStorage`).
- **★ filter** (below CYCLE) shows favorites only in the picker.
- **CYCLE** rotates skins every 30s; when the filter is active, only favorites are cycled.

Storage keys: `youtube-downloader-skin-favorites`, `youtube-downloader-skin-fav-filter`.

## skin.css — variable system

Skins override CSS custom properties on `:root`. The app reads these for **color, opacity, blur, blend modes, filters, layout, typography, shadows, and banner config**.

Copy `skins/_template/skin.css` as a starting point — it lists every available variable with defaults.

### Color

| Variable | Purpose |
|----------|---------|
| `--bg`, `--panel`, `--text`, `--muted`, `--placeholder` | Base palette |
| `--accent`, `--accent-hover` | General accent |
| `--accent`, `--accent-hover` | MP3, MP4, and Thumb buttons (shared) |
| `--accent-all`, `--accent-all-hover` | Download ALL — optional override; defaults to a brighter mix of `--accent` |
| `--border`, `--success`, `--error` | Borders and states |
| `--bg-glow` | Body radial glow color |
| `--skin-bar-bg`, `--skin-option-bg`, `--skin-option-active` | Skin picker |
| `--result-bg`, `--result-border`, `--error-bg`, `--error-border` | Feedback boxes |
| `--input-focus-ring` | Input focus outline |
| `--progress-start`, `--progress-end` | Progress bar gradient |
| `--cycle-color`, `--cycle-active-color` | CYCLE button |
| `--scrollbar-thumb` | Horizontal scroller |

### Opacity (0–1)

`--panel-opacity`, `--banner-opacity`, `--banner-overlay-opacity`, `--skin-bar-opacity`, `--skin-row-opacity`, `--heading-opacity`, `--subtitle-opacity`, `--form-opacity`, `--input-opacity`, `--input-placeholder-opacity`, `--button-opacity`, `--skin-option-opacity`, `--progress-track-opacity`, `--result-opacity`, `--error-opacity`, `--body-glow-opacity`

### Blur (px)

`--panel-blur`, `--skin-bar-blur`, `--skin-row-blur`, `--form-blur`, `--input-blur`, `--banner-blur`, `--result-blur`, `--error-blur`

Applied via `backdrop-filter` and `filter` on the matching elements.

### Filter

`--banner-saturate`, `--banner-contrast`, `--banner-brightness`, `--panel-saturate`, `--panel-contrast` (percent values, e.g. `108%`)

### Blend modes

`--body-blend-mode`, `--panel-blend-mode`, `--banner-blend-mode`, `--banner-overlay-blend-mode`, `--skin-bar-blend-mode`, `--form-blend-mode`

Values: `normal`, `multiply`, `screen`, `overlay`, `soft-light`, `color-dodge`, etc.

### Banner

Enable a full-width top banner with `banner.png` in the skin folder (auto-detected) or `"banner": "your-file.png"` in `skin.json`, then:

```css
--banner-display: block;
--banner-size: cover;              /* or contain */
--banner-position: center center;
--banner-aspect-ratio: 21 / 9;
--banner-min-height: 180px;
--banner-max-height: none;
```

Optional overlay on the banner:

```css
--banner-overlay-display: block;
--banner-overlay-color: rgba(0, 0, 0, 0.45);
--banner-overlay-opacity: 0.6;
--banner-overlay-blend-mode: multiply;
```

The skin picker always sits **below** the banner — never overlapping it. Set `--skin-bar-margin: 0 0 18px` (no negative top margin).

### Layout & spacing

`--main-padding`, `--main-radius`, `--main-max-width`, `--skin-bar-margin`, `--skin-bar-padding`, `--content-padding-x`, `--heading-align`, `--subtitle-align`

### Radius

`--radius-button`, `--radius-input`, `--radius-form`, `--radius-skin-option`, `--radius-skin-cycle`, `--radius-progress`

### Typography

`--font-family`, `--heading-size`, `--heading-weight`, `--heading-spacing`, `--heading-transform`, `--label-size`, `--label-weight`, `--label-spacing`, `--label-transform`, `--heading-shadow`

### Shadows & glow

`--panel-shadow-y`, `--panel-shadow-blur`, `--panel-shadow-color`, `--panel-inset-glow`, `--button-shadow`, `--button-all-shadow`, `--input-shadow`, `--input-focus-shadow`, `--progress-glow`

### Extra CSS

You can still add any selectors beyond `:root` for effects the variables don't cover (pseudo-elements, animations, per-button tweaks). See `freequency/` and `freequency-immersed/`.

## Example skins

| Folder | Style |
|--------|-------|
| `classic/` | Default red dark theme |
| `neon/` | Pink/cyan synthwave |
| `paper/` | Light warm minimal |
| `freequency/` | Palette inspired by reference art |
| `freequency-immersed/` | **In Scene** — wide `banner.png` on top, UI below |

## Image → skin workflow

1. Drop a reference image (and optional wide banner crop)
2. Map image cues to variables (see `_template/skin.css` and table above)
3. For **In Scene** skins: add `banner.png`, set `--banner-display: block`, tune opacity/blur/blend
4. Copy reference as `icon.png` for the picker thumbnail
5. Add extra CSS only where variables aren't enough

When you share an image in chat, ask for an **Inspired** skin (palette/mood) or **In Scene** skin (banner + integrated layout).
