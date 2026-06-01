# Neumorphism Design Philosophy

How to skin the YouTube Downloader using **soft UI (Neumorphism)**: depth from dual directional shadows on a single matte surface, colors sampled from the banner image, and no decorative artifacts on controls.

**Reference implementation:** [`skins/neumorphism/`](../skins/neumorphism/)  
**Folder layout & variables:** [`skins/README.md`](../skins/README.md)

---

## Core principles

**Single-surface material**  
Every control shares one `--neu-base` hue derived from the banner. Elements look molded from the same plane—not recolored widgets dropped on top.

**Shadow-only depth**  
Extruded (raised) elements use light top-left + dark bottom-right outer shadows. Recessed (inset) elements invert that pair. Do not use `backdrop-filter`, glass blur, or neon glow on chrome unless documenting banner-only color in analysis.

**Banner supplies color; UI supplies form**  
Pick base, shadow, highlight, and accent hues from the source image. Banner secondaries may tint focus rings and chrome—not rainbow button fills, gradient progress bars, or blurred streaks on Download ALL.

**Typography unity**  
Description, buttons, and URL placeholder share one family, size, and weight ladder. Placeholder is lighter than body copy; entered URL text uses `--text` for contrast.

**Analyze once in `@skin-analysis`**  
The comment block at the top of `skin.css` records what you saw in the banner. Tune CSS against that block—not the PNG on every edit.

**In Scene layout**  
Wide `banner.png` on top in a recessed frame; skin picker below with spacing; control deck under copy. Picker thumbnails are always square—never set `--banner-aspect-ratio: 1 / 1` for a wide file.

**Button ladder (non-negotiable)**  
MP3, MP4, and Thumb share identical neumorphic extrusion. Download ALL uses the same fill and type but a deeper shadow stack—never a different hue family or gradient artifact.

**Light from top-left**  
All raised shadows assume one consistent light source. Do not mix inset and extrude on the same face without a state change (default / pressed).

---

## Material tokens (`--neu-*`)

**`--neu-base`**  
The deck color—a matte average of the banner’s dominant neutrals (blocks, mist, floor), slightly darker than paper white so shadows read clearly.

**`--neu-raised-light`**  
Highlight shadow color (top-left). Pull from the palest fog or block highlight in the image; never pure `#ffffff` on colored decks.

**`--neu-raised-dark`**  
Depth shadow color (bottom-right). Pull from the deepest sage, teal-gray, or floor tone in the banner.

**`--neu-inset-light`**  
Inner highlight for recessed wells (bottom-right inside the cavity). Slightly lighter than `--neu-base`.

**`--neu-inset-dark`**  
Inner shadow for recessed wells (top-left inside the cavity). Slightly darker than `--neu-raised-dark` for readable troughs.

**Extruded shadow pair (standard)**  
`6px 6px 12px var(--neu-raised-dark), -6px -6px 12px var(--neu-raised-light)`. Default raise for trio buttons and small tiles.

**Extruded shadow pair (emphasis)**  
`9px 9px 18px` / `-9px -9px 18px`. Reserved for Download ALL and other primary extrusions—same colors, larger offset.

**Inset shadow pair (standard)**  
`inset 4px 4px 8px var(--neu-inset-dark), inset -4px -4px 8px var(--neu-inset-light)`. Default pressed state and shallow recesses.

**Inset shadow pair (deep)**  
`inset 5–7px` variants for form deck, banner frame, and URL field—deeper trays that hold content.

**No border lines**  
Prefer `--border: transparent` and let shadow edges define shape. Hard 1px borders break the soft-mold illusion.

---

## Color tokens (from banner → CSS)

**`--bg` / `--panel`**  
Both map to `--neu-base` so body, main, and panels are one continuous surface.

**`--text`**  
Dark sage or charcoal sampled from readable shadow areas in the banner—used for entered URL text and primary labels.

**`--muted`**  
Mid-tone from block edges or atmospheric gray-green—used for the description paragraph.

**`--placeholder`**  
Lighter than `--muted`, same hue family—used only for URL prefill, never for body copy.

