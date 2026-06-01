#!/usr/bin/env python3
"""Write mode: light|dark into each skins/*/skin.json from skin.css progress fill."""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SKINS_DIR = REPO_ROOT / "skins"


def mode_from_css(css: str) -> str:
    match = re.search(r"--button-progress-fill:\s*([^;]+);", css)
    if match:
        fill = match.group(1).lower()
        if "black" in fill:
            return "light"
        if "white" in fill:
            return "dark"
    return "light" if "color-scheme: light" in css else "dark"


def main() -> int:
    updated = 0
    for skin_dir in sorted(SKINS_DIR.iterdir()):
        if not skin_dir.is_dir() or skin_dir.name.startswith("_"):
            continue
        json_path = skin_dir / "skin.json"
        css_path = skin_dir / "skin.css"
        if not json_path.is_file() or not css_path.is_file():
            continue

        mode = mode_from_css(css_path.read_text(encoding="utf-8"))
        data = json.loads(json_path.read_text(encoding="utf-8"))
        if data.get("mode") == mode:
            continue
        data["mode"] = mode
        json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        updated += 1

    print(f"Labeled {updated} skin(s) with mode (light/dark).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
