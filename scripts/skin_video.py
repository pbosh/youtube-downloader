"""Video banner helpers for skin scaffold (requires ffmpeg + ffprobe on PATH)."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

from skin_image import JPEG_QUALITY_DEFAULT, save_banner_jpeg

VIDEO_SUFFIXES = {".mp4", ".mov", ".webm", ".m4v"}
BANNER_THUMB_FILENAME = "banner-thumb.jpg"


def require_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise RuntimeError(
            "ffmpeg and ffprobe are required for video skins. Install with: brew install ffmpeg"
        )


def is_video_path(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_SUFFIXES


def video_dimensions(path: Path) -> tuple[int, int]:
    require_ffmpeg()
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=s=x:p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    parts = result.stdout.strip().split("x")
    if len(parts) != 2:
        raise RuntimeError(f"Could not read video dimensions for {path.name}")
    return int(parts[0]), int(parts[1])


def extract_first_frame_image(path: Path) -> Image.Image:
    require_ffmpeg()
    with tempfile.NamedTemporaryFile(suffix=".png") as handle:
        temp_path = Path(handle.name)
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(path),
                "-frames:v",
                "1",
                str(temp_path),
            ],
            capture_output=True,
            check=True,
        )
        with Image.open(temp_path) as img:
            return img.convert("RGB")


def banner_video_filename(source: Path) -> str:
    return f"banner{source.suffix.lower()}"


def write_video_banner(source: Path, skin_dir: Path) -> str:
    banner_name = banner_video_filename(source)
    shutil.copy2(source, skin_dir / banner_name)
    return banner_name


def write_banner_thumb_from_video(
    source: Path,
    skin_dir: Path,
    *,
    quality: int = JPEG_QUALITY_DEFAULT,
) -> None:
    frame = extract_first_frame_image(source)
    save_banner_jpeg(frame, skin_dir / BANNER_THUMB_FILENAME, quality=quality)