**`--accent`**  
One vivid hue from the hero (often triangle pink). Use sparingly: focus rings, active picker outline, fav-filter active icon—not button fills.

**`--accent-hover`**  
Slightly deeper or richer variant of `--accent` for hover on accent-colored chrome only.

**`--accent-teal` / `--accent-peach` / `--accent-gold`**  
Secondary banner hues for optional ambient body washes and focus chrome—never assigned per download button or progress fill.

**`--button-fill` / `--button-fill-hover`**  
Always `--neu-base`. Hover changes shadow, not fill color.

**`--button-text` / `--button-all-text`**  
Same token—description weight and size; ALL does not get a separate type treatment.

**`--button-all-fill` / `--button-all-fill-hover`**  
Always `--neu-base`. ALL differs by shadow depth only.

**`--input-focus-ring`**  
Low-alpha `--accent` outline—enough to show focus without flat Material-style rings.

**`--input-focus-shadow`**  
Inset pair plus optional accent ring—field stays recessed while focused.

**`--progress-start` / `--progress-end`**  
Legacy tokens for optional standalone `.progress-bar` tracks. Do **not** use them for download button fills (`.btn-progress`). If a separate status bar exists, prefer one solid `--button-progress-fill` tone—not a multi-hue gradient.

**`--button-progress-fill` / `--button-all-progress-fill`**  
Solid fill for in-button progress (`.btn-progress`). Same material family as the button face—only a subtle step away so width reads clearly:

- **Dark decks** (`color-scheme: dark`): slightly **brighter** than `--neu-base` — e.g. `color-mix(in srgb, var(--neu-base) 80%, white 20%)`.
- **Light decks** (`color-scheme: light`): slightly **darker** than `--neu-base` — e.g. `color-mix(in srgb, var(--neu-base) 80%, black 20%)`.

**Never** `linear-gradient`, multi-stop spectrum, or banner accent rainbows. Width communicates progress; color must not send a second message.

**`--progress-glow`**  
Usually `none` in neumorphism. The track is recessed; the bar should not bloom outside the trough.

**`--cycle-color` / `--cycle-active-color`**  
Icon tint tokens for skin-bar controls (shuffle, fav filter). Shuffle uses `--cycle-color` only—no persistent active state. Fav filter uses `--cycle-active-color` when `.active`.

**`--skin-option-active`**  
Same as base; active tile uses inset shadow + accent ring, not a different fill.

**`--result-bg` / `--error-bg`**  
Recessed panels using `--neu-base`—status blocks stay in the same material language.

**`--scrollbar-thumb`**  
Low-contrast tint of `--neu-raised-dark` for horizontal skin scroll—visible but soft.

**`color-scheme: light`**  
Set in neumorphism skins so form controls match the light deck.

**Body ambient gradients**  
Optional very soft radial washes from banner cool/warm corners at low opacity—they suggest atmosphere without breaking flat UI.

---

## Page shell

**`<html>` / document**  
Carrier for skin stylesheet and `data-skin` on `<html>` via JS—no neumorphic styling at root.

**`body`**  
Full-viewport matte field: `--neu-base` plus optional ambient gradients. Centers the app card; not extruded itself.

**`body` grid centering**  
Single centered column keeps shadow direction consistent—light always from top-left relative to the card.

**`body` padding (24px)**  
Breathing room so the raised main card shadow is visible against the page background.

**`main`**  
Extruded card: outer dual shadow, `--main-radius`, `--neu-base` fill, no border. The entire app lives on one raised slab.

**`--main-padding`**  
Inner inset for content; banner bleeds wider via negative horizontal margin.

**`--main-radius`**  
Large corner radius (≈20–24px) matching soft pill/button language.

**`--main-max-width`**  
Caps width so shadows and banner remain legible on large screens.

**`main overflow: hidden`**  
Clips banner bleed to card radius at top corners—keeps frame tidy.

**`--content-padding-x`**  
Horizontal padding for heading and copy; form may use its own inner padding in skin CSS.

---

## Scene banner

**`.scene-banner`**  
Hero viewport: displays `banner.png` via JS-set `background-image`. Never put the URL in CSS custom properties.

