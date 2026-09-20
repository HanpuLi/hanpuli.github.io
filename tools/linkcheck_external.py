#!/usr/bin/env python3
"""Audit external links from the generated personal-site pages.

404/410 responses are hard failures. Rate limits, bot blocks, timeouts and 5xx
responses are reported as indeterminate so third-party behaviour is visible
without being mistaken for a broken editorial link.
"""
from __future__ import annotations

import os
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
LOCALES = ("", "zh", "zh-hans", "ja", "de", "fr", "ru")
USER_AGENT = "HanpuLi-site-link-audit/1.0 (+https://hanpuli.github.io/)"
TIMEOUT = 15


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        values = dict(attrs)
        href = values.get("href") or ""
        if href.startswith(("https://", "http://")):
            self.links.add(href)


def portfolio_pages() -> list[Path]:
    pages = []
    for locale in LOCALES:
        base = ROOT / locale if locale else ROOT
        pages.extend([
            base / "index.html",
            base / "ci.html",
            base / "shi.html",
            base / "about.html",
            base / "writing" / "trainspotting" / "index.html",
        ])
    return pages


def collect_links() -> dict[str, list[str]]:
    sources: dict[str, list[str]] = {}
    for page in portfolio_pages():
        parser = LinkParser()
        parser.feed(page.read_text(encoding="utf-8"))
        rel = str(page.relative_to(ROOT))
        for url in parser.links:
            sources.setdefault(url, []).append(rel)
    return sources


def request_status(url: str) -> tuple[str, str]:
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}
    try:
        req = Request(url, headers=headers, method="HEAD")
        with urlopen(req, timeout=TIMEOUT) as response:
            return "ok", str(response.status)
    except HTTPError as exc:
        if exc.code in {405, 501}:
            try:
                req = Request(url, headers={**headers, "Range": "bytes=0-0"}, method="GET")
                with urlopen(req, timeout=TIMEOUT) as response:
                    return "ok", str(response.status)
            except HTTPError as get_exc:
                exc = get_exc
            except (URLError, TimeoutError, socket.timeout) as get_exc:
                return "indeterminate", str(get_exc)
        if exc.code in {404, 410}:
            return "broken", str(exc.code)
        if exc.code in {401, 403, 408, 425, 429} or 500 <= exc.code <= 599:
            return "indeterminate", str(exc.code)
        return "broken", str(exc.code)
    except (URLError, TimeoutError, socket.timeout) as exc:
        return "indeterminate", str(exc)


def write_summary(rows: list[tuple[str, str, str, list[str]]]) -> None:
    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if not target:
        return
    broken = [row for row in rows if row[0] == "broken"]
    uncertain = [row for row in rows if row[0] == "indeterminate"]
    lines = [
        "## External link audit",
        "",
        f"- checked: {len(rows)}",
        f"- broken (404/410 or other hard HTTP error): {len(broken)}",
        f"- indeterminate (rate limit, bot block, timeout or 5xx): {len(uncertain)}",
        "",
    ]
    for title, subset in (("Broken", broken), ("Indeterminate", uncertain)):
        if not subset:
            continue
        lines.extend([f"### {title}", ""])
        for _, detail, url, pages in subset:
            lines.append(f"- {detail} {url} — {', '.join(pages)}")
        lines.append("")
    with open(target, "a", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def main() -> int:
    sources = collect_links()
    rows: list[tuple[str, str, str, list[str]]] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(request_status, url): url for url in sorted(sources)}
        for future in as_completed(futures):
            url = futures[future]
            status, detail = future.result()
            rows.append((status, detail, url, sources[url]))

    rows.sort(key=lambda row: (row[0], row[2]))
    for status, detail, url, pages in rows:
        if status != "ok":
            print(f"{status.upper():13} {detail:>8} {url} <- {', '.join(pages)}")
    broken = [row for row in rows if row[0] == "broken"]
    uncertain = [row for row in rows if row[0] == "indeterminate"]
    print(
        f"external links: {len(rows)} checked; "
        f"{len(broken)} broken; {len(uncertain)} indeterminate"
    )
    write_summary(rows)
    return 1 if broken else 0


if __name__ == "__main__":
    raise SystemExit(main())
