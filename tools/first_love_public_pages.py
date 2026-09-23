"""Generate the public First Love overview and legacy-link landing pages."""

from __future__ import annotations

import html
import json
from pathlib import Path

READER_URL = "https://node.tail95239f.ts.net:10000/first-love-reader/v/first-love-v113-2026-08-27/"
PAGES = ("request", "status", "read")
NAV_ITEMS = (("01", "writing", "writing"), ("02", "ci", "ci"), ("03", "work", "work"),
             ("04", "photo", "photo"), ("05", "shi", "shi"), ("06", "profile", "profile"))


def path_for(locale_id: str, page: str) -> str:
    base = "" if locale_id == "en" else f"/{locale_id}"
    tail = "" if page == "request" else f"{page}/"
    return f"{base}/writing/first-love/{tail}"


def _home(locale_id: str) -> str:
    return "/" if locale_id == "en" else f"/{locale_id}/"


def _standard_page(locale_id: str, page: str) -> str:
    return f"/{page}.html" if locale_id == "en" else f"/{locale_id}/{page}.html"


def _language_nav(languages: list[dict], locale_id: str, page: str) -> str:
    rows = []
    for language in languages:
        lid = language["id"]
        short = html.escape(language["short"])
        label = html.escape(language["label"], quote=True)
        lang = html.escape(language["html_lang"], quote=True)
        visible = f'<span class="language-short" aria-hidden="true">{short}</span><span class="visually-hidden">{label}</span>'
        if lid == locale_id:
            rows.append(f'<span class="current" lang="{lang}" aria-current="page" title="{label}">{visible}</span>')
        else:
            rows.append(f'<a href="{html.escape(path_for(lid, page), quote=True)}" hreflang="{lang}" lang="{lang}" aria-label="{label}" title="{label}">{visible}</a>')
    return "\n        ".join(rows)


def _portfolio_nav(locale_id: str, locale: dict) -> str:
    home = _home(locale_id)
    rows = []
    for number, key, anchor in NAV_ITEMS:
        label = html.escape(locale["common"]["nav"][key])
        number_html = f'<span class="nav-no">{number}</span>'
        if key == "writing":
            rows.append(f'<span aria-current="page">{number_html} {label}</span>')
        elif key in {"ci", "shi"}:
            rows.append(f'<a href="{html.escape(_standard_page(locale_id, key), quote=True)}">{number_html} {label}</a>')
        else:
            rows.append(f'<a href="{html.escape(home + "#" + anchor, quote=True)}">{number_html} {label}</a>')
    return "\n      ".join(rows)


def _reading_tools(locale: dict) -> str:
    reading = locale["common"]["reading"]
    options = (("sans", "sans"), ("large", "large"), ("spacing", "spacing"),
               ("measure", "measure"), ("simple", "simple"),
               ("motion", "motion"), ("contrast", "contrast"))
    controls = "\n".join(
        '<label class="reading-option">'
        f'<input type="checkbox" data-reading-pref="{name}"><span>{html.escape(reading[key])}</span></label>'
        for name, key in options
    )
    label = html.escape(reading["label"])
    return (
        f'<aside class="reading-tools" aria-label="{html.escape(reading["label"], quote=True)}"><details>'
        f'<summary><span class="reading-tools-mark" aria-hidden="true">Aa</span>'
        f'<span class="reading-tools-label" aria-hidden="true">{label}</span>'
        f'<span class="visually-hidden">{label}</span></summary>'
        f'<div class="reading-panel"><fieldset><legend>{html.escape(reading["title"])}</legend>'
        f'<p class="reading-description">{html.escape(reading["description"])}</p>{controls}'
        f'</fieldset><button type="button" class="reading-reset" data-reading-reset>{html.escape(reading["reset"])}</button>'
        '</div></details></aside>'
    )


