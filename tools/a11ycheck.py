#!/usr/bin/env python3
"""Accessibility regression checks for the site's HTML pages.

This is deliberately dependency-free. It catches structural regressions that
static HTML can prove; browser-level layout, contrast, keyboard and reflow are
covered by manual browser QA.
"""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = json.loads((ROOT / "content" / "languages.json").read_text(encoding="utf-8"))
LOCALES = tuple("" if item["id"] == "en" else item["id"] for item in LANGUAGES)
PAGES = ("index.html", "ci.html", "shi.html", "404.html")
READING_PREFS = {"sans", "large", "spacing", "measure", "simple", "motion", "contrast"}


def portfolio_paths() -> list[Path]:
    return [
        ROOT / locale / page if locale else ROOT / page
        for locale in LOCALES
        for page in PAGES
    ]


def essay_paths() -> list[Path]:
    return [
        ROOT / locale / "writing" / "trainspotting" / "index.html"
        if locale
        else ROOT / "writing" / "trainspotting" / "index.html"
        for locale in LOCALES
    ]


def page_paths() -> list[Path]:
    return [
        *portfolio_paths(),
        *essay_paths(),
        ROOT / "mail-assistant" / "index.html",
        ROOT / "mail-assistant" / "privacy.html",
        ROOT / "mail-assistant" / "terms.html",
        ROOT / "fridge" / "index.html",
    ]


class AuditParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: set[str] = set()
        self.main_count = 0
        self.h1_count = 0
        self.headings: list[tuple[int, int]] = []
        self.links: list[dict[str, object]] = []
        self.buttons: list[dict[str, object]] = []
        self.inputs: list[tuple[dict[str, str | None], int, bool]] = []
        self.positive_tabindex: list[int] = []
        self.accesskeys: list[int] = []
        self.autoplay: list[int] = []
        self.target_blank: list[int] = []
        self.details_count = 0
        self.summary_count = 0
        self.reading_tools_count = 0
        self.reading_reset_count = 0
        self.reading_prefs: list[str] = []
        self.skip_hrefs: list[tuple[str, int]] = []
        self._capture: list[dict[str, object]] = []
        self._label_depth = 0

    def handle_starttag(self, tag: str, attrs_raw: list[tuple[str, str | None]]) -> None:
        attrs = {k.lower(): v for k, v in attrs_raw}
        line, _ = self.getpos()
        ident = attrs.get("id")
        if ident:
            self.ids.add(ident)

        tabindex = attrs.get("tabindex")
        if tabindex is not None:
            try:
                if int(tabindex) > 0:
                    self.positive_tabindex.append(line)
            except ValueError:
                self.positive_tabindex.append(line)
        if attrs.get("accesskey"):
            self.accesskeys.append(line)
        if "autoplay" in attrs:
            self.autoplay.append(line)
        if tag == "a" and (attrs.get("target") or "").lower() == "_blank":
            self.target_blank.append(line)

        if tag == "main":
            self.main_count += 1
        if re.fullmatch(r"h[1-6]", tag):
            level = int(tag[1])
            self.headings.append((level, line))
            if level == 1:
                self.h1_count += 1

        if tag == "details":
            self.details_count += 1
        if tag == "summary":
            self.summary_count += 1

        classes = set((attrs.get("class") or "").split())
        if "reading-tools" in classes:
            self.reading_tools_count += 1
        if "data-reading-reset" in attrs:
            self.reading_reset_count += 1
        pref = attrs.get("data-reading-pref")
        if pref:
            self.reading_prefs.append(pref)

        if tag == "label":
            self._label_depth += 1

        if tag in {"a", "button"}:
            item: dict[str, object] = {
                "tag": tag,
                "line": line,
                "text": "",
                "aria_label": attrs.get("aria-label") or "",
                "title": attrs.get("title") or "",
                "href": attrs.get("href") or "",
            }
            self._capture.append(item)
            (self.links if tag == "a" else self.buttons).append(item)
            if tag == "a" and "skip-link" in classes:
                self.skip_hrefs.append((str(item["href"]), line))

        if tag == "input":
            self.inputs.append((attrs, line, self._label_depth > 0))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag == "label" and self._label_depth:
            self._label_depth -= 1
        if tag in {"a", "button"}:
            for idx in range(len(self._capture) - 1, -1, -1):
                if self._capture[idx]["tag"] == tag:
                    self._capture.pop(idx)
                    break

    def handle_data(self, data: str) -> None:
        if not data:
            return
        for item in self._capture:
            item["text"] = str(item["text"]) + data


