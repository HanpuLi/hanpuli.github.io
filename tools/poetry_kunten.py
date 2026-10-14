"""Reviewed kanbun marks and standalone sandboxed visual readers.

The canonical Chinese text stays in the portfolio document. This builds an
isolated HTML presentation with the site's own vertical kanbun typesetter
(assets/kanbun-viewer/kanbun-render.js).
No marks are inferred from Japanese translations.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
from pathlib import Path
from typing import Any

from poetry_library import Library, read
from poetry_kundoku import title_parts

KANA = re.compile(r"^[\u3040-\u309f\u30a0-\u30ffー]+$")
RETURNS = set("レ一二三四五六七八九十上下甲乙丙丁天地人") | {
    character + "レ" for character in "一二三四五六七八九十上下甲乙丙丁天地人"
}
MARKUP_CHARS = set("(){}[]‹›«»⦉⦊⌊⌋‘’“”\u2010")
BASE = Path("assets/kanbun-viewer")
TITLE_COLUMN = 12  # Han characters in a single title column
SOURCE_FILES = ("kanbun-render.js", "kanbun-render.css", "viewer.js", "viewer.css")


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def check_marks(tid: str, source: str, marks: list[dict]) -> None:
    prev = -1
    for mark in marks:
        i = mark["position"]
        if type(i) is not int or i <= prev or i >= len(source):
            raise ValueError("Non-unique or unordered kanbun position: " + tid)
        prev = i
        if mark["char"] != source[i] or source[i].isspace() or source[i] in "。，、！？；：":
            raise ValueError("Kanbun mark detached from Chinese character: " + tid)
        allowed = {"position", "char", "furigana", "okurigana",
                   "saidoku_furigana", "saidoku_okurigana", "kaeriten",
                   "gofu"}
        if set(mark) - allowed:
            raise ValueError("Unknown kanbun mark type: " + tid)
        if not any(k in mark for k in allowed - {"position", "char"}):
            raise ValueError("Empty mark: " + tid)
        for field in ("furigana", "okurigana", "saidoku_furigana",
                      "saidoku_okurigana"):
            if field in mark and not KANA.fullmatch(mark[field]):
                raise ValueError("Malformed kana in " + tid)
        # A second reading may be a single kana (未…ず) with no
        # separate okurigana; okurigana alone has nothing to attach to.
        if "saidoku_okurigana" in mark and "saidoku_furigana" not in mark:
            raise ValueError("Incomplete saidokumoji pair: " + tid)
        if "gofu" in mark and (mark["gofu"] is not True or i + 1 >= len(source)
                               or not "\u4e00" <= source[i + 1] <= "\u9fff"):
            raise ValueError("合符 must join two adjacent characters: " + tid)
        if "kaeriten" in mark and mark["kaeriten"] not in RETURNS:
            raise ValueError("Unsupported return mark in " + tid)
        if mark.get("kaeriten") == "レ":
            if i + 1 >= len(source) or source[i + 1].isspace() or source[i + 1] in "，。、！？；：":
                raise ValueError("レ point has no adjacent character: " + tid)

    # Ordinary 二 / 一 points must balance within an authored line.
    # Do not split at commas: e.g. 朝中措「便作，銀磬微鳴」
    # intentionally carries a returned clause across a caesura.
    pairs = {mark["position"]: mark.get("kaeriten") for mark in marks}
    start = 0
    for line in source.splitlines(keepends=True):
        stack: list[int] = []
        for position in range(start, start + len(line)):
            point = pairs.get(position)
            if point == "二":
                stack.append(position)
            elif point in ("一", "一レ"):
                if not stack:
                    raise ValueError("Orphan 一 point: " + tid)
                stack.pop()
        if stack:
            raise ValueError("Unpaired 二 point: " + tid)
        start += len(line)



def han_count(annotated: str) -> int:
    plain = re.sub(r"[({\[‹«][^)}\]›»]*[)}\]›»]", "", annotated)
    return sum("\u3400" <= c <= "\u9fff" for c in plain)


def annotate(source: str, marks: list[dict]) -> str:
    by_position = {m["position"]: m for m in marks}
    result = []
    for i, char in enumerate(source):
        result.append(char)
        mark = by_position.get(i)
        if mark is None:
            continue
        if mark.get("furigana"):
            result.append("(" + mark["furigana"] + ")")
        if mark.get("okurigana"):
            result.append("{" + mark["okurigana"] + "}")
        if mark.get("saidoku_furigana"):
            result.append("‹" + mark["saidoku_furigana"] + "›")
        if mark.get("saidoku_okurigana"):
            result.append("«" + mark["saidoku_okurigana"] + "»")
        if mark.get("kaeriten"):
            result.append("[" + mark["kaeriten"] + "]")
        if mark.get("gofu"):
            result.append("\u2010")
    return "".join(result)


class Kunten:
    def __init__(self, library: Library):
        self.library = library
        self.data = read(library.content / "poetry/kunten.json")
        if self.data.get("schema") != 1 or self.data.get("language") != "ja":
            raise ValueError("Unsupported kunten schema")
        self.texts: dict[str, Any] = self.data["texts"]
        reader_data = read(library.content / "poetry/kunten-reader-notes.json")
        if reader_data.get("schema") != 1 or reader_data.get("language") != "ja":
            raise ValueError("Unsupported kanbun reader-note schema")
        self.reader_notes: dict[str, list[str]] = reader_data["texts"]
        if set(self.reader_notes) != set(self.texts):
            raise ValueError("Reader-facing kanbun glosses must cover each annotated text")
        for tid, notes in self.reader_notes.items():
            if (not isinstance(notes, list) or not 1 <= len(notes) <= 3
                    or any(not isinstance(n, str) or not 8 <= len(n) <= 250
                           for n in notes)):
                raise ValueError("Invalid concise kanbun reader gloss: " + tid)
        for tid, entry in self.texts.items():
            if tid not in library.texts or library.work_for_text(tid)["form"] not in ("ci", "shi", "qu"):
                raise ValueError("Nonclassical or unknown kanbun ID: " + tid)
            source = library.edition(tid, "zh")["body"]
            sha = hashlib.sha256(source.encode("utf-8")).hexdigest()
            if entry.get("source_body_sha256") != sha:
                raise ValueError("Stale Chinese original for kanbun: " + tid)
            if entry.get("status") not in ("pilot-reviewed", "reviewed"):
                raise ValueError("Unapproved kanbun display status: " + tid)
            if any(c in MARKUP_CHARS for c in source):
                raise ValueError("Kanbun renderer special syntax in original: " + tid)
            if set(entry) - {"source_body_sha256", "status", "marks", "title", "notes"}:
                raise ValueError("Unexpected kanbun metadata: " + tid)
            check_marks(tid, source, entry["marks"])
            title = entry.get("title")
            parts = title_parts(library.edition(tid, "zh")["title"])
            if not isinstance(title, list) or len(title) != len(parts):
                raise ValueError("Kanbun marks must cover each part of the title: " + tid)
            for part, marks in zip(parts, title):
                if any(c in MARKUP_CHARS for c in part):
                    raise ValueError("Kanbun renderer special syntax in title: " + tid)
                check_marks(tid, part, marks)

    def annotated(self, tid: str) -> str:
        return annotate(self.library.edition(tid, "zh")["body"], self.texts[tid]["marks"])

    def annotated_title(self, tid: str) -> list[str]:
        parts = title_parts(self.library.edition(tid, "zh")["title"])
        return [annotate(part, marks) for part, marks in zip(parts, self.texts[tid]["title"])]

    def href(self, tid: str) -> str:
        if tid not in self.texts:
            raise ValueError("Unreviewed kanbun text: " + tid)
        # Versioned by content: a cached old frame beside a new host page
        # showed neither the old outer title nor the new framed one.
        digest = hashlib.sha256(self.page(tid).encode("utf-8")).hexdigest()[:12]
        return f"/assets/kanbun-viewer/works/{tid}.html?v={digest}"

    def asset(self, name: str) -> str:
        data = (self.library.root / BASE / name).read_bytes()
        return f"../{name}?v={hashlib.sha256(data).hexdigest()[:12]}"

    def page(self, tid: str) -> str:
        source = self.library.edition(tid, "zh")["body"]
        # convertKanbunDiv converts each direct child paragraph and expects
        # an HTML-escaped annotated string, not already-rendered HTML.
        # The page keeps the source structure (title parts, stanzas,
        # authored lines); kanbun-render.js then sets the units as in a
        # 漢文 textbook: one 句 a column, a blank column between stanzas,
        # the tune name and a 低二格 preface as a right-hand title block.
        # A short unpunctuated part (無題 · 臨江仙, 滿庭芳 · 遙思楚潭)
        # shares the tune name's column; any other part is a preface.
        columns: list[tuple[str, str]] = []
        for n, part in enumerate(self.annotated_title(tid)):
            clauses = [c for c in re.split(r"(?<=[，。])", part) if c]
            if (n and len(clauses) == 1 and columns[-1][0] == "kanbun-title"
                    and han_count(columns[-1][1] + part) <= TITLE_COLUMN):
                columns[-1] = ("kanbun-title", columns[-1][1] + "·" + part)
            else:
                columns.append(("kanbun-title" + (" kanbun-preface" if n else ""), part))
        heading = ('<div class="kanbun-heading" data-kanbun-heading>'
                   + "".join(f'<p class="{kind}">{esc(text)}</p>' for kind, text in columns)
                   + '</div>')
        stanzas = []
        for stanza in self.annotated(tid).split("\n\n"):
            lines = "".join(
                f"<p>{esc(line)}</p>" for line in stanza.splitlines()
                if line.strip()
            )
            if lines:
                stanzas.append(f'<div class="kanbun-stanza" data-kanbun-stanza>{lines}</div>')
        paragraphs = heading + '<div class="kanbun-body">' + "".join(stanzas) + '</div>'
        source_json = json.dumps(
            {"tid": tid, "body": source, "sha256": self.texts[tid]["source_body_sha256"]},
            ensure_ascii=False, separators=(",", ":"),
        ).replace("<", "\\u003c")
        return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>漢文訓点 · {esc(tid)}</title>
<link rel="stylesheet" href="{self.asset('kanbun-render.css')}">
<link rel="stylesheet" href="{self.asset('viewer.css')}">
<script defer src="{self.asset('kanbun-render.js')}"></script>
<script defer src="{self.asset('viewer.js')}"></script>
</head>
<body data-kanbun-text="{esc(tid)}">
<main class="kanbun" id="kanbun-display" aria-hidden="true">
{paragraphs}
</main>
<script type="application/json" id="canonical-kanbun-data">{source_json}</script>
<noscript><p>{esc(source)}</p></noscript>
</body>
</html>
"""

    def build(self, *, check: bool = False) -> list[Path]:
        target = self.library.root / BASE
        for required in SOURCE_FILES:
            if not (target / required).is_file():
                raise ValueError("Kanbun viewer asset missing: " + required)
        expected = {tid + '.html' for tid in self.texts}
        existing = {page.name for page in (target / 'works').glob('*.html')}
        obsolete = sorted(existing - expected)
        if obsolete:
            raise ValueError('Orphaned kanbun viewer pages require review: ' + ', '.join(obsolete))
        changed = []
        for tid in self.texts:
            dest = target / "works" / (tid + ".html")
            output = self.page(tid)
            if not dest.is_file() or dest.read_text(encoding="utf-8") != output:
                changed.append(dest)
                if not check:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_text(output, encoding="utf-8")
        return changed