**`--banner-display: block`**  
Required for In Scene neumorphism skins with a banner asset.

**Banner native aspect ratio**  
`--banner-aspect-ratio: W / H` must match `banner.png` pixel dimensions (e.g. `1024 / 438`). Never `1 / 1` unless the file is square.

**`--banner-min-height`**  
Floor height so wide banners don’t collapse on narrow viewports.

**`--banner-size: cover`**  
Fills the inner content box of the frame without letterboxing.

**`--banner-position: center center`**  
Keeps the hero subject centered in the inset window.

**Banner frame padding (~14px)**  
Creates a sage `--neu-base` mat between card edge and image—this is the neumorphic border.

**Banner inset shadow**  
Dual inset shadow on `.scene-banner` makes the frame a recessed well the photo sits inside.

**`background-clip: content-box`**  
Image renders only inside padding; the pad shows `--neu-base` as physical frame material.

**Banner inner rim (`.scene-banner::after`)**  
Subtle inner highlight/lowlight lines at the image edge—glassless “lip” of the viewport.

**`--banner-saturate` / `--banner-contrast` / `--banner-brightness`**  
Light filter tuning on the photo only—keep near 100–102% so the banner stays photographic, not UI-colored.

**`--banner-blur: 0px`**  
Do not blur the hero image in neumorphism; softness belongs in the mist inside the photo, not CSS blur.

**`--banner-opacity`**  
Usually `1`; hero should read at full strength inside the frame.

**`--banner-overlay-display`**  
Keep `none` unless deliberately darkening the hero; neumorphism frame already separates banner from deck.

**Negative top margin on banner**  
Pulls hero flush to top of `main` while frame padding preserves inner mat—standard In Scene geometry.

**Gap to skin bar (`--skin-bar-margin` top)**  
Explicit top margin (≈16px) between banner frame and picker—never let the recessed bars touch.

---

## Skin bar & picker

**`.skin-bar`**  
Horizontal region below banner; no bottom border in neumorphism—separation is spatial, not ruled lines.

**`--skin-bar-margin`**  
`top right bottom left`—top gap from banner, bottom gap before title.

**`--skin-bar-padding`**  
Inner spacing for the row; keep minimal vertical pad so controls align to 68px row height.

**`.skin-bar-row`**  
Recessed tray: inset dual shadow, rounded rect—holds controls + scroll strip like a molded channel.

**`--skin-row-opacity` / `--skin-row-blur`**  
Opacity `1`, blur `0px`—the row is solid matte, not glass.

**`.skin-controls`**  
Vertical stack of shuffle + fav-filter icons; fixed min-width column on the left.

**`#skin-shuffle` (shuffle icon)**  
Borderless control; one click applies a random skin from the current picker pool (all skins, or favorites when filter is on). Neumorphic skins tint icon only—no raised button box, no toggle/active state.

**Shuffle button disabled state**  
Reduced opacity when fewer than two skins in pool—prevents useless interaction without adding new chrome.

**Shuffle tooltips**  
Full-sentence `title` / `aria-label` from JS—never abbreviated in neumorphism skins.

**`#skin-fav-filter` (♥ filter)**  
Shows only favorited skins when active; accent color when `.active`, muted when idle.

**Fav filter disabled**  
When no favorites exist—icon stays muted until user favorites a skin.

**`.skin-scroll`**  
Horizontal flex strip for skin tiles; thin scrollbar using `--scrollbar-thumb`.

**`.skin-scroll-empty`**  
Muted message when fav filter is on but empty—same `--muted` as description.

**Skin scroll min-height (68px)**  
Matches tile height so row doesn’t jump when tiles load.

**`.skin-option`**  
Each skin tile wrapper: extruded small shadow on `--neu-base`; padding around thumb.

**`.skin-option.active`**  
Inset shadow + thin accent ring—selected tile appears pressed into the tray, not lit with flat color.

**`.skin-option-select`**  
Click target for applying skin; transparent background; thumb centered in grid.

**`.skin-option-holding`**  
Long-press feedback: accent outline + slight scale-down before delete confirm—only chrome that may use accent outline.