def render(site: str, languages: list[dict], locales: dict[str, dict], about: dict[str, dict], locale_id: str, page: str, copy: dict) -> str:
    language = next(item for item in languages if item["id"] == locale_id)
    locale = locales[locale_id]
    legacy = page != "request"
    title = copy["legacy_title"] if legacy else copy["title"]
    intro = copy["legacy_intro"] if legacy else copy["intro"]
    url = site + path_for(locale_id, page)
    alternates = "\n".join(
        f'<link rel="alternate" hreflang="{html.escape(item["html_lang"], quote=True)}" href="{html.escape(site + path_for(item["id"], page), quote=True)}">'
        for item in languages
    )
    alternates += f'\n<link rel="alternate" hreflang="x-default" href="{html.escape(site + path_for("en", page), quote=True)}">'
    legacy_link = (
        f'<p><a href="{html.escape(path_for(locale_id, "request"), quote=True)}">{html.escape(copy["about"])}</a></p>'
        if legacy else f'<p class="access-companion"><a href="https://github.com/HanpuLi/first-love-verification">{html.escape(copy["verification"])}</a></p>'
    )
    note = "" if legacy else f'<p class="reader-notice">{html.escape(copy["note"])}</p>'
    robots = '<meta name="robots" content="noindex,noarchive,nosnippet">' if legacy else ""
    home = _home(locale_id)
    about_href = _standard_page(locale_id, "about")
    return f'''<!DOCTYPE html>
<html lang="{html.escape(language["html_lang"], quote=True)}" translate="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="google" content="notranslate">
{robots}
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>{html.escape(title)} · Hanpu Li</title>
<meta name="description" content="{html.escape(copy["description"], quote=True)}">
<link rel="canonical" href="{html.escape(url, quote=True)}">
{alternates}
<meta name="theme-color" content="#f5f2eb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/site-mark.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<script src="/assets/accessibility.js"></script>
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/first-love-public.css">
</head>
<body class="first-love-page locale-{html.escape(locale_id, quote=True)}">
<a class="skip-link" href="#main">{html.escape(locale["common"]["skip_content"])}</a>
<div class="wrap">
  <header class="page-topbar">
    <a class="page-wordmark" href="{html.escape(home, quote=True)}">Hanpu Li <span lang="zh-Hant-HK">李函璞</span></a>
    <nav class="page-nav" aria-label="{html.escape(locale["common"]["site_nav_label"], quote=True)}">{_portfolio_nav(locale_id, locale)}</nav>
    <div class="page-utility"><nav class="page-languages" aria-label="{html.escape(locale["common"]["language_nav_label"], quote=True)}">{_language_nav(languages, locale_id, page)}</nav></div>
    {_reading_tools(locale)}
  </header>
  <main id="main" tabindex="-1">
    <header class="first-love-hero"><div><p class="first-love-eyebrow">{html.escape(copy["eyebrow"])}</p><h1>{html.escape(title)}</h1></div><div class="first-love-copy"><p>{html.escape(intro)}</p></div></header>
    <section class="access-panel"><p><a class="access-action" href="{html.escape(READER_URL, quote=True)}">{html.escape(copy["read"])}</a></p>{note}{legacy_link}</section>
  </main>
  <footer class="page-footer essay-footer"><p><a href="{html.escape(home, quote=True)}">Hanpu Li</a></p><p class="page-footer-context"><a href="{html.escape(home + "#writing", quote=True)}">{html.escape(locale["common"]["nav"]["writing"])}</a> <span aria-hidden="true">·</span> <a href="{html.escape(about_href, quote=True)}">{html.escape(about[locale_id]["footer_link"])}</a></p></footer>
</div>
</body>
</html>
'''


def build(root: Path, check: bool = False) -> list[Path]:
    languages = json.loads((root / "content/languages.json").read_text(encoding="utf-8"))
    copy = json.loads((root / "content/first-love-public.json").read_text(encoding="utf-8"))
    about = json.loads((root / "content/about-site.json").read_text(encoding="utf-8"))
    locales = {item["id"]: json.loads((root / "content/locales" / f'{item["id"]}.json').read_text(encoding="utf-8")) for item in languages}
    expected = {item["id"] for item in languages}
    if set(copy) != expected:
        raise RuntimeError("First Love locale mismatch")
    keys = set(copy["en"])
    if any(set(values) != keys for values in copy.values()):
        raise RuntimeError("First Love copy schema mismatch")
    changed = []
    for language in languages:
        lid = language["id"]
        for page in PAGES:
            target = root / path_for(lid, page).lstrip("/") / "index.html"
            rendered = render("https://hanpuli.github.io", languages, locales, about, lid, page, copy[lid])
            rendered = "\n".join(line.rstrip() for line in rendered.splitlines()) + "\n"
            old = target.read_text(encoding="utf-8") if target.exists() else None
            if old != rendered:
                changed.append(target)
                if not check:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(rendered, encoding="utf-8")
    return changed
