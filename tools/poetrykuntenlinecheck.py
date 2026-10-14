"""Build a complete, reproducible line-by-line editorial collation.

This is evidence for a human proofreader, not a machine sign-off on the
philological interpretation of return marks or Classical Japanese.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from poetry_library import Library
from poetry_kunten import Kunten
from poetry_kundoku import Kundoku
from poetry_kunten_manuscript import compile_manuscript
from poetry_library import read


def tick(s: str) -> str:
    if "\x60" in s:
        raise ValueError("Unexpected markdown delimiter in literary source")
    return "\x60" + s + "\x60"


def build(root: Path) -> tuple[str, int]:
    library=Library(root)
    kun=Kunten(library)
    readings=Kundoku(library)
    manuscripts=read(root/"content/poetry/kunten-manuscripts.json")["texts"]
    lines=[
        "# 漢文訓点全29篇逐行对读记录",
        "",
        "此表由实际中文正典、书き下し文与人工训点原稿生成，供终校逐行检查。",
        "**原文逐字一致与排版形式正确不构成全文汉文训读、古典日语学术签收。**",
        "任何手工修改都必须先改输入原稿，再重新生成本表。",
        "",
        f"覆盖：{len(kun.texts)}份作品。字位为中文正典的零起始Unicode字符索引，含换行。",
        "",
    ]
    total=0
    for tid,entry in kun.texts.items():
        source=library.edition(tid,"zh")["body"]
        japanese=readings.body(tid)
        manuscript=manuscripts[tid]["annotated"]
        src_lines=source.splitlines(keepends=True)
        jap_lines=japanese.splitlines(keepends=True)
        mark_lines=manuscript.splitlines(keepends=True)
        if len(src_lines)!=len(jap_lines) or len(src_lines)!=len(mark_lines):
            raise ValueError(f"{tid}: source/Japanese/kunten line counts differ")
        if kun.annotated(tid)!=manuscript:
            raise ValueError(f"{tid}: compiler doesn't reproduce original markup")
        if compile_manuscript(source,manuscript)!=entry["marks"]:
            raise ValueError(f"{tid}: per-character marks disagree with markup")
        label=library.work_for_text(tid)["id"]
        lines += ["## "+tid+" ("+label+")",""]
        offset=0
        for row,(cn,ja,marked) in enumerate(zip(src_lines,jap_lines,mark_lines),start=1):
            a=cn.rstrip("\n")
            b=ja.rstrip("\n")
            c=marked.rstrip("\n")
            if not a:
                if b or c:
                    raise ValueError(f"{tid} stanza {row} was lost in translation or marks")
                lines.append("**诗节分隔**")
                lines.append("")
            else:
                if not b or not c:
                    raise ValueError(f"{tid} line {row}: missing Japanese reading or marks")
                end=offset+len(a)-1
                lines += [
                    f"**第{row}行 · 原文字位{offset}至{end}**",
                    "",
                    "- 原文："+tick(a),
                    "- 训点原稿："+tick(c),
                    "- 書き下し文："+tick(b),
                    "",
                ]
                total+=1
            offset+=len(cn)
        if offset!=len(source):
            raise ValueError(f"{tid}: character offsets lost")
        lines += ["---",""]
    lines.insert(7,f"实际有字行：{total}（不包含诗节间空行）。")
    return "\n".join(lines).rstrip("\n")+"\n",total


def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--write",action="store_true",
                        help="Write reviewed source alignment to docs")
    args=parser.parse_args()
    root=Path(__file__).resolve().parent.parent
    rendered,nlines=build(root)
    p=root/"docs/poetry-kunten-full-line-alignment.md"
    if args.write:
        p.write_text(rendered,encoding="utf-8")
    else:
        if not p.exists() or p.read_text(encoding="utf-8")!=rendered:
            raise ValueError("Stale full-line collation; run this script with --write and review diff")
    print(f"poetrykuntenlinecheck: {nlines} lines in 29 poems, "
          "source/Japanese/markup line and stanza boundaries, source codepoint "
          "positions and manual annotation roundtrip PASS")


if __name__=="__main__":
    main()