**`.skin-option-thumb` (52×52px)**  
Fixed square size for all picker icons—always square regardless of banner aspect.

**`.skin-option-banner`**  
Center-crop of `banner.png` via `background-size: cover`—do not export a separate square asset.

**`.skin-option-emoji`**  
Fallback when no banner—same 52×52 cell, emoji centered.

**`.skin-option-thumb` (iconImage)**  
Square image fallback when no banner file—`object-fit: cover`.

**`.skin-fav-toggle` (♡ / ♥)**  
Hidden until hover or favorited; **heart glyph only** in the tile’s top-right corner. No background pill, no border-radius box, no shadow, no extrusion—the heart sits directly on the thumbnail. Styling lives in [`public/index.html`](../public/index.html); **skins must not** add `background`, `box-shadow`, or `border` on `.skin-fav-toggle`. Hover/favorited: accent color on the heart only.

**Favorited tile (`.is-favorite`)**  
Heart stays visible—state without changing tile shadow language.

**Skin tile tooltip**  
`title` = skin name + “Hold to delete”—no text label under icon.

**Long-press delete (~550ms)**  
Hold tile to delete skin folder; confirm dialog; suppresses accidental tap apply.

**Long-press move threshold (20px)**  
Cancels delete if finger drifts—allows horizontal scroll without triggering delete.

**Pointer capture on long-press**  
Reliable hold tracking across minor movement until release or cancel.

**Context menu prevention on tiles**  
Avoids native menu conflicting with long-press on touch devices.

**Skin catalog API (`GET /api/skins`)**  
Auto-discovery of folders; neumorphism skin appears when `skin.json` + `skin.css` exist.

**Skin delete API (`DELETE /api/skins/:id`)**  
Removes folder from disk; protected `_`-prefixed folders and last skin blocked.

**localStorage: active skin**  
Persists selection across refresh—neumorphism deck reloads with same skin.

**localStorage: favorites**  
Set of skin ids for ♥ filter and shuffle pool.

**localStorage: fav filter flag**  
Whether picker shows all skins or favorites only.

**Picker order on launch**  
`skins.js` shuffles the catalog once per page load—tile order is random each refresh; saved active skin is unchanged.

**Shuffle (one click)**  
Applies one random skin from the pool; respects fav filter when enabled. Never auto-advances on a timer.

**`document.documentElement.dataset.skin`**  
Active skin id for debugging and CSS hooks—set on apply.

**`#skin-stylesheet` link**  
Dynamically loaded `skin.css`—neumorphism rules override base `index.html` defaults.

**`applyBanner()` in JS**  
Sets inline `background-image` on `.scene-banner`—path `/skins/{id}/banner.png`.

---

## Typography

**`--font-family`**  
One family for entire card (e.g. Avenir Next, Segoe UI)—no secondary button face.

**`h1` / `--heading-size`**  
App title: uppercase, tracked, heavier weight than body—defines hierarchy without a second typeface.

**`--heading-weight` / `--heading-spacing` / `--heading-transform`**  
Uppercase + letter-spacing for title; `--heading-shadow: none` in neumorphism—no glow on type.

**`--heading-align: center`**  
Centered title matches centered banner and deck—calm symmetry.

**Description `p`**  
`--muted` color; `--subtitle-size`, `--subtitle-weight`, `--subtitle-line-height`—canonical body voice.

**`--subtitle-align: center`**  
Instruction copy centered under title.

**Description line break (`<br />`)**  
Second line lists formats—keep both lines same style token.

**`p::after` separator**  
Recessed pill-shaped rule—not a flat gradient line. Six-pixel tall inset trough between copy and form.

**Form `label`**  
Small caps via `--label-transform: uppercase`; smaller `--label-size`—legend above URL trough.

**`--label-weight` / `--label-spacing`**  
Uppercase field label sits above recessed input; don’t match heading weight.

**URL input typed text**  
`--text` at subtitle size/weight—readable contrast once user types.

**URL placeholder**  
`--placeholder` lighter than `--muted`; same metrics as subtitle—prefill whispers, copy speaks.

