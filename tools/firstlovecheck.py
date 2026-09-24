#!/usr/bin/env python3
"""Check the public First Love landing pages and legacy-link redirects."""
from __future__ import annotations

import json
import html
import sys
from html.parser import HTMLParser
from pathlib import Path

from first_love_public_pages import RETIRED_READER_URL, path_for

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = json.loads((ROOT / "content/languages.json").read_text(encoding="utf-8"))


class Outline(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.h1 = 0
        self.main = 0
        self.forms = 0
        self.links: list[str] = []
        self.scripts: list[str] = []
        self.robots = ""
        self.csp = ""

    def handle_starttag(self, tag: str, attrs_raw: list[tuple[str, str | None]]) -> None:
        attrs = dict(attrs_raw)
        if tag == "h1":
            self.h1 += 1
        if tag == "main" and attrs.get("id") == "main":
            self.main += 1
        if tag == "form":
            self.forms += 1
        if tag == "a" and attrs.get("href"):
            self.links.append(str(attrs["href"]))
        if tag == "script" and attrs.get("src"):
            self.scripts.append(str(attrs["src"]))
        if tag == "meta" and attrs.get("name") == "robots":
            self.robots = str(attrs.get("content") or "")
        if tag == "meta" and attrs.get("http-equiv") == "Content-Security-Policy":
            self.csp = str(attrs.get("content") or "")


def route(locale_id: str, page: str) -> Path:
    prefix = ROOT if locale_id == "en" else ROOT / locale_id
    base = prefix / "writing" / "first-love"
    return base / "index.html" if page == "request" else base / page / "index.html"


def main() -> int:
    errors: list[str] = []
    pages = [(item["id"], page, route(item["id"], page)) for item in LANGUAGES for page in ("request", "status", "read")]
    for locale_id, page, path in pages:
        if not path.is_file():
            errors.append(f"missing generated page: {path.relative_to(ROOT)}")
            continue
        source = path.read_text(encoding="utf-8")
        parser = Outline()
        parser.feed(source)
        rel = path.relative_to(ROOT)
        if parser.h1 != 1 or parser.main != 1:
            errors.append(f"{rel}: expected one h1 and one main landmark")
        if parser.forms:
            errors.append(f"{rel}: access request form remains")
        if RETIRED_READER_URL in source:
            errors.append(f"{rel}: retired full-reader link remains")
        if parser.scripts != ["/assets/accessibility.js"]:
            errors.append(f"{rel}: unexpected scripts {parser.scripts}")
        if "connect-src 'none'" not in parser.csp or "form-action 'none'" not in parser.csp:
            errors.append(f"{rel}: public landing page CSP is too broad")
        if page == "request":
            if "noindex" in parser.robots:
                errors.append(f"{rel}: public overview is unexpectedly noindex")
            copy = json.loads((ROOT / "content/first-love-public.json").read_text(encoding="utf-8"))[locale_id]
            if html.escape(copy["abstract"]) not in source:
                errors.append(f"{rel}: abstract missing")
        elif not {"noindex", "noarchive", "nosnippet"} <= set(parser.robots.split(",")):
            errors.append(f"{rel}: legacy route robots directive is incomplete")
        elif parser.links.count(path_for(locale_id, "request")) != 1:
            errors.append(f"{rel}: expected one abstract link")
        for marker in ("first-love-api", "v1/document", "Bearer ", "data-preserve-fragment"):
            if marker in source:
                errors.append(f"{rel}: old controlled-access marker {marker!r}")

    for item in LANGUAGES:
        lid = item["id"]
        homepage = ROOT / ("index.html" if lid == "en" else f"{lid}/index.html")
        source = homepage.read_text(encoding="utf-8")
        if path_for(lid, "request") not in source:
            errors.append(f"{homepage.relative_to(ROOT)}: missing abstract link")
        if RETIRED_READER_URL in source:
            errors.append(f"{homepage.relative_to(ROOT)}: retired full-reader link remains")
        if "first-love-api" in source:
            errors.append(f"{homepage.relative_to(ROOT)}: old API reference remains")

    for old in ("assets/first-love-access.js", "tools/first_love_pages.py", "content/first-love-access.json"):
        if (ROOT / old).exists():
            errors.append(f"obsolete controlled-access file remains: {old}")
    for pattern in ("*.pdf", "page-*.json", "page-*.png", "manifest.json"):
        for path in (ROOT / "writing" / "first-love").rglob(pattern):
            errors.append(f"private manuscript file in public tree: {path.relative_to(ROOT)}")

    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    for item in LANGUAGES:
        lid = item["id"]
        prefix = "" if lid == "en" else f"/{lid}"
        public_url = f"https://hanpuli.github.io{prefix}/writing/first-love/"
        if public_url not in sitemap:
            errors.append(f"sitemap missing {public_url}")
        for private in ("status", "read"):
            private_url = public_url + private + "/"
            if private_url in sitemap:
                errors.append(f"legacy page appears in sitemap: {private_url}")

    copy = json.loads((ROOT / "content/first-love-public.json").read_text(encoding="utf-8"))
    expected = {item["id"] for item in LANGUAGES}
    if set(copy) != expected:
        errors.append("First Love copy locale set does not match languages.json")
    elif copy:
        schema = set(copy["en"])
        for locale_id, values in copy.items():
            if set(values) != schema:
                errors.append(f"First Love copy schema mismatch for {locale_id}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"firstlovecheck: {len(pages)} public/legacy pages, abstract links, CSP, sitemap and public-file boundary OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
