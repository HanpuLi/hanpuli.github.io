"""Optical left margins for EB Garamond display type.

Every glyph carries a left side bearing, so a heading whose box sits on a
column edge has its ink a few pixels inside that edge (the home hero "H" at
1440px: 7.25px). This module removes that gap.

Two halves:

* ``python3 tools/optical_margins.py`` (needs fontTools; run with
  ``uv run --with fonttools --with brotli python tools/optical_margins.py``)
  reads the EB Garamond subsets in ``assets/fonts/``, measures each glyph's
  left bearing inside the band from the baseline to the cap height (x-height
  for lowercase, so descender hooks and accents do not count), writes
  ``tools/optical_margins.json`` and rewrites the generated block at the end
  of ``assets/site.css``. Run it only when the fonts change.

* ``tag(page_html)`` (stdlib, called by the build) adds
  ``class="ol" data-ol="<first glyph>"`` (plus ``data-ol-i`` when the glyph
  is italic) to display blocks whose first visible glyph is in the table.
  It only touches the opening tag; text is never changed.

Policy: straight stems and figures put their ink on the edge; round letters
(O C G Q S ...) protrude by EB Garamond's overshoot (.010em) and open or
diagonal letters (A V W T Y ...) by twice that, as in optical margin
alignment. A ``translate`` moves every line of the block by the median
bearing (no reflow), and ``text-indent`` adds the first glyph's exact
difference on line one.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLE_PATH = ROOT / "tools" / "optical_margins.json"
CSS_PATH = ROOT / "assets" / "site.css"
BEGIN = "/* BEGIN generated optical margins (tools/optical_margins.py) */"
END = "/* END generated optical margins */"

ROUND = set("OCGQSÒÓÔÕÖØÇŒОСЭЄФ")
OPEN = set("AVWXYTÀÁÂÃÄÅÆÝŸАДЛУХЖЯТ")
OVERSHOOT = 0.010  # EB Garamond O: ((664 - 653) + (14 - 5)) / 2 / 1000
BASE = 0.027       # median band bearing of display line starts on the site

ROMAN_SET = ("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&"
             "ÀÁÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ"
             "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯабвгдежзийклмнопрстуфхцчшщэюя")
ITALIC_SET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ"

FONTS = {
    "roman": ("eb-garamond-latin-400", "eb-garamond-cyrillic-400"),
    "italic": ("eb-garamond-latin-italic-400", "eb-garamond-cyrillic-italic-400"),
}


# ---------------------------------------------------------------- generator

def _band_bearings(path: Path) -> dict[str, float]:
    from fontTools.pens.basePen import BasePen  # type: ignore
    from fontTools.ttLib import TTFont  # type: ignore

    class Flat(BasePen):
        def __init__(self, glyphset):
            super().__init__(glyphset)
            self.pts: list[tuple[float, float]] = []
            self.cur = (0.0, 0.0)

        def _moveTo(self, p):
            self.cur = p
            self.pts.append(p)

        def _lineTo(self, p):
            x0, y0 = self.cur
            self.pts.extend((x0 + (p[0] - x0) * i / 16, y0 + (p[1] - y0) * i / 16) for i in range(1, 17))
            self.cur = p

        def _curveToOne(self, p1, p2, p3):
            x0, y0 = self.cur
            for i in range(1, 33):
                t = i / 32
                m = 1 - t
                self.pts.append((m**3 * x0 + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t**3 * p3[0],
                                 m**3 * y0 + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t**3 * p3[1]))
            self.cur = p3

        def _qCurveToOne(self, p1, p2):
            x0, y0 = self.cur
            for i in range(1, 33):
                t = i / 32
                m = 1 - t
                self.pts.append((m * m * x0 + 2 * m * t * p1[0] + t * t * p2[0],
                                 m * m * y0 + 2 * m * t * p1[1] + t * t * p2[1]))
            self.cur = p2

        def _closePath(self):
            pass

    font = TTFont(str(path))
    upm = font["head"].unitsPerEm
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    os2 = font["OS/2"]
    cap = os2.sCapHeight or 650
    xh = os2.sxHeight or 400
    out: dict[str, float] = {}
    for cp, name in cmap.items():
        ch = chr(cp)
        if not (ch.isalnum() or ch == "&"):
            continue
        pen = Flat(glyphs)
        glyphs[name].draw(pen)
        if not pen.pts:
            continue
        top = xh if ch.islower() else cap
        band = [x for x, y in pen.pts if 0 <= y <= top] or [x for x, _ in pen.pts]
        out[ch] = min(band) / upm
    return out


def generate() -> None:
    table: dict[str, dict[str, float]] = {}
    for style, names in FONTS.items():
        merged: dict[str, float] = {}
        for name in names:
            for ch, value in _band_bearings(ROOT / "assets" / "fonts" / f"{name}.woff2").items():
                merged.setdefault(ch, value)
        wanted = ROMAN_SET if style == "roman" else ITALIC_SET
        rows = {}
        for ch in wanted:
            if ch not in merged:
                continue
            offset = -merged[ch]
            if ch in ROUND:
                offset -= OVERSHOOT
            elif ch in OPEN:
                offset -= 2 * OVERSHOOT
            rows[ch] = round(offset, 3)
        table[style] = rows
    TABLE_PATH.write_text(json.dumps(table, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    write_css(table)


def _em(value: float) -> str:
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    text = text.replace("-0.", "-.").replace("0.", ".", 1) if text not in ("0", "-0") else "0"
    return f"{text}em" if text != "0" else "0"


def css_block(table: dict[str, dict[str, float]]) -> str:
    lines = [
        BEGIN,
        "/* EB Garamond left bearings measured from assets/fonts (do not edit by hand).",
        "   .ol is set by the build on display blocks whose first glyph is EB Garamond:",
        "   translate moves every line by the median bearing without reflow, text-indent",
        "   adds the first glyph's own difference. Sans and OpenDyslexic have other",
        "   bearings, so the correction is off in those reading modes. */",
        f".ol {{ --ol: {_em(-BASE)}; translate: {_em(-BASE)} 0; text-indent: calc(var(--ol) + {_em(BASE)}); }}",
        "html:is([data-reading-sans], [data-reading-dyslexia]) .ol { translate: none; text-indent: 0; }",
    ]
    for ch, value in table["roman"].items():
        lines.append(f'.ol[data-ol="{ch}"] {{ --ol: {_em(value)}; }}')
    for ch, value in table["italic"].items():
        lines.append(f'.ol[data-ol="{ch}"][data-ol-i] {{ --ol: {_em(value)}; }}')
    lines.append(END)
    return "\n".join(lines) + "\n"


def write_css(table: dict[str, dict[str, float]]) -> None:
    css = CSS_PATH.read_text(encoding="utf-8")
    block = css_block(table)
    if BEGIN in css:
        start = css.index(BEGIN)
        end = css.index(END) + len(END) + 1
        css = css[:start] + block + css[end:]
    else:
        css = css.rstrip("\n") + "\n\n" + block
    CSS_PATH.write_text(css, encoding="utf-8")


# ------------------------------------------------------------------- tagger

_TABLE: dict[str, dict[str, float]] | None = None


def _table() -> dict[str, dict[str, float]]:
    global _TABLE
    if _TABLE is None:
        _TABLE = json.loads(TABLE_PATH.read_text(encoding="utf-8"))
    return _TABLE


TARGET = re.compile(r"<(h1|h2|h3|p)\b([^>]*)>", re.I)
DECKS = re.compile(r'class="[^"]*\b(essay-deck|project-voucher-deck|pv-subtitle|notfound-code|shop-deck)\b')
# Explicit-<br> names and titles carry their own per-line corrections in CSS.
SKIP_ID = re.compile(r'\bid="(hero-title|pv-title|shop-title)"')
CJK_LANG = re.compile(r'\blang="(zh|ja)', re.I)
TAG = re.compile(r"<(/?)([a-zA-Z0-9]+)([^>]*)>")
VOID = {"br", "img", "wbr", "input", "source", "meta", "link", "hr"}


def _first_glyph(page: str, i: int) -> tuple[str, bool, bool] | None:
    """First visible character after i: (char, italic, in CJK-language element)."""
    stack: list[tuple[str, str]] = []
    while i < len(page):
        c = page[i]
        if c == "<":
            m = TAG.match(page, i)
            if not m:
                return None
            closing, name, attrs = m.group(1), m.group(2).lower(), m.group(3)
            if not closing:
                if "visually-hidden" in attrs:
                    depth, j = 1, m.end()
                    while depth and j < len(page):
                        n = TAG.search(page, j)
                        if not n:
                            return None
                        if n.group(1):
                            depth -= 1
                        elif not (n.group(3).endswith("/") or n.group(2).lower() in VOID):
                            depth += 1
                        j = n.end()
                    i = j
                    continue
                if name not in VOID and not attrs.endswith("/"):
                    stack.append((name, attrs))
            else:
                if not stack:
                    return None  # left the target element without visible text
                stack.pop()
            i = m.end()
            continue
        if c == "&":
            m = re.match(r"&#?\w+;", page[i:])
            ch = html.unescape(m.group(0)) if m else "&"
            step = len(m.group(0)) if m else 1
        else:
            ch, step = c, 1
        if ch.strip():
            italic = any(n in ("em", "i", "cite") for n, _ in stack)
            cjk = any(CJK_LANG.search(a) for _, a in stack)
            return ch, italic, cjk
        i += step
    return None


def tag(page: str) -> str:
    table = _table()
    out: list[str] = []
    pos = 0
    for m in TARGET.finditer(page):
        name, attrs = m.group(1).lower(), m.group(2)
        if name == "p" and not DECKS.search(attrs):
            continue
        # data-poetry-title headings are rewritten by script after load, so the
        # first glyph at build time is not the one painted.
        if SKIP_ID.search(attrs) or CJK_LANG.search(attrs) or "data-ol" in attrs or "data-poetry-title" in attrs:
            continue
        glyph = _first_glyph(page, m.end())
        if not glyph:
            continue
        ch, italic, cjk = glyph
        if cjk or ch not in table["italic" if italic else "roman"]:
            continue
        if re.search(r'\bclass="', attrs):
            new_attrs = re.sub(r'\bclass="', 'class="ol ', attrs, count=1)
        else:
            new_attrs = attrs + ' class="ol"'
        new_attrs += f' data-ol="{html.escape(ch, quote=True)}"' + (" data-ol-i" if italic else "")
        out.append(page[pos:m.start()])
        out.append(f"<{m.group(1)}{new_attrs}>")
        pos = m.end()
    out.append(page[pos:])
    return "".join(out)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        sys.stdout.write(tag(Path(sys.argv[1]).read_text(encoding="utf-8")))
    else:
        generate()