**Download button labels**  
Identical to subtitle tokens: `--button-font-size`, `--button-font-weight`, `--button-line-height`, `--button-letter-spacing: normal`.

**Download ALL label**  
Same type as trio—distinction is shadow depth only, not bold or alternate color.

**Status text (`.status-text`)**  
Muted, slightly smaller—progress messages stay secondary to controls.

**Result / error text**  
Inherit deck typography; strong title line in result for video name.

---

## Form deck

**`form`**  
Recessed container: inset shadow, `--radius-form`, inner padding—control panel carved into the card.

**`form` grid gap**  
Vertical stack of label, field, four buttons—12px gap from base CSS; don’t tighten in neumorphism.

**`--form-opacity: 1`**  
Solid deck—no translucency in soft UI.

**`--form-blur: 0px`**  
No frosted glass on form—depth is inset shadow only.

**`--radius-form`**  
Large radius matching main card and buttons—family of rounded molds.

**Form background**  
Always `--neu-base`—same as buttons so extruded buttons read as raised from form floor.

**Form border**  
None in neumorphism—the trough edge is shadow-defined.

---

## URL field

**`.url-field`**  
Relative wrapper for input + clear control.

**URL input (recessed)**  
Inset dual shadow; `--neu-base` fill; no visible border—looks like a carved channel.

**`--radius-input`**  
Rounded ends of trough—typically 14–16px.

**Input padding (14px vertical, 16px left, 44px right)**  
Room for clear button on the right—preserve from base layout.

**`.url-clear` (× button)**  
Hidden until input has value; minimal circular hit target—keep transparent or lightly recessed on hover, not extruded.

**`.url-clear.visible`**  
Shows when text present—does not shift layout.

**URL focus state**  
Inset shadow retained + `--input-focus-ring` accent—field stays recessed while focused.

**`autocomplete="off"`**  
Avoids browser styling fighting neumorphic trough.

**URL normalization (JS)**  
Accepts full URLs, IDs, youtu.be—behavior unchanged by skin; error copy uses `.error` recess.

---

## Download buttons

**Shared trio (MP3, MP4, Thumb)**  
Identical extruded pills from `--neu-base`; same shadow, type, and pressed behavior.

**`#mp3-btn` (submit)**  
Form submit for MP3—must not have per-id CSS overrides in any skin.

**`#video-btn` / `#thumb-btn`**  
Click handlers for other kinds—same visual as MP3.

**`#all-btn.all`**  
Deeper extrusion (`9px` shadow stack)—same fill and font as trio.

**`--button-shadow`**  
Standard extrude pair for trio—mapped in `@skin-analysis` as `mapped-button-shadow`.

**`--button-all-shadow`**  
Deeper extrude pair—no colored rings, no `::before` glow, no gradient streaks.

**Button hover (trio + ALL)**  
Tighten shadow offset slightly—simulate finger approaching surface; do not change fill hue.

**Button active / pressed**  
Inset shadow pair + optional `scale(0.985)`—control appears pushed into deck.

**Button disabled (download in progress)**  
Reduced opacity from base `--button-opacity`—keep inset/extrude logic, lower presence.

**No per-button accent colors**  
Violates philosophy—banner colors live in accent rings and the banner frame only, not in progress fill.

**No gradient fills on buttons or progress**  
Neumorphism buttons and `.btn-progress` bars are monochromatic with the deck. Gradients on progress imply multiple simultaneous meanings (spectrum, temperature, channel mix) and fight the single job of “how much is done.” Use one solid `--button-progress-fill`; let **width** carry progress.

**No `::before` / `::after` on ALL**  
Removed artifact streaks—ALL is clean extrusion only.

**`--button-opacity: 1`**  
Fully opaque matte pills—translucent buttons break soft UI.

**`--radius-button`**  
Generous rounding (≈16px)—matches input and form corners.

**Transition on shadow/transform**  
Short ease on press/hover—avoid animating background color (fill never changes).

**`.btn-progress` (in-button progress fill)**  
Absolute layer behind `.btn-label`; grows by `width` from SSE/`progress-engine.js`. Background: `var(--button-progress-fill)` only—solid, no gradient. Optional subtle inset highlight (`inset 0 1px 0 rgba(255,255,255,0.12)`) for depth. Trio and ALL may share the same fill token; ALL must not get a spectrum or second gradient story.

