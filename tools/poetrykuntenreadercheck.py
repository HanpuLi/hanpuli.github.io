"""Verify that all public Japanese kanbun notes use the edited reader text.

The human-facing glossary is intentionally independent of the internal
philological audit. Its exact contents must appear on the generated page;
developer notes, legal disclaimers and unresolved scratchpad data must
not be silently promoted into reader copy.
"""
from __future__ import annotations

import html
import re
from pathlib import Path

from poetry_kunten import Kunten
from poetry_library import Library


def main() -> None:
    repo = Path(__file__).resolve().parent.parent
    lib = Library(repo)
    kunten = Kunten(lib)
    assert len(kunten.texts) == 29
    count = 0
    for tid, expected in kunten.reader_notes.items():
        route = lib.work_for_text(tid)["route"]
        page = repo / "ja" / "poetry" / route / "index.html"
        assert page.is_file(), str(page)
        text = page.read_text(encoding="utf-8")
        pattern = (
            r'<details class="poetry-kunten-notes" lang="ja" '
            r'data-poetry-kunten-notes="' + re.escape(tid) + r'">'
            r'([\s\S]*?)</details>'
        )
        results = re.findall(pattern, text)
        if len(results) != 1:
            raise ValueError(f"{tid}: expected exactly one reader-note disclosure, found {len(results)}")
        found = [html.unescape(s) for s in re.findall(r"<li>(.*?)</li>", results[0], re.S)]
        if found != expected:
            raise ValueError(f"{tid}: stale or incorrect reader-facing notes: {found!r} != {expected!r}")
        # The original Chinese text is untouched even when a Japanese
        # reading and note are present. The original SHA is checked by
        # Kunten itself; here verify the specific source excerpt is emitted.
        excerpt = html.escape(lib.edition(tid, "zh")["body"], quote=True)
        article = re.search(
            r'<article class="poem reader-poem"[^>]*data-poetry-text="' +
            re.escape(tid) + r'"[\s\S]*?</article>', text
        )
        if not article or excerpt not in article.group(0):
            raise ValueError(tid + ": original Chinese source missing or altered on reader page")
        count += 1
    print("poetrykuntenreadercheck:", count, "Japanese reader-note disclosures exactly match "
          "their independently edited glosses; original Chinese sources intact")


if __name__ == "__main__":
    main()
