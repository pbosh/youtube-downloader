#!/usr/bin/env python3
"""Assign unique random two-word titles to every skin (see skin-name-words.txt)."""

from __future__ import annotations

import json
import random
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SKINS_DIR = REPO_ROOT / "skins"
NAME_WORDS_PATH = REPO_ROOT / "scripts" / "skin-name-words.txt"


def load_name_words() -> list[str]:
    words: list[str] = []
    for line in NAME_WORDS_PATH.read_text(encoding="utf-8").splitlines():
        word = line.split("#", 1)[0].strip()
        if word:
            words.append(word)
    if len(words) < 2:
        raise ValueError(f"Need at least 2 words in {NAME_WORDS_PATH}")
    return words


def assign_titles(words: list[str], count: int) -> list[str]:
    pairs = [f"{a} {b}" for a in words for b in words if a != b]
    if count > len(pairs):
        raise ValueError(f"Need {count} titles but only {len(pairs)} distinct pairs")
    return random.sample(pairs, count)


def skin_mode(css: str) -> str:
    return "Light" if "color-scheme: light;" in css else "Dark"


def update_skin_css(css: str, title: str) -> str:
    mode = skin_mode(css)
    css = re.sub(
        r'(--skin-analysis-summary:\s*")[^"]*(";\s*)',
        rf'\1{mode} neumorphism: {title}\2',
        css,
        count=1,
    )
    css = re.sub(
        r"(^(\s*source-image:\s*banner\.png \(\d+×\d+\) — )[^\n;]+$)",
        rf"\1{title}",
        css,
        count=1,
        flags=re.MULTILINE,
    )
    return css


def main() -> int:
    words = load_name_words()
    skin_dirs = sorted(
        path
        for path in SKINS_DIR.iterdir()
        if path.is_dir() and not path.name.startswith("_")
    )
    titles = assign_titles(words, len(skin_dirs))

    for skin_dir, title in zip(skin_dirs, titles, strict=True):
        json_path = skin_dir / "skin.json"
        css_path = skin_dir / "skin.css"
        if not json_path.is_file():
            print(f"  skip (no skin.json): {skin_dir.name}", file=sys.stderr)
            continue

        data = json.loads(json_path.read_text(encoding="utf-8"))
        data["title"] = title
        json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

        if css_path.is_file():
            css = css_path.read_text(encoding="utf-8")
            css_path.write_text(update_skin_css(css, title), encoding="utf-8")

        print(f"  {skin_dir.name} → {title}")

    print(f"\nRenamed {len(skin_dirs)} skin(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