**`form button.all .btn-progress`**  
May use `--button-all-progress-fill` but it must remain a **solid** sibling of `--button-progress-fill`—deeper extrusion on ALL is shadow-only, not a different progress palette.

---

## Status, progress, result, error

**`.status` section**  
Hidden until download starts—appears below form with top margin.

**`aria-live="polite"` on status**  
Screen readers announce progress without neumorphic visual changes.

**`.progress-wrap`**  
Recessed track—inset shadow on `--neu-base`; height ~12px, pill radius.

**`--progress-track-opacity`**  
Solid track in neumorphism—recess reads clearly.

**`.progress-bar`**  
Optional legacy status track fill. If used: **one solid color** from `--button-progress-fill`—not a banner gradient. Width grows with SSE progress.

**`--progress-glow: none`**  
Bar stays inside trough—no outer bloom.

**`.status-text`**  
Human-readable phase labels from JS—muted, below bar.

**`.result` panel**  
Hidden until success; recessed or flat-on-deck using `--result-bg`; shows title + filenames.

**`.result.visible`**  
Block display—no animation required in neumorphism.

**`.error` panel**  
Same material as result; `--error` text color for message—recessed, not red flat banner.

**Download SSE (`EventSource`)**  
Behavior independent of skin—neumorphism styles outcome panels only.

**Button disable during download**  
All four buttons disabled while job runs—prevents double submit; styled via opacity.

---

## `@skin-analysis` comment block

**Block purpose**  
Human-readable record of banner analysis—not parsed by runtime. Fill once when creating skin.

**`source-image`**  
Filename + pixel dimensions + one-line subject description.

**`ui-treatment`**  
States neumorphism soft UI explicitly—shadow-only depth, banner-driven color.

**`analyzed-date`**  
ISO date of analysis for future editors.

**`opacity-hero`**  
Solid vs translucent regions in banner subject— informs whether UI is opaque matte.

**`opacity-midground`**  
Mist/reflection bands—usually not copied as UI transparency in neumorphism.

**`opacity-background`**  
Sky/floor void—may inform `--neu-raised-dark` darkness.

**`opacity-ui-deck`**  
Always ~100% for soft UI—deck is solid.

**`opacity-buttons`**  
Trio and ALL fully opaque; ALL differs by shadow not alpha.

**`blur-hero-edges`**  
Banner subject edge character—UI buttons stay sharp silhouettes.

**`blur-hero-glow`**  
Bloom in photo only—do not map to button `box-shadow` glow on ALL.

**`blur-atmosphere`**  
Environmental softness in banner—not `--form-blur`.

**`blur-ui-surface`**  
Always `0px` for neumorphism skins.

**`blur-button-edges`**  
Softness via shadow spread only—no `filter: blur()` on buttons.

**`blur-banner-frame`**  
Documents inset pad and rim on `.scene-banner`.

**`color-base` through `color-text`**  
Hex notes from banner before mapping to `--neu-*` and text tokens.

**`mapped-form-opacity` → `--form-opacity`**  
Bridge from analysis to CSS—should be `1` for neumorphism.

**`mapped-form-blur` → `--form-blur`**  
Bridge—should be `0px`.

**`mapped-panel-blur` / `mapped-skin-row-blur`**  
Bridge—`0px` for matte UI.

**`mapped-banner-aspect` → `--banner-aspect-ratio`**  
Must match file dimensions.

**`mapped-button-opacity` → `--button-opacity`**  
Bridge—typically `1`.

**`mapped-button-shadow`**  
Words describing extrude/inset character—not necessarily literal px in comment.

**`mapped-accent`**  
Which banner hue becomes `--accent`—use sparingly on chrome.

**`--skin-analysis-summary`**  
One-line grep aid in `:root`—optional quick scan of skin intent.

---

## Interaction & motion

**`--transition-speed`**  
Base 0.15s for color/icon transforms; buttons may use ~0.2s on shadow.

