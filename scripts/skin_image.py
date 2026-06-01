"""Banner image helpers shared by scaffold and optimize scripts."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

BANNER_FILENAME = "banner.jpg"
JPEG_QUALITY_DEFAULT = 70  # 7/10 on a 0–10 quality scale → Pillow 0–100


def save_banner_jpeg(
    source: Image.Image,
    dest: Path,
    *,
    quality: int = JPEG_QUALITY_DEFAULT,
) -> None:
    """Write a flat RGB JPEG banner (handles alpha by compositing on white)."""
    img = source.copy()
    if img.mode in ("RGBA", "LA"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode == "P":
        img = img.convert("RGBA")
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(
        dest,
        format="JPEG",
        quality=quality,
        optimize=True,
        progressive=True,
    )
