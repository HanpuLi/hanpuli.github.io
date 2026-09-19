#!/usr/bin/env python3
"""Static integrity checks for the portfolio site.

Uses only the Python standard library so the same command runs locally and in
GitHub Actions. It deliberately checks repository-local references only; remote
links are not fetched.
"""
from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = sorted(
    p for p in ROOT.rglob("*.html")
    if ".git" not in p.parts
    and "templates" not in p.parts
    and p.name != "card.html"
)
SKIP_SCHEMES = {"http", "https", "mailto", "tel", "data", "javascript"}


class Document(HTMLParser):
    def __init__(self, path: Path) -> None:
        super().__init__(convert_charrefs=True)
        self.path = path
        self.ids: list[str] = []
        self.refs: list[tuple[str, str, int]] = []
        self.errors: list[str] = []
        self.has_title = False
        self.has_viewport = False
        self.html_lang: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {k.lower(): v for k, v in attrs}
        line, _ = self.getpos()
        if tag == "html":
            self.html_lang = values.get("lang")
        if tag == "meta" and values.get("name", "").lower() == "viewport":
            self.has_viewport = True
        if tag == "img" and not values.get("alt"):
            self.errors.append(f"{self.path.relative_to(ROOT)}:{line}: image missing non-empty alt text")
        ident = values.get("id")
        if ident:
            self.ids.append(ident)
        for key in ("href", "src"):
            value = values.get(key)
            if value:
                self.refs.append((key, value, line))
        for key in ("srcset", "imagesrcset"):
            value = values.get(key)
            if not value:
                continue
            for candidate in value.split(","):
                ref = candidate.strip().split(maxsplit=1)[0]
                if ref:
                    self.refs.append((key, ref, line))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_data(self, data: str) -> None:
        if getattr(self, "_in_title", False) and data.strip():
            self.has_title = True

    def handle_starttag_with_title(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        pass

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def unknown_decl(self, data: str) -> None:
        pass

    def handle_decl(self, decl: str) -> None:
        pass

    def feed(self, data: str) -> None:
        self._in_title = False
        # HTMLParser does not expose title contents specially, so track title tags
        # while preserving its ordinary parsing behavior.
        original = self.handle_starttag
        def wrapped(tag: str, attrs: list[tuple[str, str | None]]) -> None:
            if tag == "title":
                self._in_title = True
            original(tag, attrs)
        self.handle_starttag = wrapped  # type: ignore[method-assign]
        try:
            super().feed(data)
        finally:
            self.handle_starttag = original  # type: ignore[method-assign]


def local_target(source: Path, ref: str) -> tuple[Path, str] | None:
    parsed = urlsplit(ref)
    if parsed.scheme.lower() in SKIP_SCHEMES or parsed.netloc:
        return None
    raw_path = unquote(parsed.path)
    if not raw_path:
        return source, unquote(parsed.fragment)
    if raw_path.startswith("/"):
        target = ROOT / raw_path.lstrip("/")
    else:
        target = source.parent / raw_path
    if raw_path.endswith("/"):
        target = target / "index.html"
    return target.resolve(), unquote(parsed.fragment)


def check_css(errors: list[str]) -> None:
    url_re = re.compile(r"url\((['\"]?)([^)'\"]+)\1\)")
    for css in ROOT.rglob("*.css"):
        text = css.read_text(encoding="utf-8")
        for match in url_re.finditer(text):
            ref = match.group(2).strip()
            parsed = urlsplit(ref)
            if parsed.scheme or parsed.netloc or ref.startswith("data:"):
                continue
            target = (css.parent / unquote(parsed.path)).resolve()
            if not target.exists():
                line = text.count("\n", 0, match.start()) + 1
                errors.append(f"{css.relative_to(ROOT)}:{line}: missing CSS asset {ref!r}")


def main() -> int:
    errors: list[str] = []
    docs: dict[Path, Document] = {}
    for path in HTML_FILES:
        doc = Document(path)
        try:
            doc.feed(path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"{path.relative_to(ROOT)}: parse error: {exc}")
            continue
        docs[path.resolve()] = doc
        errors.extend(doc.errors)
        if not doc.html_lang:
            errors.append(f"{path.relative_to(ROOT)}: missing html lang")
        if not doc.has_title:
            errors.append(f"{path.relative_to(ROOT)}: missing non-empty title")
        if not doc.has_viewport:
            errors.append(f"{path.relative_to(ROOT)}: missing viewport meta")
        duplicates = sorted({x for x in doc.ids if doc.ids.count(x) > 1})
        for ident in duplicates:
            errors.append(f"{path.relative_to(ROOT)}: duplicate id {ident!r}")

    for source, doc in docs.items():
        for _kind, ref, line in doc.refs:
            target_info = local_target(source, ref)
            if target_info is None:
                continue
            target, fragment = target_info
            # Query-only links point at the current document.
            if not urlsplit(ref).path:
                target = source
            if not target.exists():
                errors.append(f"{source.relative_to(ROOT)}:{line}: missing local target {ref!r}")
                continue
            if target.is_dir():
                target = target / "index.html"
            if fragment and target.suffix.lower() == ".html":
                target_doc = docs.get(target.resolve())
                if target_doc is None:
                    errors.append(f"{source.relative_to(ROOT)}:{line}: cannot inspect fragment target {ref!r}")
                elif fragment not in target_doc.ids:
                    errors.append(f"{source.relative_to(ROOT)}:{line}: missing fragment {ref!r}")

    check_css(errors)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"sitecheck: {len(HTML_FILES)} HTML documents, local refs, fragments, images and CSS assets OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