**Skin control icon hover scale (1.08)**  
Subtle grow on shuffle/heart—no background pill.

**Skin shuffle hover**  
Icon full opacity on hover—no extruded “on” button, no timer state.

**Long-press haptic (`navigator.vibrate`)**  
Optional 50ms pulse on delete trigger—mobile feedback only.

**Form submit (Enter in URL)**  
Triggers MP3 download—same as MP3 button; skin agnostic.

**Empty URL on MP4/Thumb/ALL**  
Focuses field—no error recess until invalid submit.

**Invalid URL error**  
Shows `.error` recess with message—does not change deck shadows.

**Clear URL button**  
Resets field and focus—returns to placeholder styling.

---

## Accessibility

**`aria-pressed` on skin tiles**  
Reflects active skin for assistive tech.

**`aria-label` on icon-only controls**  
Shuffle, fav filter, clear, fav toggle—full sentences from JS or HTML.

**`aria-hidden` on decorative banner**  
Hero is mood, not informational content.

**Focus visible on URL field**  
Accent ring + inset trough—must remain visible on neumorphic decks.

**Disabled control opacity**  
Shuffle/fav filter at 0.35 when unavailable—still recognizable.

**Status live region**  
Progress updates announced without moving focus.

---

## Responsive (`max-width: 520px`)

**Reduced `--banner-min-height`**  
Keeps hero readable on narrow phones without dominating viewport.

**Slightly smaller `--radius-button`**  
Proportional rounding on small screens—shadow offsets may stay same.

**Horizontal scroll on skin row**  
Tiles don’t shrink below 52px—scroll remains neumorphic trough.

**Main padding**  
Inherited from `--main-padding`—banner negative margin scales with pad.

---

## Anti-patterns

**Glass / frosted UI on deck**  
`backdrop-filter` on form or skin row breaks single-surface rule.

**Colored glow on Download ALL**  
Rainbow streaks, gradient `::before`, or gold/pink outer shadows on ALL—artifacts, not neumorphism.

**Different fills per MP3/MP4/Thumb**  
One extrusion family only.

**Square `--banner-aspect-ratio` on wide PNG**  
Distorts hero; square is picker-only via app crop.

**Separate square banner export for picker**  
Unnecessary—app center-crops wide `banner.png`.

**Pure gray `#e4e9f0` without banner sampling**  
Default soft-UI gray ignores image; always derive `--neu-base` from banner neutrals.

**Neon flat button fills**  
Filled accent buttons look like default web UI, not molded deck.

**Gradient progress bars (`.btn-progress`, `.progress-bar`)**  
Multi-hue `linear-gradient` fills on download progress—width already shows completion; gradients add confusing secondary meaning. Use solid `--button-progress-fill` only.

**Hard 1px borders everywhere**  
Use shadow pairs instead.

**Re-analyzing PNG on every tweak**  
Trust `@skin-analysis`; adjust `--neu-*` in steps.

**Styling `#mp3-btn` / `#video-btn` / `#thumb-btn` separately**  
Forbidden—use shared `form button` rules.

**Text labels under skin picker tiles**  
Icons only; name in tooltip.

**Banner URL in CSS**  
Path set by JS only—`url()` in CSS vars resolves against page URL.

**Background box behind ♡ / ♥ on picker tiles**  
Semi-transparent rounded squares behind the favorite heart—breaks the clean overlay. Heart only; transparent hit target is fine.

---

## Workflow: new neumorphism skin

1. Copy [`skins/neumorphism/`](../skins/neumorphism/) or [`skins/_template/`](../skins/_template/) into a new folder (name = skin id).
2. Replace `banner.png`; measure width × height (`sips -g pixelWidth -g pixelHeight`).
3. Fill `@skin-analysis` from the banner: colors, opacity notes, `mapped-*` bridges.
4. Set `--neu-base`, `--neu-raised-light`, `--neu-raised-dark`, inset pair from sampled hex values—darken base slightly if shadows wash out.
5. Set `--banner-aspect-ratio: W / H`; `--skin-bar-margin` top gap ≥ 16px.
6. Map `--accent` from hero secondaries—sparingly on chrome (focus rings, active picker). Set `--button-progress-fill` to one solid deck tone—not a gradient (brighter mix on dark decks, darker mix on light decks).
7. Align `--subtitle-*` and `--button-*` type tokens; set `--placeholder` lighter than `--muted`.
8. Verify trio buttons match; ALL uses deeper shadow only—no colored artifacts.
9. Recess banner, skin row, form, input, progress track; extrude main, tiles, trio, ALL.
10. Refresh app; test picker, long-press delete, download flow, mobile width.

