"""Reviewed kanbun marks and standalone, independently licensed visual readers.

The canonical Chinese text stays in the portfolio document. This builds an
isolated HTML presentation with the unmodified AGPL kanbunHTML renderer.
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

KANA = re.compile(r"^[\u3040-\u309f\u30a0-\u30ffー]+$")
RETURNS = set("レ一二三四五六七八九十上下甲乙丙丁天地人") | {
    character + "レ" for character in "一二三四五六七八九十上下甲乙丙丁天地人"
}
MARKUP_CHARS = set("(){}[]‹›«»⦉⦊⌊⌋‘’“”")
BASE = Path("assets/kanbun-viewer")
SOURCE_FILES = ("vendor/kanbun.js", "vendor/kanbun.css", "LICENSE-AGPL-3.0")


def esc(value: str) -> str:
    return html.escape(value, quote=True)


class Kunten:
    def __init__(self, library: Library):
        self.library = library
        self.data = read(library.content / "poetry/kunten.json")
        if self.data.get("schema") != 1 or self.data.get("language") != "ja":
            raise ValueError("Unsupported kunten schema")
        self.texts: dict[str, Any] = self.data["texts"]
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
            if set(entry) - {"source_body_sha256", "status", "marks", "notes"}:
                raise ValueError("Unexpected kanbun metadata: " + tid)
            prev = -1
            for mark in entry["marks"]:
                i = mark["position"]
                if type(i) is not int or i <= prev or i >= len(source):
                    raise ValueError("Non-unique or unordered kanbun position: " + tid)
                prev = i
                if mark["char"] != source[i] or source[i].isspace() or source[i] in "。，、！？；：":
                    raise ValueError("Kanbun mark detached from Chinese character: " + tid)
                if set(mark) - {"position", "char", "furigana", "okurigana", "kaeriten"}:
                    raise ValueError("Unknown kanbun mark type: " + tid)
                if not any(k in mark for k in ("furigana", "okurigana", "kaeriten")):
                    raise ValueError("Empty mark: " + tid)
                for field in ("furigana", "okurigana"):
                    if field in mark and not KANA.fullmatch(mark[field]):
                        raise ValueError("Malformed kana in " + tid)
                if "kaeriten" in mark and mark["kaeriten"] not in RETURNS:
                    raise ValueError("Unsupported return mark in " + tid)

    def annotated(self, tid: str) -> str:
        source = self.library.edition(tid, "zh")["body"]
        marks = {m["position"]: m for m in self.texts[tid]["marks"]}
        result = []
        for i, char in enumerate(source):
            result.append(char)
            mark = marks.get(i)
            if mark is None:
                continue
            if mark.get("furigana"):
                result.append("(" + mark["furigana"] + ")")
            if mark.get("okurigana"):
                result.append("{" + mark["okurigana"] + "}")
            if mark.get("kaeriten"):
                result.append("[" + mark["kaeriten"] + "]")
        return "".join(result)

    def href(self, tid: str) -> str:
        if tid not in self.texts:
            raise ValueError("Unreviewed kanbun text: " + tid)
        return f"/assets/kanbun-viewer/works/{tid}.html"

    def page(self, tid: str) -> str:
        source = self.library.edition(tid, "zh")["body"]
        # Upstream convertKanbunDiv converts each direct child paragraph and
        # expects an HTML-escaped annotated string, not already-rendered HTML.
        # Preserve original line and stanza boundaries for the established
        # vertical typesetter; it handles each stanza's immediate paragraphs.
        stanzas = []
        for stanza in self.annotated(tid).split("\n\n"):
            lines = "".join(
                f"<p>{esc(line)}</p>" for line in stanza.splitlines()
                if line.strip()
            )
            if lines:
                stanzas.append(f'<div class="kanbun-stanza" data-kanbun-stanza>{lines}</div>')
        paragraphs = "".join(stanzas)
        source_json = json.dumps(
            {"tid": tid, "body": source, "sha256": self.texts[tid]["source_body_sha256"]},
            ensure_ascii=False, separators=(",", ":"),
        ).replace("<", "\\u003c")
        return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>漢文訓点 · {esc(tid)}</title>
<link rel="stylesheet" href="../vendor/kanbun.css">
<link rel="stylesheet" href="../viewer.css">
<script defer src="../vendor/kanbun.js"></script>
<script defer src="../viewer.js"></script>
</head>
<body data-kanbun-text="{esc(tid)}">
<main class="kanbun betagumi okurigana-sinking split-touching-kana" id="kanbun-display" aria-hidden="true">
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
                raise ValueError("Kanbun viewer vendor asset missing: " + required)
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
