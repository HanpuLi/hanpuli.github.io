#!/usr/bin/env python3
"""重建香港正字繁体 / 日文所用的 Shippori webfont 子集。

页面文字改动后运行:
    uv run --with fonttools --with brotli python tools/rebuild-fonts.py

简体中文版的 Noto Serif SC 子集由 tools/rebuild-zh-hans-font.py 单独维护，
不要把简体字形并入 Shippori 子集。

Shippori Mincho 只含全站实际用字;新增汉字若不重建会回落宋体。
Shippori 缺字由 I.MingCP 补丁兜底——若脚本报告缺字变化,
需同步更新 assets/site.css 中 @font-face "IMing Gap" 的 unicode-range。
依赖: pip install fonttools brotli
源字体(均在 ~/Library/Fonts/): ShipporiMincho-Regular.ttf, I.MingCP-8.10.ttf
"""
import glob, os, re, subprocess, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP = os.path.expanduser("~/Library/Fonts/ShipporiMincho-Regular.ttf")
IM = os.path.expanduser("~/Library/Fonts/I.MingCP-8.10.ttf")
OUT = os.path.join(ROOT, "assets/fonts/shippori-mincho-subset.woff2")
COMMON_OUT = os.path.join(ROOT, "assets/fonts/shippori-mincho-common.woff2")
GAP = os.path.join(ROOT, "assets/fonts/iming-gap.woff2")
# Present on the default English edition: identity, locale controls, 留證 and the favicon glyph.
# Keep this set deliberately CJK-only; punctuation/symbols fall back to the Latin/system faces.
COMMON_CHARS = set("李函璞留證詞繁日")

class BodyTextParser(HTMLParser):
    """Collect rendered body text while ignoring non-rendered font sources."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_body = False
        self.suppressed_element = 0
        self.simplified_404_template = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "body":
            self.in_body = True
            return
        if not self.in_body:
            return
        if tag in {"script", "style"}:
            self.suppressed_element += 1
            return
        if tag == "template" and dict(attrs).get("id") == "notfound-locale-zh-hans":
            self.simplified_404_template += 1

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {"script", "style"} and self.suppressed_element:
            self.suppressed_element -= 1
            return
        if tag == "template" and self.simplified_404_template:
            self.simplified_404_template -= 1
            return
        if tag == "body":
            self.in_body = False

    def handle_data(self, data):
        if self.in_body and not self.suppressed_element and not self.simplified_404_template:
            self.parts.append(data)

chars = set()
for f in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
    rel = os.path.relpath(f, ROOT).split(os.sep)
    # The Noto Serif SC subset owns the Simplified-Chinese edition; standalone
    # utility pages have their own typography and must not leak characters into
    # the Traditional/Japanese Shippori subset.
    if (
        "templates" in rel
        or os.path.basename(f) == "card.html"
        or rel[0] in {"zh-hans", "mail-assistant"}
    ):
        continue
    parser = BodyTextParser()
    parser.feed(open(f, encoding="utf-8").read())
    t = "".join(parser.parts)
    chars.update(c for c in t if ord(c) >= 0x2E80 or c in "£²·–—’←→")
# The Simplified-Chinese locale switch label is rendered by the one-glyph
# Noto Serif SC locale subset built by rebuild-zh-hans-font.py, not Shippori/I.Ming.
chars.discard("简")

from fontTools.ttLib import TTFont
cmap = TTFont(SP).getBestCmap()
missing = sorted(c for c in chars if ord(c) not in cmap)
common_chars = sorted(c for c in chars & COMMON_CHARS if ord(c) in cmap)
main_chars = sorted(c for c in chars - COMMON_CHARS if ord(c) in cmap)

common_txt = os.path.join(ROOT, "tools/.charset-common.txt")
open(common_txt, "w", encoding="utf-8").write("".join(common_chars))
subprocess.run([sys.executable, "-m", "fontTools.subset", SP,
                f"--text-file={common_txt}", "--flavor=woff2", f"--output-file={COMMON_OUT}",
                "--no-hinting", "--desubroutinize"], check=True)
os.remove(common_txt)
print(f"{len(common_chars)} 常用字 → {COMMON_OUT} ({os.path.getsize(COMMON_OUT)//1024} KB)")

txt = os.path.join(ROOT, "tools/.charset.txt")
open(txt, "w", encoding="utf-8").write("".join(main_chars))
subprocess.run([sys.executable, "-m", "fontTools.subset", SP,
                f"--text-file={txt}", "--flavor=woff2", f"--output-file={OUT}",
                "--no-hinting", "--desubroutinize"], check=True)
os.remove(txt)
print(f"{len(main_chars)} 正文字 → {OUT} ({os.path.getsize(OUT)//1024} KB)")

if missing:
    subprocess.run([sys.executable, "-m", "fontTools.subset", IM,
                    f"--text={''.join(missing)}", "--flavor=woff2",
                    f"--output-file={GAP}", "--no-hinting"], check=True)
    rng = ", ".join(f"U+{ord(c):04X}" for c in missing)
    print(f"Shippori 缺字 {''.join(missing)} → I.MingCP 补丁已重建")

    css_path = os.path.join(ROOT, "assets/site.css")
    css = open(css_path, encoding="utf-8").read()
    face = re.search(
        r'@font-face\s*\{(?=[^}]*font-family:\s*["\']IMing Gap["\'])[^}]*unicode-range:\s*([^;]+);',
        css,
        flags=re.S,
    )
    actual_range = face.group(1).strip() if face else None
    if actual_range != rng:
        print(
            f"IMing Gap unicode-range 不一致: CSS={actual_range!r}, 应为={rng!r}",
            file=sys.stderr,
        )
        raise SystemExit(1)
    print(f"IMing Gap unicode-range 已核对: {rng}")
else:
    print("Shippori 无缺字;iming-gap.woff2 可按需移除。")