def audit(path: Path) -> list[str]:
    rel = path.relative_to(ROOT)
    require_reading_tools = rel.parts[0] != "fridge"
    text = path.read_text(encoding="utf-8")
    parser = AuditParser()
    parser.feed(text)
    errors: list[str] = []

    if parser.main_count != 1:
        errors.append(f"{rel}: expected exactly one main landmark, got {parser.main_count}")
    if parser.h1_count != 1:
        errors.append(f"{rel}: expected exactly one h1, got {parser.h1_count}")

    if 'class="page-topbar"' in text and not re.search(
        r'<header\b[^>]*\bclass=["\'][^"\']*\bpage-topbar\b[^"\']*["\']',
        text,
        re.I,
    ):
        errors.append(f"{rel}: page topbar must be the page banner landmark")

    if 'class="page-intro"' in text:
        intro_pos = text.find('class="page-intro"')
        main_start = text.rfind("<main", 0, intro_pos)
        main_end = text.find("</main>", intro_pos)
        if main_start < 0 or main_end < 0:
            errors.append(f"{rel}: page intro must sit inside the main landmark")

    previous = 0
    for level, line in parser.headings:
        if previous and level > previous + 1:
            errors.append(f"{rel}:{line}: heading jumps from h{previous} to h{level}")
        previous = level

    for item in [*parser.links, *parser.buttons]:
        name = (str(item["aria_label"]) or str(item["text"]) or str(item["title"])).strip()
        if not name:
            errors.append(f"{rel}:{item['line']}: empty accessible name on <{item['tag']}>")

    for attrs, line, nested_in_label in parser.inputs:
        input_type = (attrs.get("type") or "text").lower()
        if input_type in {"hidden", "submit", "reset", "button", "image"}:
            continue
        labelled = nested_in_label or bool(attrs.get("aria-label")) or bool(attrs.get("aria-labelledby"))
        if not labelled and attrs.get("id"):
            input_id = re.escape(str(attrs["id"]))
            labelled = bool(re.search(rf'<label\b[^>]*\bfor=["\']{input_id}["\']', text, re.I))
        if not labelled:
            errors.append(f"{rel}:{line}: form control is not labelled")

    for href, line in parser.skip_hrefs:
        parsed = urlsplit(href)
        if parsed.path:
            continue
        fragment = parsed.fragment
        if not fragment or fragment not in parser.ids:
            errors.append(f"{rel}:{line}: skip link target {href!r} does not exist")

    if parser.positive_tabindex:
        errors.append(f"{rel}: positive tabindex at lines {parser.positive_tabindex}")
    if parser.accesskeys:
        errors.append(f"{rel}: accesskey used at lines {parser.accesskeys}")
    if parser.autoplay:
        errors.append(f"{rel}: autoplay used at lines {parser.autoplay}")
    if parser.target_blank:
        errors.append(f"{rel}: links force a new browsing context at lines {parser.target_blank}")

    for table_no, table in enumerate(re.findall(r"<table\b.*?</table>", text, re.I | re.S), 1):
        if not re.search(r"<caption\b", table, re.I):
            errors.append(f"{rel}: table {table_no} has no caption")
        for th in re.finditer(r"<th\b([^>]*)>", table, re.I):
            if not re.search(r"\bscope\s*=", th.group(1), re.I):
                errors.append(f"{rel}: table {table_no} has a header cell without scope")

    if require_reading_tools:
        if parser.reading_tools_count != 1:
            errors.append(f"{rel}: expected one reading preferences region, got {parser.reading_tools_count}")
        if parser.details_count < 1 or parser.summary_count < 1:
            errors.append(f"{rel}: reading preferences must use native details/summary disclosure")
        if set(parser.reading_prefs) != READING_PREFS or len(parser.reading_prefs) != len(READING_PREFS):
            errors.append(
                f"{rel}: reading preference controls mismatch: "
                f"{sorted(parser.reading_prefs)}"
            )
        if parser.reading_reset_count != 1:
            errors.append(f"{rel}: expected one reading reset control, got {parser.reading_reset_count}")

    if 'class="current"' in text and 'class="visually-hidden"' not in text:
        errors.append(f"{rel}: current language has no full-name visually-hidden label")
    for match in re.finditer(r'<a\b[^>]*\bhreflang=', text, re.I):
        tag_end = text.find(">", match.start())
        tag = text[match.start(): tag_end + 1]
        if "aria-label=" not in tag:
            line = text.count("\n", 0, match.start()) + 1
            errors.append(f"{rel}:{line}: language link missing full-name aria-label")

    return errors


def main() -> int:
    errors: list[str] = []
    for path in page_paths():
        if not path.exists():
            errors.append(f"missing generated page: {path.relative_to(ROOT)}")
            continue
        errors.extend(audit(path))

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"a11ycheck: {len(page_paths())} site pages pass structural accessibility checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
