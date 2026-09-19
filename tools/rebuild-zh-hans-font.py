#!/usr/bin/env python3
"""Rebuild the Simplified-Chinese Noto Serif SC webfont subsets.

The main subset serves Simplified-Chinese pages. A separate one-glyph locale
subset serves the “简” language-switch label on other editions without making
them download the full Simplified-Chinese font.

This is an authoring helper with network and optional Python dependencies.
Run it with:
    uv run --with fonttools --with brotli python tools/rebuild-zh-hans-font.py

The upstream font is pinned to a Google Fonts commit and SHA-256 so the
generated source cannot silently change.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError as exc:  # pragma: no cover - authoring dependency
    raise SystemExit(
        "fonttools and brotli are required. Run: "
        "uv run --with fonttools --with brotli "
        "python tools/rebuild-zh-hans-font.py"
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
OUTPUT = ROOT / "assets" / "fonts" / "noto-serif-sc-subset.woff2"
LOCALE_OUTPUT = ROOT / "assets" / "fonts" / "noto-serif-sc-locale.woff2"
META = ROOT / "assets" / "fonts" / "noto-serif-sc-subset.meta.json"
LOCALE_TEXT = "简"

GOOGLE_FONTS_COMMIT = "f2bd09badbc763d8757951d52deec29da27e85fb"
SOURCE_URL = (
    "https://raw.githubusercontent.com/google/fonts/"
    f"{GOOGLE_FONTS_COMMIT}/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf"
)
SOURCE_SHA256 = "050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9"
CONTENT_FILES = (
    CONTENT / "locales" / "zh-hans.json",
    CONTENT / "ci-simplified.json",
    CONTENT / "shi-simplified.json",
)


def wanted_character(char: str) -> bool:
    code = ord(char)
    return (
        0x3000 <= code <= 0x303F
        or 0x3400 <= code <= 0x9FFF
        or 0xF900 <= code <= 0xFAFF
        or 0xFF00 <= code <= 0xFFEF
    )


def collect_text() -> str:
    text = "".join(path.read_text(encoding="utf-8") for path in CONTENT_FILES)
    essay = json.loads((CONTENT / "essay-trainspotting.json").read_text(encoding="utf-8"))
    text += essay["zh-hans"]["language_note"]
    return "".join(sorted({char for char in text if wanted_character(char)}))


def check_sha256(path: Path) -> None:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        raise SystemExit(
            "Noto Serif SC source hash mismatch: "
            f"expected {SOURCE_SHA256}, got {digest}"
        )


def subset_font(source: Path, text: str, output: Path, charset: Path) -> None:
    charset.write_text(text, encoding="utf-8")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.subset",
            str(source),
            f"--text-file={charset}",
            "--flavor=woff2",
            f"--output-file={output}",
            "--layout-features=*",
            "--glyph-names",
            "--symbol-cmap",
            "--legacy-cmap",
            "--notdef-glyph",
            "--notdef-outline",
            "--recommended-glyphs",
            "--name-IDs=*",
            "--name-legacy",
            "--name-languages=*",
        ],
        check=True,
    )


def check_subset(output: Path, text: str) -> None:
    font = TTFont(output)
    cmap = set().union(*(set(table.cmap) for table in font["cmap"].tables))
    missing = sorted(char for char in text if ord(char) not in cmap)
    if missing:
        raise SystemExit(
            f"{output.name} is missing required glyphs: " + "".join(missing)
        )


def main() -> int:
    text = collect_text()
    with tempfile.TemporaryDirectory(prefix="hanpuli-noto-sc-") as tmp:
        tmp_path = Path(tmp)
        source = tmp_path / "NotoSerifSC-wght.ttf"
        urllib.request.urlretrieve(SOURCE_URL, source)
        check_sha256(source)

        subset_font(source, text, OUTPUT, tmp_path / "charset.txt")
        subset_font(source, LOCALE_TEXT, LOCALE_OUTPUT, tmp_path / "locale-charset.txt")

    check_subset(OUTPUT, text)
    check_subset(LOCALE_OUTPUT, LOCALE_TEXT)

    meta = {
        "upstream_commit": GOOGLE_FONTS_COMMIT,
        "upstream_sha256": SOURCE_SHA256,
        "character_count": len(text),
        "character_set_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "font_sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    }
    META.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    print(
        f"rebuilt {OUTPUT.relative_to(ROOT)}: "
        f"{len(text)} characters, {OUTPUT.stat().st_size // 1024} KiB"
    )
    print(
        f"rebuilt {LOCALE_OUTPUT.relative_to(ROOT)}: "
        f"{len(LOCALE_TEXT)} character, {LOCALE_OUTPUT.stat().st_size // 1024} KiB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
