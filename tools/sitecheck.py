#!/usr/bin/env python3
"""Static integrity checks for the portfolio site.

Uses only the Python standard library so the same command runs locally and in
GitHub Actions. It deliberately checks repository-local references only; remote
links are not fetched.
"""
from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = sorted(
    p for p in ROOT.rglob("*.html")
    if ".git" not in p.parts
    and "node_modules" not in p.parts
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


def check_raw_ampersands(path: Path, text: str, errors: list[str]) -> None:
    """Reject unescaped ampersands in HTML markup/text, excluding script/style data."""
    inspectable = re.sub(
        r"<(?:script|style)\b.*?</(?:script|style)>",
        "",
        text,
        flags=re.I | re.S,
    )
    for match in re.finditer(r"&(?!#\d+;|#x[0-9a-f]+;|[a-z][a-z0-9]+;)", inspectable, re.I):
        line = inspectable.count("\n", 0, match.start()) + 1
        errors.append(f"{path.relative_to(ROOT)}:{line}: raw ampersand must be encoded as &amp;")


def check_json_ld(path: Path, text: str, errors: list[str]) -> None:
    for match in re.finditer(
        r'<script\s+type="application/ld\+json"[^>]*>\s*(.*?)\s*</script>',
        text,
        flags=re.I | re.S,
    ):
        try:
            json.loads(match.group(1))
        except json.JSONDecodeError as exc:
            line = text.count("\n", 0, match.start(1)) + exc.lineno
            errors.append(
                f"{path.relative_to(ROOT)}:{line}: invalid JSON-LD: {exc.msg}"
            )


def check_css(errors: list[str]) -> None:
    url_re = re.compile(r"url\((['\"]?)([^)'\"]+)\1\)")
    for css in ROOT.rglob("*.css"):
        if "node_modules" in css.parts:
            continue
        text = css.read_text(encoding="utf-8")
        for match in url_re.finditer(text):
            ref = match.group(2).strip()
            parsed = urlsplit(ref)
            if parsed.scheme or parsed.netloc or ref.startswith("data:"):
                continue
            target = ((ROOT / unquote(parsed.path).lstrip('/')) if parsed.path.startswith('/')
                      else (css.parent / unquote(parsed.path))).resolve()
            if not target.exists():
                line = text.count("\n", 0, match.start()) + 1
                errors.append(f"{css.relative_to(ROOT)}:{line}: missing CSS asset {ref!r}")


def check_discovery(errors: list[str]) -> None:
    """Keep indexable routes, search metadata, robots.txt and sitemap.xml aligned."""
    languages = json.loads((ROOT / "content" / "languages.json").read_text(encoding="utf-8"))
    identity = json.loads((ROOT / "content" / "identity.json").read_text(encoding="utf-8"))
    base_url = identity["site_url"].rstrip("/")

    def standard_url(locale_id: str, page: str) -> str:
        prefix = "" if locale_id == "en" else f"/{locale_id}"
        if page == "index":
            return base_url + ("/" if not prefix else f"{prefix}/")
        if page == "poetry-voucher":
            return f"{base_url}{prefix}/poetry-voucher/"
        return f"{base_url}{prefix}/{page}.html"

    def essay_url(locale_id: str) -> str:
        prefix = "" if locale_id == "en" else f"/{locale_id}"
        return f"{base_url}{prefix}/writing/trainspotting/"

    def first_love_url(locale_id: str) -> str:
        prefix = "" if locale_id == "en" else f"/{locale_id}"
        return f"{base_url}{prefix}/writing/first-love/"

    families: list[dict[str, str]] = []
    for page in ("index", "ci", "shi", "about", "contexts", "poetry-voucher"):
        families.append({language["id"]: standard_url(language["id"], page) for language in languages})
    families.append({language["id"]: essay_url(language["id"]) for language in languages})
    families.append({language["id"]: first_love_url(language["id"]) for language in languages})

    expected_alternates: dict[str, dict[str, str]] = {}
    for family in families:
        alternates = {
            language["html_lang"]: family[language["id"]]
            for language in languages
        }
        alternates["x-default"] = family["en"]
        for location in family.values():
            expected_alternates[location] = alternates

    expected = set(expected_alternates)
    sitemap = ROOT / "sitemap.xml"
    try:
        tree = ET.parse(sitemap)
    except (ET.ParseError, OSError) as exc:
        errors.append(f"sitemap.xml: cannot parse sitemap: {exc}")
        return

    namespace = {
        "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
        "xhtml": "http://www.w3.org/1999/xhtml",
    }
    url_nodes = tree.findall("sm:url", namespace)
    locations: list[str] = []
    for url_node in url_nodes:
        loc_node = url_node.find("sm:loc", namespace)
        location = (loc_node.text or "").strip() if loc_node is not None else ""
        if not location:
            errors.append("sitemap.xml: url entry missing non-empty loc")
            continue
        locations.append(location)

        links = url_node.findall("xhtml:link", namespace)
        pairs = [
            (link.attrib.get("hreflang", ""), link.attrib.get("href", ""))
            for link in links
            if link.attrib.get("rel") == "alternate"
        ]
        hreflangs = [lang for lang, _href in pairs]
        duplicates = sorted({lang for lang in hreflangs if hreflangs.count(lang) > 1})
        for hreflang in duplicates:
            errors.append(
                f"sitemap.xml: {location!r} has duplicate hreflang {hreflang!r}"
            )

        expected_for_url = expected_alternates.get(location)
        if expected_for_url is not None:
            actual_for_url = dict(pairs)
            if actual_for_url != expected_for_url:
                errors.append(
                    f"sitemap.xml: hreflang set for {location!r} does not match "
                    "the complete reciprocal locale family"
                )

    duplicates = sorted({url for url in locations if locations.count(url) > 1})
    for url in duplicates:
        errors.append(f"sitemap.xml: duplicate URL {url!r}")

    actual = set(locations)
    for url in sorted(expected - actual):
        errors.append(f"sitemap.xml: missing generated portfolio URL {url!r}")
    for url in sorted(actual - expected):
        errors.append(f"sitemap.xml: unexpected URL {url!r}")

    def local_file(url: str) -> Path:
        path = unquote(urlsplit(url).path)
        relative = path.lstrip("/")
        if not relative or path.endswith("/"):
            return ROOT / relative / "index.html"
        return ROOT / relative

    for location in sorted(expected & actual):
        target = local_file(location)
        if not target.is_file():
            errors.append(f"sitemap.xml: {location!r} maps to missing {target.relative_to(ROOT)}")
            continue
        source = target.read_text(encoding="utf-8")
        rel = target.relative_to(ROOT)

        canonicals = re.findall(
            r'<link\s+rel="canonical"\s+href="([^"]+)"',
            source,
            flags=re.I,
        )
        if canonicals != [location]:
            errors.append(
                f"{rel}: canonical must be exactly {location!r}, got {canonicals!r}"
            )
        robots_matches = re.findall(
            r'<meta\s+name="robots"\s+content="([^"]*)"',
            source,
            flags=re.I,
        )
        if any("noindex" in value.lower() for value in robots_matches):
            errors.append(f"{rel}: sitemap URL is marked noindex")

        description = re.search(
            r'<meta\s+name="description"\s+content="([^"]+)"',
            source,
            flags=re.I,
        )
        if not description:
            errors.append(f"{rel}: sitemap URL missing meta description")

        required_markers = (
            'property="og:title"',
            'property="og:description"',
            'property="og:image"',
            f'property="og:url" content="{location}"',
            'name="twitter:card" content="summary_large_image"',
            'name="twitter:title"',
            'name="twitter:description"',
            'name="twitter:image"',
            '<script type="application/ld+json">',
        )
        for marker in required_markers:
            if marker not in source:
                errors.append(f"{rel}: indexable page missing SEO marker {marker!r}")

        html_alternates = dict(re.findall(
            r'<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"',
            source,
            flags=re.I,
        ))
        if html_alternates != expected_alternates[location]:
            errors.append(
                f"{rel}: HTML hreflang set does not match sitemap locale family"
            )

    robots = ROOT / "robots.txt"
    try:
        robots_text = robots.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"robots.txt: cannot read file: {exc}")
        return
    expected_sitemap_line = f"Sitemap: {base_url}/sitemap.xml"
    if expected_sitemap_line not in robots_text.splitlines():
        errors.append(
            f"robots.txt: expected exact discovery line {expected_sitemap_line!r}"
        )


def main() -> int:
    errors: list[str] = []
    docs: dict[Path, Document] = {}
    for path in HTML_FILES:
        doc = Document(path)
        text = path.read_text(encoding="utf-8")
        check_raw_ampersands(path, text, errors)
        check_json_ld(path, text, errors)
        try:
            doc.feed(text)
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
    check_discovery(errors)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"sitecheck: {len(HTML_FILES)} HTML documents, local refs, fragments, images, CSS assets and discovery files OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
