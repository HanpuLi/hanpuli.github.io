#!/usr/bin/env python3
"""重建中文 webfont 子集(香港正字繁体版)。页面文字改动后运行一次:
    python3 tools/rebuild-fonts.py
主力 Shippori Mincho 只含全站实际用字;新增汉字若不重建会回落宋体。
Shippori 缺字由 I.MingCP 补丁兜底——若脚本报告缺字变化,
需同步更新四个页面 @font-face "IMing Gap" 的 unicode-range。
依赖: pip install fonttools brotli
源字体(均在 ~/Library/Fonts/): ShipporiMincho-Regular.ttf, I.MingCP-8.10.ttf
"""
import glob, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP = os.path.expanduser("~/Library/Fonts/ShipporiMincho-Regular.ttf")
IM = os.path.expanduser("~/Library/Fonts/I.MingCP-8.10.ttf")
OUT = os.path.join(ROOT, "assets/fonts/shippori-mincho-subset.woff2")
GAP = os.path.join(ROOT, "assets/fonts/iming-gap.woff2")

chars = set()
for f in glob.glob(os.path.join(ROOT, "*.html")):
    t = open(f, encoding="utf-8").read()
    t = re.sub(r"<style>.*?</style>", "", t, flags=re.S)
    t = re.sub(r"<[^>]+>", "", t)
    chars.update(c for c in t if ord(c) >= 0x2E80 or c in "£²·–—’←→")
chars.discard("🐈")

from fontTools.ttLib import TTFont
cmap = TTFont(SP).getBestCmap()
missing = sorted(c for c in chars if ord(c) not in cmap)

txt = os.path.join(ROOT, "tools/.charset.txt")
open(txt, "w", encoding="utf-8").write("".join(sorted(chars)))
subprocess.run([sys.executable, "-m", "fontTools.subset", SP,
                f"--text-file={txt}", "--flavor=woff2", f"--output-file={OUT}",
                "--no-hinting", "--desubroutinize"], check=True)
os.remove(txt)
print(f"{len(chars)} 字 → {OUT} ({os.path.getsize(OUT)//1024} KB)")

if missing:
    subprocess.run([sys.executable, "-m", "fontTools.subset", IM,
                    f"--text={''.join(missing)}", "--flavor=woff2",
                    f"--output-file={GAP}", "--no-hinting"], check=True)
    rng = ", ".join(f"U+{ord(c):04X}" for c in missing)
    print(f"Shippori 缺字 {''.join(missing)} → I.MingCP 补丁已重建")
    print(f"核对页面 unicode-range 是否为: {rng}")
else:
    print("Shippori 无缺字;iming-gap.woff2 可按需移除。")