---

## Checklist before shipping

- [ ] `@skin-analysis` complete with `color-*` and `mapped-*` lines
- [ ] `--neu-base` sampled from banner; darker enough for shadow contrast
- [ ] `--banner-aspect-ratio` matches `banner.png` pixels
- [ ] Banner in inset frame with padding + inner rim
- [ ] Margin between banner frame and skin bar
- [ ] Picker tiles square (app crop)—no separate square asset
- [ ] Description, buttons, placeholder share type scale; placeholder lighter
- [ ] MP3 / MP4 / Thumb identical; ALL deeper extrusion only
- [ ] `.btn-progress` uses solid `--button-progress-fill`—no gradients
- [ ] No gradient/glow artifacts on ALL
- [ ] `--form-blur` and `--skin-row-blur` are `0px`
- [ ] No per-button ID overrides
- [ ] `.skin-fav-toggle` unchanged in skin CSS—heart only, no background box
- [ ] Refresh at desktop and ~520px width

---

## Quick reference for skin authors (and agents)

Use this section to avoid re-discovering rules spread through the doc.

### What lives where

| Concern | Owner | Do not duplicate in `skin.css` |
|--------|--------|--------------------------------|
| DOM structure, picker layout, fav heart behavior | [`public/index.html`](../public/index.html) | `.skin-fav-toggle` background/border |
| Catalog, shuffle, favorites, apply skin | [`public/skins.js`](../public/skins.js) | — |
| Look: colors, shadows, banner frame, buttons | `skins/<id>/skin.css` | Progress gradients, per-button IDs |
| Hero image | `skins/<id>/banner.png` | Banner path in CSS |
| Display name | `skins/<id>/skin.json` | — |

### Start from a reference skin

Copy [`skins/freequency-mist/`](../skins/freequency-mist/) (light pastel) or [`skins/freequency/`](../skins/freequency/) (dark) or [`skins/neumorphism/`](../skins/neumorphism/). Replace `banner.png`, rewrite `@skin-analysis`, retune `--neu-*` and accents.

### Non-negotiables (common regressions)

1. **`--banner-aspect-ratio`** = pixel width / height of `banner.png` (e.g. `1024 / 438`).
2. **Progress fill** = solid `--button-progress-fill` only—width shows progress, not color ramps.
3. **MP3 / MP4 / Thumb** = identical button chrome; **ALL** = deeper shadow only.
4. **♡ / ♥** = transparent overlay, accent color when favorited—**never** a visible box behind the heart.
5. **No `--print` on yt-dlp** (downloader concern)—skins unrelated but listed for monorepo context.
6. **`--form-blur` / `--skin-row-blur`** = `0px` for true neumorphism (no glass on deck).
7. **Do not style `#mp3-btn`, `#video-btn`, `#thumb-btn`** separately.

### `@skin-analysis` minimum

Include: `source-image` dimensions, dominant hex picks (`color-base`, raised/inset pair, 2–3 accents), `mapped-banner-aspect`, and one line on button/progress treatment. Future edits tune CSS against this block—not the PNG every time.

### Verify before shipping

Refresh app → picker tile hover (heart, no box) → shuffle → favorite + filter → apply skin → download once → mobile ~520px width.

---

## Related

- [`skins/README.md`](../skins/README.md) — folder layout, `skin.json`, skin bar behavior
- [`skins/neumorphism/`](../skins/neumorphism/) — reference `skin.css`
- [`public/index.html`](../public/index.html) — base DOM and default variables
- [`public/skins.js`](../public/skins.js) — picker, favorites, shuffle, delete
