#!/usr/bin/env python3
"""重建中文 webfont 子集。页面文字改动后运行一次:
    python3 tools/rebuild-fonts.py
子集只含全站实际用字(约 800 字);新增汉字若不重建会回落到宋体。
依赖: pip install fonttools brotli
源字体: ~/Library/Fonts/HuiwenMincho.ttf (汇文明朝体全量,若缺失自动下载)
"""
import glob, os, re, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.expanduser("~/Library/Fonts/HuiwenMincho.ttf")
URL = "https://github.com/bosswnx/huiwenmincho-improved/raw/main/%E5%8C%AF%E6%96%87%E6%98%8E%E6%9C%9D%E9%AB%94.ttf"
OUT = os.path.join(ROOT, "assets/fonts/huiwen-mincho-subset.woff2")

chars = set()
for f in glob.glob(os.path.join(ROOT, "*.html")):
    t = open(f, encoding="utf-8").read()
    t = re.sub(r"<style>.*?</style>", "", t, flags=re.S)
    t = re.sub(r"<[^>]+>", "", t)
    chars.update(c for c in t if ord(c) >= 0x2E80 or c in "£²·–—’←→")
chars.discard("🐈")

if not os.path.exists(SRC):
    print("下载汇文明朝体…")
    urllib.request.urlretrieve(URL, SRC)

txt = os.path.join(ROOT, "tools/.charset.txt")
open(txt, "w", encoding="utf-8").write("".join(sorted(chars)))
subprocess.run([sys.executable, "-m", "fontTools.subset", SRC,
                f"--text-file={txt}", "--flavor=woff2", f"--output-file={OUT}",
                "--no-hinting", "--desubroutinize"], check=True)
os.remove(txt)
print(f"{len(chars)} 字 → {OUT} ({os.path.getsize(OUT)//1024} KB)")
print("注意: 「寖」来自 iming-gap.woff2 补丁,若新增汇文缺字需另行处理(脚本会照常打包,缺字静默跳过)。")
