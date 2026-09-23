#!/usr/bin/env python3
"""Static contract checks for the First Love controlled-reading surface."""
from __future__ import annotations

import json
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_BASE = "https://donglebook-escape.tail95239f.ts.net:10000/first-love-api"
LANGUAGES = json.loads((ROOT / "content" / "languages.json").read_text(encoding="utf-8"))


class Outline(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.h1 = 0
        self.names: set[str] = set()
        self.robots = ""
        self.csp = ""
        self.has_root = False
        self.preserve_links = 0

    def handle_starttag(self, tag: str, attrs_raw: list[tuple[str, str | None]]) -> None:
        attrs = dict(attrs_raw)
        if tag == "h1":
            self.h1 += 1
        if tag in {"input", "textarea"} and attrs.get("name"):
            self.names.add(str(attrs["name"]))
        if tag == "main" and "data-first-love-access" in attrs:
            self.has_root = True
        if tag == "a" and "data-preserve-fragment" in attrs:
            self.preserve_links += 1
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
        text = path.read_text(encoding="utf-8")
        parser = Outline()
        parser.feed(text)
        rel = path.relative_to(ROOT)
        if parser.h1 != 1:
            errors.append(f"{rel}: expected one h1, found {parser.h1}")
        if not parser.has_root:
            errors.append(f"{rel}: missing data-first-love-access root")
        if API_BASE.rsplit("/", 1)[0] not in parser.csp:
            errors.append(f"{rel}: CSP does not name the exact API origin")
        if page == "request":
            required = {"name", "email", "affiliation", "reason", "company"}
            if not required <= parser.names:
                errors.append(f"{rel}: request form missing fields {sorted(required - parser.names)}")
            if "noindex" in parser.robots:
                errors.append(f"{rel}: public request page is unexpectedly noindex")
        else:
            if not {"noindex", "noarchive", "nosnippet"} <= set(parser.robots.split(",")):
                errors.append(f"{rel}: private page robots directive is incomplete")
            if parser.preserve_links < len(LANGUAGES) - 1:
                errors.append(f"{rel}: language links do not preserve the fragment")

    script = (ROOT / "assets" / "first-love-access.js").read_text(encoding="utf-8")
    required_script = [API_BASE, "location.hash", "Authorization", "Bearer ", "URL.createObjectURL", "URL.revokeObjectURL"]
    for needle in required_script:
        if needle not in script:
            errors.append(f"first-love-access.js: missing {needle!r}")
    forbidden = ["node.tail95239f.ts.net", "localStorage", "sessionStorage", "URLSearchParams", "?token", "document.cookie", "console.log"]
    for needle in forbidden:
        if needle in script:
            errors.append(f"first-love-access.js: forbidden token/storage pattern {needle!r}")

    for path in (ROOT / "writing" / "first-love").rglob("*.pdf"):
        errors.append(f"private PDF found in public tree: {path.relative_to(ROOT)}")
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
                errors.append(f"private page appears in sitemap: {private_url}")

    copy = json.loads((ROOT / "content" / "first-love-access.json").read_text(encoding="utf-8"))
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
    print(f"firstlovecheck: {len(pages)} generated pages, fragment credentials, CSP, sitemap and public-file boundary OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
