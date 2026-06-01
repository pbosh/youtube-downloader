#!/usr/bin/env python3
"""
Scaffold neumorphism skins from banner images.

Reads PNG/JPEG/WebP from assets/skin-incoming/, writes skins/<id>/ with banner.jpg,
skin.json, and a color-mapped skin.css copied from a reference template.

See docs/batch-skins.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import shutil
import sys
from collections import Counter
from datetime import date
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print(
        "Missing dependency: Pillow\n"
        "Install with: pip install -r scripts/requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

from skin_image import BANNER_FILENAME, JPEG_QUALITY_DEFAULT, save_banner_jpeg

REPO_ROOT = Path(__file__).resolve().parents[1]
INCOMING_DIR = REPO_ROOT / "assets" / "skin-incoming"
DONE_DIR = INCOMING_DIR / "_DONE"
MANIFEST_PATH = REPO_ROOT / "scripts" / "skin-manifest.json"
NAME_WORDS_PATH = REPO_ROOT / "scripts" / "skin-name-words.txt"
SKINS_DIR = REPO_ROOT / "skins"

DARK_TEMPLATE = SKINS_DIR / "freequency-sharing" / "skin.css"
LIGHT_TEMPLATE = SKINS_DIR / "freequency-mist" / "skin.css"

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}

DARK_VAR_ORDER = [
    "neu-base",
    "neu-raised-light",
    "neu-raised-dark",
    "neu-inset-light",
    "neu-inset-dark",
    "accent-cyan",
    "accent-magenta",
    "accent-gold",
    "accent-orange",
    "text",
    "muted",
    "placeholder",
    "cycle-color",
]

LIGHT_VAR_ORDER = [
    "neu-base",
    "neu-raised-light",
    "neu-raised-dark",
    "neu-inset-light",
    "neu-inset-dark",
    "accent-teal",
    "accent-peach",
    "accent-rose",
    "text",
    "muted",
    "placeholder",
    "cycle-color",
]

DARK_PALETTE_KEYS = [
    "neu-base",
    "neu-raised-light",
    "neu-raised-dark",
    "neu-inset-light",
    "neu-inset-dark",
    "accent-cyan",
    "accent-magenta",
    "accent-gold",
    "accent-orange",
    "text",
    "muted",
    "placeholder",
    "cycle-color",
]

LIGHT_PALETTE_KEYS = [
    "neu-base",
    "neu-raised-light",
    "neu-raised-dark",
    "neu-inset-light",
    "neu-inset-dark",
    "accent-teal",
    "accent-peach",
    "accent-rose",
    "text",
    "muted",
    "placeholder",
    "cycle-color",
]


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_done_dir() -> Path:
    DONE_DIR.mkdir(parents=True, exist_ok=True)
    gitkeep = DONE_DIR / ".gitkeep"
    if not gitkeep.exists():
        gitkeep.touch()
    return DONE_DIR


def unique_done_path(filename: str, suffix: str = "") -> Path:
    base = Path(filename)
    dest = DONE_DIR / (f"{base.stem}{suffix}{base.suffix}" if suffix else filename)
    counter = 1
    while dest.exists():
        dest = DONE_DIR / f"{base.stem}{suffix}-{counter}{base.suffix}"
        counter += 1
    return dest


def archive_to_done(
    image_path: Path,
    *,
    dry_run: bool,
    reason: str,
    suffix: str = "",
) -> Path | None:
    """Copy a finished source image into _DONE/ and remove it from the queue."""
    dest = unique_done_path(image_path.name, suffix=suffix)
    if dry_run:
        print(f"  would copy to _DONE: {image_path.name} ({reason})")
        return dest

    ensure_done_dir()
    shutil.copy2(image_path, dest)
    image_path.unlink()
    print(f"  done → _DONE: {dest.name} ({reason})")
    return dest


def slugify(stem: str, *, max_len: int = 56) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", stem.lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    if not slug:
        return "skin"
    if len(slug) <= max_len:
        return slug
    # Keep filename tail (uuid / variant suffix) so batch art stays unique.
    tail = slug[-24:]
    head_budget = max_len - 1 - len(tail)
    if head_budget < 10:
        return hashlib.sha256(stem.encode()).hexdigest()[:max_len]
    return f"{slug[:head_budget]}-{tail}".strip("-")


def title_from_slug(slug: str) -> str:
    return slug.replace("-", " ").strip().title() or "Skin"


def load_name_words(path: Path = NAME_WORDS_PATH) -> list[str]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing name word list: {path}")
    words: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        word = line.split("#", 1)[0].strip()
        if word:
            words.append(word)
    if len(words) < 2:
        raise ValueError(f"Need at least 2 name words in {path}")
    return words


def load_existing_titles() -> set[str]:
    titles: set[str] = set()
    for json_path in SKINS_DIR.glob("*/skin.json"):
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        title = data.get("title")
        if isinstance(title, str) and title.strip():
            titles.add(title.strip())
    return titles


def random_two_word_title(words: list[str], used: set[str]) -> str:
    for _ in range(2000):
        first, second = random.sample(words, 2)
        title = f"{first} {second}"
        if title not in used:
            return title
    first, second = random.sample(words, 2)
    suffix = 2
    while True:
        title = f"{first} {second} {suffix}"
        if title not in used:
            return title
        suffix += 1


def rgb_hex(rgb: tuple[int, int, int]) -> str:
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def clamp(value: float, lo: int = 0, hi: int = 255) -> int:
    return max(lo, min(hi, int(round(value))))


def mix(
    a: tuple[int, int, int], b: tuple[int, int, int], t: float
) -> tuple[int, int, int]:
    return (
        clamp(a[0] + (b[0] - a[0]) * t),
        clamp(a[1] + (b[1] - a[1]) * t),
        clamp(a[2] + (b[2] - a[2]) * t),
    )


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = (channel / 255 for channel in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def saturation(rgb: tuple[int, int, int]) -> float:
    r, g, b = (channel / 255 for channel in rgb)
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx <= 0:
        return 0.0
    return (mx - mn) / mx


def parse_css_hex_vars(css: str, var_names: list[str]) -> dict[str, str]:
    found: dict[str, str] = {}
    for name in var_names:
        match = re.search(
            rf"--{re.escape(name)}:\s*(#[0-9a-fA-F]{{3,8}})\s*;",
            css,
        )
        if match:
            found[name] = match.group(1).lower()
    return found


def replace_color_everywhere(css: str, old_hex: str, new_hex: str) -> str:
    old_hex = old_hex.lower()
    new_hex = new_hex.lower()
    css = re.sub(re.escape(old_hex), new_hex, css, flags=re.IGNORECASE)

    old_rgb = hex_to_rgb(old_hex)
    new_rgb = hex_to_rgb(new_hex)
    or_, og, ob = old_rgb
    nr, ng, nb = new_rgb

    css = re.sub(
        rf"rgba\(\s*{or_}\s*,\s*{og}\s*,\s*{ob}\s*,",
        f"rgba({nr}, {ng}, {nb},",
        css,
    )
    css = re.sub(
        rf"rgb\(\s*{or_}\s*,\s*{og}\s*,\s*{ob}\s*\)",
        f"rgb({nr}, {ng}, {nb})",
        css,
    )
    return css


def apply_palette_to_css(
    css: str, reference_vars: dict[str, str], new_palette: dict[str, tuple[int, int, int]]
) -> str:
    for name, old_hex in reference_vars.items():
        if name not in new_palette:
            continue
        new_hex = rgb_hex(new_palette[name])
        if old_hex.lower() != new_hex.lower():
            css = replace_color_everywhere(css, old_hex, new_hex)
    return css


def sample_image_colors(img: Image.Image) -> tuple[float, list[tuple[int, int, int]], list[tuple[int, int, int]]]:
    rgb = img.convert("RGB")
    thumb = rgb.copy()
    thumb.thumbnail((160, 160), Image.Resampling.LANCZOS)
    pixels = thumb.convert("RGB")
    if hasattr(pixels, "get_flattened_data"):
        data = pixels.get_flattened_data()
    else:
        data = pixels.getdata()
    counter = Counter(data)
    weighted: list[tuple[int, tuple[int, int, int]]] = []
    for color, count in counter.items():
        weighted.append((count, color))
    weighted.sort(reverse=True)

    pixels = [color for _, color in weighted]
    avg_lum = sum(luminance(color) for color in pixels) / max(len(pixels), 1)

    neutrals = [color for color in pixels if saturation(color) < 0.14]
    accents = [color for color in pixels if saturation(color) >= 0.14]
    accents.sort(key=saturation, reverse=True)

    if not neutrals:
        neutrals = sorted(pixels, key=luminance)[: max(3, len(pixels) // 4)]
    if len(accents) < 4:
        extras = sorted(set(pixels), key=saturation, reverse=True)
        for color in extras:
            if color not in accents:
                accents.append(color)
            if len(accents) >= 4:
                break

    return avg_lum, neutrals, accents[:6]


def build_dark_palette(
    neutrals: list[tuple[int, int, int]], accents: list[tuple[int, int, int]]
) -> dict[str, tuple[int, int, int]]:
    darkest = min(neutrals, key=luminance)
    lightest = max(neutrals, key=luminance)
    base = mix(darkest, (0, 0, 0), 0.18)
    raised_light = mix(base, lightest, 0.42)
    raised_dark = mix(base, (0, 0, 0), 0.55)
    inset_light = mix(base, raised_light, 0.38)
    inset_dark = mix(base, (0, 0, 0), 0.72)

    while len(accents) < 4:
        accents.append(accents[-1] if accents else (34, 211, 238))

    text = mix(lightest, (255, 255, 255), 0.82)
    muted = mix(text, base, 0.48)
    placeholder = mix(text, base, 0.68)
    cycle = mix(text, base, 0.58)

    return {
        "neu-base": base,
        "neu-raised-light": raised_light,
        "neu-raised-dark": raised_dark,
        "neu-inset-light": inset_light,
        "neu-inset-dark": inset_dark,
        "accent-cyan": accents[0],
        "accent-magenta": accents[1],
        "accent-gold": accents[2],
        "accent-orange": accents[3],
        "text": text,
        "muted": muted,
        "placeholder": placeholder,
        "cycle-color": cycle,
    }


def build_light_palette(
    neutrals: list[tuple[int, int, int]], accents: list[tuple[int, int, int]]
) -> dict[str, tuple[int, int, int]]:
    mid = sorted(neutrals, key=luminance)[len(neutrals) // 2]
    lightest = max(neutrals, key=luminance)
    darkest = min(neutrals, key=luminance)
    base = mix(mid, lightest, 0.35)
    raised_light = mix(base, (255, 255, 255), 0.55)
    raised_dark = mix(base, darkest, 0.35)
    inset_light = mix(base, raised_light, 0.45)
    inset_dark = mix(base, darkest, 0.42)

    while len(accents) < 3:
        accents.append(accents[-1] if accents else (126, 184, 176))

    text = mix(darkest, (0, 0, 0), 0.25)
    muted = mix(text, base, 0.42)
    placeholder = mix(text, base, 0.62)
    cycle = mix(text, base, 0.52)

    return {
        "neu-base": base,
        "neu-raised-light": raised_light,
        "neu-raised-dark": raised_dark,
        "neu-inset-light": inset_light,
        "neu-inset-dark": inset_dark,
        "accent-teal": accents[0],
        "accent-peach": accents[1],
        "accent-rose": accents[2],
        "text": text,
        "muted": muted,
        "placeholder": placeholder,
        "cycle-color": cycle,
    }


def scaffold_analysis_block(
    *,
    width: int,
    height: int,
    title: str,
    mode: str,
    palette: dict[str, tuple[int, int, int]],
    palette_keys: list[str],
    banner_name: str = BANNER_FILENAME,
) -> str:
    today = date.today().isoformat()
    mode_label = "Dark" if mode == "dark" else "Light"
    color_lines = []
    for key in palette_keys:
        if key.startswith("accent-"):
            label = key.replace("accent-", "accent ")
            color_lines.append(f"  color-{label}:       {rgb_hex(palette[key])}")
        elif key == "neu-base":
            color_lines.append(f"  color-base:            deck {rgb_hex(palette[key])}")
        elif key == "neu-raised-light":
            color_lines.append(
                f"  color-raised-light:      lift {rgb_hex(palette[key])}"
            )
        elif key == "neu-raised-dark":
            color_lines.append(
                f"  color-raised-dark:       depth {rgb_hex(palette[key])}"
            )
        elif key == "text":
            color_lines.append(f"  color-text:              {rgb_hex(palette[key])}")

    color_section = "\n".join(color_lines)

    return f"""/*
  @skin-analysis — do not remove; not used by runtime, stored for humans + future edits

  scaffold-source:     scripts/scaffold_skins.py

  source-image:        {banner_name} ({width}×{height}) — {title}

  ui-treatment:        {mode_label} neumorphism soft UI — see docs/neumorphism-design-philosophy.md
  motion-treatment:    reference template (dark/light from image luminance)

  analyzed-date:       {today}

  ── Opacity ──
  opacity-ui-deck:     matte deck ~100%
  opacity-buttons:     opaque raised pills; ALL deeper extrusion only

  ── Blur / softness ──
  blur-ui-surface:     0px — no backdrop-filter on deck (neumorphism rule)

  ── Color pick (auto-scaffold → neu palette) ──
{color_section}
  mapped-banner-aspect:    {width} / {height}
  mapped-button-shadow:    reference template dual extrude
*/"""


def replace_analysis_block(css: str, new_block: str) -> str:
    match = re.search(r"/\*[\s\S]*?@skin-analysis[\s\S]*?\*/", css)
    if not match:
        raise ValueError("Template CSS is missing @skin-analysis block")
    return css[: match.start()] + new_block + css[match.end() :]


def update_banner_aspect(css: str, width: int, height: int) -> str:
    css = re.sub(
        r"--banner-aspect-ratio:\s*[\d.]+\s*/\s*[\d.]+\s*;",
        f"--banner-aspect-ratio: {width} / {height};",
        css,
        count=1,
    )
    css = re.sub(
        r"mapped-banner-aspect:\s*[\d.]+\s*/\s*[\d.]+",
        f"mapped-banner-aspect:    {width} / {height}",
        css,
        count=1,
    )
    return css


def update_summary(css: str, title: str, mode: str) -> str:
    label = "Dark" if mode == "dark" else "Light"
    summary = f"{label} neumorphism: {title}"
    return re.sub(
        r'(--skin-analysis-summary:\s*")([^"]*)(";\s*)',
        rf'\1{summary}\3',
        css,
        count=1,
    )


PROGRESS_FILL_DARK = "color-mix(in srgb, var(--neu-base) 80%, white 20%)"
PROGRESS_FILL_LIGHT = "color-mix(in srgb, var(--neu-base) 80%, black 20%)"


def update_progress_fill(css: str, mode: str) -> str:
    fill = PROGRESS_FILL_LIGHT if mode == "light" else PROGRESS_FILL_DARK
    css = re.sub(
        r"--button-progress-fill:\s*[^;]+;",
        f"--button-progress-fill: {fill};",
        css,
        count=1,
    )
    return re.sub(
        r"--button-all-progress-fill:\s*[^;]+;",
        f"--button-all-progress-fill: {fill};",
        css,
        count=1,
    )


def load_manifest(path: Path) -> dict:
    if not path.is_file():
        return {
            "defaults": {"prefix": "freequency", "template": "auto", "icon": "✦"},
            "skins": {},
            "done": [],
        }
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    data.setdefault("defaults", {"prefix": "freequency", "template": "auto", "icon": "✦"})
    data.setdefault("skins", {})
    data.setdefault("done", [])
    return data


def resolve_entry(
    filename: str,
    manifest: dict,
    stem: str,
    *,
    name_words: list[str],
    used_titles: set[str],
) -> dict:
    defaults = manifest.get("defaults", {})
    overrides = manifest.get("skins", {}).get(filename, {})
    prefix = overrides.get("prefix", defaults.get("prefix", "freequency"))
    slug = slugify(overrides.get("slug", stem))
    skin_id = overrides.get("id") or f"{prefix}-{slug}"
    if overrides.get("title"):
        title = overrides["title"]
    else:
        title = random_two_word_title(name_words, used_titles)
    used_titles.add(title)
    icon = overrides.get("icon", defaults.get("icon", "✦"))
    template = overrides.get("template", defaults.get("template", "auto"))
    return {
        "id": skin_id,
        "title": title,
        "icon": icon,
        "template": template,
    }


def scaffold_one(
    image_path: Path,
    entry: dict,
    *,
    force: bool,
    dry_run: bool,
    jpeg_quality: int = JPEG_QUALITY_DEFAULT,
) -> Path | None:
    skin_dir = SKINS_DIR / entry["id"]
    if skin_dir.exists() and not force:
        print(f"  skip (exists): {entry['id']} — use --force to overwrite")
        return None

    with Image.open(image_path) as img:
        img.load()
        width, height = img.size
        avg_lum, neutrals, accents = sample_image_colors(img)

        mode = entry["template"]
        if mode == "auto":
            mode = "light" if avg_lum > 0.45 else "dark"

        template_path = LIGHT_TEMPLATE if mode == "light" else DARK_TEMPLATE
        if not template_path.is_file():
            raise FileNotFoundError(f"Missing template CSS: {template_path}")

        css = template_path.read_text(encoding="utf-8")
        var_order = LIGHT_VAR_ORDER if mode == "light" else DARK_VAR_ORDER
        palette_keys = LIGHT_PALETTE_KEYS if mode == "light" else DARK_PALETTE_KEYS
        reference_vars = parse_css_hex_vars(css, var_order)

        palette = (
            build_light_palette(neutrals, accents)
            if mode == "light"
            else build_dark_palette(neutrals, accents)
        )

        css = apply_palette_to_css(css, reference_vars, palette)
        css = update_progress_fill(css, mode)
        css = replace_analysis_block(
            css,
            scaffold_analysis_block(
                width=width,
                height=height,
                title=entry["title"],
                mode=mode,
                palette=palette,
                palette_keys=palette_keys,
                banner_name=BANNER_FILENAME,
            ),
        )
        css = update_banner_aspect(css, width, height)
        css = update_summary(css, entry["title"], mode)

        skin_json = json.dumps(
            {
                "title": entry["title"],
                "icon": entry["icon"],
                "banner": BANNER_FILENAME,
                "mode": mode,
            },
            indent=2,
        ) + "\n"

        if dry_run:
            print(
                f"  would create: skins/{entry['id']}/ "
                f"({mode}, {width}x{height}, {BANNER_FILENAME} q{jpeg_quality} "
                f"from {image_path.name})"
            )
            return skin_dir

        skin_dir.mkdir(parents=True, exist_ok=True)
        save_banner_jpeg(img, skin_dir / BANNER_FILENAME, quality=jpeg_quality)
        (skin_dir / "skin.json").write_text(skin_json, encoding="utf-8")
        (skin_dir / "skin.css").write_text(css, encoding="utf-8")
        print(
            f"  created: skins/{entry['id']}/ "
            f"({mode}, {width}×{height}, {BANNER_FILENAME} q{jpeg_quality})"
        )
        return skin_dir


def collect_images(incoming: Path) -> list[Path]:
    files = []
    for path in sorted(incoming.iterdir()):
        if not path.is_file():
            continue
        if path.name.startswith("."):
            continue
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        files.append(path)
    return files


def skin_banner_hashes() -> dict[str, set[str]]:
    """Map sha256(banner bytes) → skin id(s) for existing skins."""
    by_hash: dict[str, set[str]] = {}
    for skin_dir in sorted(SKINS_DIR.iterdir()):
        if not skin_dir.is_dir() or skin_dir.name.startswith("_"):
            continue
        for name in (BANNER_FILENAME, "banner.png"):
            banner = skin_dir / name
            if not banner.is_file():
                continue
            digest = file_sha256(banner)
            by_hash.setdefault(digest, set()).add(skin_dir.name)
    return by_hash


def mark_done_from_existing_skins(
    incoming: Path,
    manifest: dict,
    *,
    dry_run: bool,
) -> int:
    """Copy completed queue images into _DONE/ (hash match or manifest list)."""
    matched = 0
    images = collect_images(incoming)
    if not images:
        print(f"No queued images in {incoming}")
        return 0

    by_name = {path.name: path for path in images}
    banners = skin_banner_hashes()

    done_list = manifest.get("done", [])
    if done_list:
        print(f"Manifest done list: {len(done_list)} file(s)")
        for filename in done_list:
            image_path = by_name.get(filename)
            if not image_path:
                print(f"  skip (not in queue): {filename}")
                continue
            archive_to_done(
                image_path,
                dry_run=dry_run,
                reason="listed in manifest done",
            )
            matched += 1
            del by_name[filename]

    remaining = list(by_name.values())
    if banners and remaining:
        print(f"Hash-matching {len(remaining)} queued image(s) against existing skins …")
        for image_path in remaining:
            digest = file_sha256(image_path)
            skin_ids = banners.get(digest)
            if not skin_ids:
                continue
            label = ", ".join(sorted(skin_ids))
            suffix = f"-{sorted(skin_ids)[0]}" if len(skin_ids) == 1 else ""
            archive_to_done(
                image_path,
                dry_run=dry_run,
                reason=f"matches skins/{label}",
                suffix=suffix,
            )
            matched += 1

    if matched == 0:
        print("  nothing moved to _DONE")
    else:
        print(f"  {matched} file(s) → assets/skin-incoming/_DONE/")
    return matched


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scaffold neumorphism skins from assets/skin-incoming/"
    )
    parser.add_argument(
        "--incoming",
        type=Path,
        default=INCOMING_DIR,
        help=f"Folder of banner images (default: {INCOMING_DIR.relative_to(REPO_ROOT)})",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=MANIFEST_PATH,
        help="Optional JSON overrides (id, title, icon, template)",
    )
    parser.add_argument(
        "--force", action="store_true", help="Overwrite existing skin folders"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Print actions without writing files"
    )
    parser.add_argument(
        "--no-archive",
        action="store_true",
        help="Leave source images in assets/skin-incoming/ after scaffold",
    )
    parser.add_argument(
        "--mark-done",
        action="store_true",
        help=(
            "Copy queued images that match an existing skins/*/banner.jpg (or "
            ".png) into assets/skin-incoming/_DONE/ and remove them from the queue"
        ),
    )
    parser.add_argument(
        "--jpeg-quality",
        type=int,
        default=JPEG_QUALITY_DEFAULT,
        metavar="N",
        help=(
            "JPEG quality for banner.jpg (default: 70 = 7/10). "
            "Pillow scale 1–95."
        ),
    )
    args = parser.parse_args()

    if not 1 <= args.jpeg_quality <= 95:
        print("--jpeg-quality must be between 1 and 95", file=sys.stderr)
        return 1

    incoming = args.incoming.resolve()
    if not incoming.is_dir():
        print(f"Incoming folder not found: {incoming}", file=sys.stderr)
        print("Create it and drop banner images there.", file=sys.stderr)
        return 1

    if args.mark_done:
        manifest = load_manifest(args.manifest.resolve())
        mark_done_from_existing_skins(incoming, manifest, dry_run=args.dry_run)
        return 0

    images = collect_images(incoming)
    if not images:
        print(f"No images in {incoming} (.png, .jpg, .jpeg, .webp)")
        return 0

    manifest = load_manifest(args.manifest.resolve())
    archive = not args.no_archive
    created_count = 0

    try:
        name_words = load_name_words()
    except (FileNotFoundError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1
    used_titles = load_existing_titles()

    print(f"Scaffolding {len(images)} image(s) from {incoming} …")
    for image_path in images:
        entry = resolve_entry(
            image_path.name,
            manifest,
            image_path.stem,
            name_words=name_words,
            used_titles=used_titles,
        )
        skin_dir = SKINS_DIR / entry["id"]
        if skin_dir.exists() and args.force:
            json_path = skin_dir / "skin.json"
            if json_path.is_file():
                try:
                    existing = json.loads(json_path.read_text(encoding="utf-8"))
                    if isinstance(existing.get("title"), str) and existing["title"].strip():
                        entry["title"] = existing["title"].strip()
                    if isinstance(existing.get("icon"), str) and existing["icon"].strip():
                        entry["icon"] = existing["icon"].strip()
                except (json.JSONDecodeError, OSError):
                    pass
        try:
            skin_dir = scaffold_one(
                image_path,
                entry,
                force=args.force,
                dry_run=args.dry_run,
                jpeg_quality=args.jpeg_quality,
            )
            if skin_dir is None:
                continue
            created_count += 1
            if archive:
                archive_to_done(
                    image_path,
                    dry_run=args.dry_run,
                    reason=f"scaffolded skins/{entry['id']}",
                )
        except Exception as exc:  # noqa: BLE001 — CLI should report and continue
            print(f"  error: {image_path.name}: {exc}", file=sys.stderr)

    print()
    if created_count:
        print(f"Scaffolded {created_count} skin(s).")
    if archive and not args.dry_run:
        print("Queued sources copied to assets/skin-incoming/_DONE/ as each completed.")
    print("Refresh the app to pick up new skins (see docs/batch-skins.md)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
