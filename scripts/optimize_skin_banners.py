#!/usr/bin/env python3
"""Convert existing skin banners to JPEG (default quality 70 = 7/10)."""

from __future__ import annotations

import argparse
import json
import re
import sys
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
SKINS_DIR = REPO_ROOT / "skins"


def optimize_skin(
    skin_dir: Path,
    *,
    quality: int,
    dry_run: bool,
) -> tuple[int, int] | None:
    png_path = skin_dir / "banner.png"
    jpg_path = skin_dir / BANNER_FILENAME
    source = png_path if png_path.is_file() else None
    if source is None and jpg_path.is_file():
        return None
    if source is None:
        return None

    before = source.stat().st_size
    if dry_run:
        return before, 0

    with Image.open(source) as img:
        img.load()
        save_banner_jpeg(img, jpg_path, quality=quality)

    after = jpg_path.stat().st_size

    json_path = skin_dir / "skin.json"
    if json_path.is_file():
        data = json.loads(json_path.read_text(encoding="utf-8"))
        data["banner"] = BANNER_FILENAME
        json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    css_path = skin_dir / "skin.css"
    if css_path.is_file():
        css = css_path.read_text(encoding="utf-8")
        css = css.replace("banner.png", BANNER_FILENAME)
        css_path.write_text(css, encoding="utf-8")

    if source != jpg_path:
        source.unlink()

    return before, after


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert skins/*/banner.png to banner.jpg at JPEG quality 7/10"
    )
    parser.add_argument(
        "--jpeg-quality",
        type=int,
        default=JPEG_QUALITY_DEFAULT,
        metavar="N",
        help="JPEG quality (default: 70 = 7/10)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report savings without writing files",
    )
    args = parser.parse_args()

    if not 1 <= args.jpeg_quality <= 95:
        print("--jpeg-quality must be between 1 and 95", file=sys.stderr)
        return 1

    converted = 0
    before_total = 0
    after_total = 0

    for skin_dir in sorted(SKINS_DIR.iterdir()):
        if not skin_dir.is_dir() or skin_dir.name.startswith("_"):
            continue
        result = optimize_skin(skin_dir, quality=args.jpeg_quality, dry_run=args.dry_run)
        if result is None:
            continue
        before, after = result
        before_total += before
        after_total += after if after else before
        converted += 1
        if args.dry_run:
            print(f"  would convert: {skin_dir.name} ({before // 1024} KB → jpg q{args.jpeg_quality})")
        else:
            saved = before - after
            pct = (saved / before * 100) if before else 0
            print(
                f"  {skin_dir.name}: {before // 1024} KB → {after // 1024} KB "
                f"(-{pct:.0f}%)"
            )

    if converted == 0:
        print("No banner.png files found to convert.")
        return 0

    label = "Would convert" if args.dry_run else "Converted"
    if not args.dry_run and after_total:
        saved = before_total - after_total
        pct = saved / before_total * 100 if before_total else 0
        print(
            f"\n{label} {converted} banner(s): "
            f"{before_total // (1024 * 1024)} MB → {after_total // (1024 * 1024)} MB "
            f"(-{pct:.0f}%)"
        )
    else:
        print(f"\n{label} {converted} banner(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
