#!/usr/bin/env python3
"""Build Open Graph cards from the site's self-hosted fonts."""
from __future__ import annotations

import io
import tempfile
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "assets" / "fonts"
OUT = ROOT / "assets" / "social"

PAPER = "#f5f2eb"
INK = "#171614"
MUTED = "#625e57"
LINE = "#d7d2c8"
ACCENT = "#8a2f1d"
SIZE = (1200, 630)


def woff2_as_ttf(path: Path) -> bytes:
    font = TTFont(path)
    font.flavor = None
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def font_from_woff2(path: Path, size: int) -> ImageFont.FreeTypeFont:
    data = woff2_as_ttf(path)
    with tempfile.NamedTemporaryFile(suffix=".ttf") as tmp:
        tmp.write(data)
        tmp.flush()
        return ImageFont.truetype(tmp.name, size=size)


def font_supports(path: Path, text: str) -> bool:
    font = TTFont(path)
    try:
        cmap = set().union(*(set(table.cmap) for table in font["cmap"].tables))
    finally:
        font.close()
    return all(ord(char) in cmap for char in text)


def cjk_font(text: str, size: int) -> ImageFont.FreeTypeFont:
    candidates = (
        FONTS / "shippori-mincho-common.woff2",
        FONTS / "shippori-mincho-subset.woff2",
        FONTS / "iming-gap.woff2",
    )
    for path in candidates:
        if font_supports(path, text):
            return font_from_woff2(path, size)
    raise ValueError(f"no self-hosted CJK subset contains {text!r}")


def base_card() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", SIZE, PAPER)
    draw = ImageDraw.Draw(image)
    draw.line((72, 72, 1128, 72), fill=INK, width=2)
    draw.line((72, 558, 1128, 558), fill=LINE, width=2)
    draw.ellipse((1098, 42, 1128, 72), fill=ACCENT)
    return image, draw


def save_card(name: str, eyebrow: str, title: str, *, glyph: str | None = None) -> None:
    image, draw = base_card()
    mono = font_from_woff2(FONTS / "courier-prime-latin-400.woff2", 25)
    serif = font_from_woff2(FONTS / "eb-garamond-latin-400.woff2", 95)
    small_serif = font_from_woff2(FONTS / "eb-garamond-latin-400.woff2", 38)

    draw.text((72, 104), eyebrow.upper(), font=mono, fill=MUTED)
    draw.text((72, 511), "HANPU LI", font=mono, fill=INK)

    if glyph:
        cjk = cjk_font(glyph, 286)
        draw.text((1128, 105), glyph, font=cjk, fill=INK, anchor="ra")
        draw.text((72, 235), title, font=small_serif, fill=INK)
    else:
        lines = title.split("\n")
        y = 190
        for line in lines:
            draw.text((72, y), line, font=serif, fill=INK)
            y += 98

    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / name, "PNG", optimize=True)


def build_site_icons() -> None:
    # A small author signature, drawn from the same italic face as the site's
    # literary typography. Generate the vector and touch icon together.
    source = FONTS / "eb-garamond-latin-italic-400.woff2"
    font = TTFont(source)
    try:
        glyphs = font.getGlyphSet()
        cmap = font.getBestCmap()
        h = glyphs[cmap[ord("h")]]
        l = glyphs[cmap[ord("l")]]
        h_pen = SVGPathPen(glyphs)
        l_pen = SVGPathPen(glyphs)
        h.draw(h_pen)
        l.draw(l_pen)
        advance = h.width
    finally:
        font.close()
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <title>Hanpu Li</title>
  <style>
    .ink {{ fill: #171614; }}
    @media (prefers-color-scheme: dark) {{ .ink {{ fill: #f5f2eb; }} }}
  </style>
  <g class="ink" transform="translate(3.75 55.7) scale(.068 -.068)">
    <path d="{h_pen.getCommands()}"/>
    <path transform="translate({advance} 0)" d="{l_pen.getCommands()}"/>
  </g>
</svg>
'''
    (ROOT / "assets" / "site-mark.svg").write_text(svg, encoding="utf-8")

    # Draw at 4x so the italic hairlines survive downsampling.
    scale = 4
    unit = 180 / 64 * scale
    image = Image.new("RGB", (180 * scale, 180 * scale), PAPER)
    draw = ImageDraw.Draw(image)
    letter = font_from_woff2(source, round(68 * unit))
    draw.text((3.75 * unit, 55.7 * unit), "hl", font=letter, fill=INK, anchor="ls")
    image = image.resize((180, 180), Image.Resampling.LANCZOS)
    image.save(ROOT / "assets" / "apple-touch-icon.png", "PNG", optimize=True)


def main() -> None:
    save_card("ci.png", "04 / CI", "Sixteen-poem cycle · appendix · later pair", glyph="詞")
    save_card("shi.png", "05 / POEMS", "Poems in draft", glyph="詩")
    save_card("about.png", "IMPLEMENTATION NOTES / 2026", "ABOUT\nTHIS SITE")
    save_card("trainspotting.png", "ESSAY / TRAINSPOTTING", "FROM GEARS\nTO GASP")
    save_card("first-love.png", "STUDY / FIRST LOVE", "ON FIRST LOVE")
    build_site_icons()
    print("social cards: ci, shi, about, trainspotting, first-love; site icons")


if __name__ == "__main__":
    main()
