# Skins

Skins change **look only** — downloads, URLs, and file output are unchanged.

The app auto-discovers folders here (except names starting with `_`). Add a folder, refresh [http://localhost:47823](http://localhost:47823), and the skin appears in the picker.

**Design philosophy:** [`docs/neumorphism-design-philosophy.md`](../docs/neumorphism-design-philosophy.md)

---

## Quick start (In Scene + Neumorphism)

Copy the reference skin or template, add your banner, sample colors from the image into `--neu-*` tokens, and keep soft-UI shadow rules.

```bash
cp -R skins/neumorphism skins/my-skin
cp path/to/your-banner.png skins/my-skin/banner.png
```

1. Rename folder (`my-skin` → your id; folder name = internal id, not shown in UI).
2. Set `title` in `skin.json`.
3. Fill the `@skin-analysis` comment at the top of `skin.css` ([schema](../docs/neumorphism-design-philosophy.md#skin-analysis-comment-block)).
4. Map banner colors → `--neu-base`, raised/inset shadow pair, `--accent`, text tokens ([material tokens](../docs/neumorphism-design-philosophy.md#material-tokens---neu)).
5. Set `--banner-aspect-ratio` to **width / height of `banner.png`** (e.g. `1024 / 438`). Picker tiles are square center-crops — see [Scene banner](../docs/neumorphism-design-philosophy.md#scene-banner).
6. Refresh the app.

Working examples: [`neumorphism/`](neumorphism/) (**Neumorphism**), [`neumorphism-portal/`](neumorphism-portal/) (**Portal**), [`freequency/`](freequency/) (**Freequency**), [`freequency-neon/`](freequency-neon/) (**Neon Prism**), [`freequency-cube/`](freequency-cube/) (**Holo Cube**), [`freequency-mist/`](freequency-mist/) (**Mist**).

---

## Folder layout

```
skins/
  my-skin/
    skin.json              required
    skin.css               required — @skin-analysis + :root + selectors
    banner.png             required for In Scene — hero + picker thumbnail
```

| File | Required | Role |
|------|----------|------|
| `skin.json` | Yes | Display name (`title`), fallback `icon` |
| `skin.css` | Yes | Full styling (copy from `neumorphism/` or `_template/`) |
| `banner.png` | Yes* | Wide hero; picker uses center square crop |

\*Without `banner.png`, set `--banner-display: none` and use `icon` / `iconImage` in `skin.json` for the picker only.

Folders prefixed `_` (e.g. `_template/`) are ignored by the picker.

---

## skin.json

```json
{
  "title": "My Skin",
  "icon": "◬"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | **Yes** | Name on **hover** over the picker tile |
| `icon` | No | Fallback emoji/text if no banner (default: `🎨`) |
| `iconImage` | No | Square image filename — picker only when **no** `banner.png` |
| `banner` | No | Banner filename if not `banner.png` |

Picker thumbnail priority: **banner** (center crop) → **iconImage** → **icon**. No text under tiles.

---

## skin.css

Structure matches [`neumorphism/skin.css`](neumorphism/skin.css):

1. **`@skin-analysis` comment** — banner color/opacity notes (stored, not read by app)
2. **`:root` variables** — `--neu-*` material, banner, typography, buttons
3. **Selectors** — `body`, `main`, `.scene-banner`, `.skin-bar-row`, `form`, `form button`, etc.

Do not style `#mp3-btn`, `#video-btn`, or `#thumb-btn` separately. Trio shares one extrusion; ALL uses a deeper shadow stack only.

Banner image path is **not** in CSS — add `banner.png` on disk; app serves `/skins/<id>/banner.png`.

Key banner tokens:

```css
--banner-display: block;
--banner-aspect-ratio: 1024 / 438;   /* width / height of banner.png — scene only; picker auto square-crops */
--banner-min-height: 160px;
--skin-bar-margin: 16px 0 18px;      /* gap below banner frame */
```

---

## Skin bar

[`public/skins.js`](../public/skins.js) — tile hover shows `title`; ♡/♥ is heart-only (no background box); shuffle picks a random skin; ♥ filter; hold tile ~550ms to delete (confirm). Picker order is randomized on each page load.

---

## Checklist

See the full [shipping checklist](../docs/neumorphism-design-philosophy.md#checklist-before-shipping) in the design philosophy doc.
