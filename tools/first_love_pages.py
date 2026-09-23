"""Generate the First Love request, status and private-reader pages."""
from __future__ import annotations

import html
import json
from pathlib import Path

API_ORIGIN = "https://donglebook-escape.tail95239f.ts.net:10000"
API_BASE = API_ORIGIN + "/first-love-api"
PAGES = ("request", "status", "read")
NAV_ITEMS = (
    ("01", "writing", "writing"),
    ("02", "ci", "ci"),
    ("03", "work", "work"),
    ("04", "photo", "photo"),
    ("05", "shi", "shi"),
    ("06", "profile", "profile"),
)


def path_for(locale_id: str, page: str) -> str:
    base = "" if locale_id == "en" else f"/{locale_id}"
    tail = "" if page == "request" else f"{page}/"
    return f"{base}/writing/first-love/{tail}"


def _home(locale_id: str) -> str:
    return "/" if locale_id == "en" else f"/{locale_id}/"


def _standard_page(locale_id: str, page: str) -> str:
    if locale_id == "en":
        return f"/{page}.html"
    return f"/{locale_id}/{page}.html"


def _language_nav(languages: list[dict], locale_id: str, page: str) -> str:
    rows = []
    preserve = " data-preserve-fragment" if page != "request" else ""
    for language in languages:
        lid = language["id"]
        short = html.escape(language["short"])
        label = html.escape(language["label"], quote=True)
        lang = html.escape(language["html_lang"], quote=True)
        visible = f'<span class="language-short" aria-hidden="true">{short}</span>'
        hidden = f'<span class="visually-hidden">{label}</span>'
        if lid == locale_id:
            rows.append(
                f'<span class="current" lang="{lang}" aria-current="page" title="{label}">'
                f"{visible}{hidden}</span>"
            )
        else:
            rows.append(
                f'<a href="{html.escape(path_for(lid, page), quote=True)}" hreflang="{lang}" '
                f'lang="{lang}" aria-label="{label}" title="{label}"{preserve}>{visible}</a>'
            )
    return "\n        ".join(rows)


def _portfolio_nav(locale_id: str, locale: dict) -> str:
    home = _home(locale_id)
    rows = []
    for number, key, anchor in NAV_ITEMS:
        label = html.escape(locale["common"]["nav"][key])
        number_html = f'<span class="nav-no">{number}</span>'
        if key == "writing":
            rows.append(f'<span aria-current="page">{number_html} {label}</span>')
        elif key == "ci":
            rows.append(f'<a href="{html.escape(_standard_page(locale_id, "ci"), quote=True)}">{number_html} {label}</a>')
        elif key == "shi":
            rows.append(f'<a href="{html.escape(_standard_page(locale_id, "shi"), quote=True)}">{number_html} {label}</a>')
        else:
            rows.append(f'<a href="{html.escape(home + "#" + anchor, quote=True)}">{number_html} {label}</a>')
    return "\n      ".join(rows)


def _reading_tools(locale: dict) -> str:
    reading = locale["common"]["reading"]
    options = (
        ("sans", "sans"), ("large", "large"), ("spacing", "spacing"),
        ("measure", "measure"), ("simple", "simple"),
        ("motion", "motion"), ("contrast", "contrast"),
    )
    controls = "\n".join(
        '<label class="reading-option">'
        f'<input type="checkbox" data-reading-pref="{name}">'
        f'<span>{html.escape(reading[key])}</span></label>'
        for name, key in options
    )
    label = html.escape(reading["label"])
    return (
        f'<aside class="reading-tools" aria-label="{html.escape(reading["label"], quote=True)}">\n'
        "  <details>\n"
        f'    <summary><span class="reading-tools-mark" aria-hidden="true">Aa</span>'
        f'<span class="reading-tools-label" aria-hidden="true">{label}</span>'
        f'<span class="visually-hidden">{label}</span></summary>\n'
        '    <div class="reading-panel"><fieldset>\n'
        f'      <legend>{html.escape(reading["title"])}</legend>\n'
        f'      <p class="reading-description">{html.escape(reading["description"])}</p>\n'
        f"      {controls}\n"
        "    </fieldset>\n"
        f'    <button type="button" class="reading-reset" data-reading-reset>{html.escape(reading["reset"])}</button></div>\n'
        "  </details>\n"
        "</aside>"
    )


def _font_preloads(locale_id: str) -> str:
    fonts = ["eb-garamond-latin-400.woff2", "shippori-mincho-common.woff2"]
    if locale_id == "ru":
        fonts.extend(("eb-garamond-cyrillic-400.woff2", "cousine-latin-400.woff2", "cousine-cyrillic-400.woff2"))
    else:
        fonts.append("courier-prime-latin-400.woff2")
        if locale_id in {"zh", "ja"}:
            fonts.append("shippori-mincho-subset.woff2")
        elif locale_id == "zh-hans":
            fonts.append("noto-serif-sc-subset.woff2")
    return "\n".join(
        f'<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/{name}" crossorigin>'
        for name in fonts
    )


def _head(site: str, languages: list[dict], language: dict, locale_id: str, page: str, copy: dict) -> str:
    url = site + path_for(locale_id, page)
    title = copy["title"] if page == "request" else copy["statusTitle"] if page == "status" else copy["readerTitle"]
    robots = '<meta name="robots" content="noindex,noarchive,nosnippet">\n' if page != "request" else ""
    alternates = []
    for item in languages:
        alternates.append(
            f'<link rel="alternate" hreflang="{html.escape(item["html_lang"], quote=True)}" '
            f'href="{html.escape(site + path_for(item["id"], page), quote=True)}">'
        )
    alternates.append(
        f'<link rel="alternate" hreflang="x-default" href="{html.escape(site + path_for("en", page), quote=True)}">'
    )
    csp = (
        "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; "
        f"connect-src {API_ORIGIN}; frame-src blob:; object-src blob:; "
        "img-src 'self' data: blob:; media-src 'none'; base-uri 'none'; form-action 'self'"
    )
    return f'''<!DOCTYPE html>
<html lang="{html.escape(language["html_lang"], quote=True)}" translate="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="google" content="notranslate">
{robots}<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="{html.escape(csp, quote=True)}">
<title>{html.escape(title)} · Hanpu Li</title>
<meta name="description" content="{html.escape(copy["description"], quote=True)}">
<link rel="canonical" href="{html.escape(url, quote=True)}">
{chr(10).join(alternates)}
<meta name="theme-color" content="#f5f2eb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/site-mark.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
{_font_preloads(locale_id)}
<script src="/assets/accessibility.js"></script>
<script src="/assets/first-love-access.js" defer></script>
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/first-love-access.css">
</head>'''


def _data_attributes(copy: dict, page: str, locale_id: str) -> str:
    values = {
        "page": page,
        "error": copy["error"],
        "missing": copy["missing"],
        "pending": copy["pending"],
        "active": copy["active"],
        "declined": copy["declined"],
        "revoked": copy["revoked"],
        "expired": copy["expired"],
        "unavailable": copy["unavailable"],
        "checking": copy["checking"],
        "submitting": copy["submitting"],
        "copied": copy["copied"],
        "network": copy["network"],
        "version-label": copy["version"],
        "version-date-label": copy["versionDate"],
        "pages-label": copy["pages"],
        "expires-label": copy["expires"],
        "no-expiry": copy["noExpiry"],
        "status-path": path_for(locale_id, "status"),
        "reader-path": path_for(locale_id, "read"),
    }
    return "data-first-love-access " + " ".join(
        f'data-{key}="{html.escape(str(value), quote=True)}"' for key, value in values.items()
    )


def _topbar(languages: list[dict], locale_id: str, locale: dict, page: str) -> str:
    return f'''<header class="page-topbar">
    <a class="page-wordmark" href="{html.escape(_home(locale_id), quote=True)}">Hanpu Li <span lang="zh-Hant-HK">李函璞</span></a>
    <nav class="page-nav" aria-label="{html.escape(locale["common"]["site_nav_label"], quote=True)}">
      {_portfolio_nav(locale_id, locale)}
    </nav>
    <div class="page-utility">
      <nav class="page-languages" aria-label="{html.escape(locale["common"]["language_nav_label"], quote=True)}">
        {_language_nav(languages, locale_id, page)}
      </nav>
    </div>
    {_reading_tools(locale)}
  </header>'''


def _version_details(copy: dict, include_expiry: bool) -> str:
    expiry = (
        f'<div data-expiry-row hidden><dt>{html.escape(copy["expires"])}</dt><dd data-expiry></dd></div>'
        if include_expiry else ""
    )
    return f'''<dl class="access-version" data-version-details hidden>
      <div><dt>{html.escape(copy["requestId"])}</dt><dd data-request-id></dd></div>
      <div><dt>{html.escape(copy["version"])}</dt><dd data-version-label></dd></div>
      <div><dt>{html.escape(copy["versionDate"])}</dt><dd data-version-date></dd></div>
      <div><dt>{html.escape(copy["pages"])}</dt><dd data-version-pages></dd></div>
      {expiry}
    </dl>'''


def render(site: str, languages: list[dict], locales: dict[str, dict], about: dict[str, dict], locale_id: str, page: str, copy: dict) -> str:
    language = next(item for item in languages if item["id"] == locale_id)
    locale = locales[locale_id]
    request_path = path_for(locale_id, "request")
    status_path = path_for(locale_id, "status")
    title = copy["title"] if page == "request" else copy["statusTitle"] if page == "status" else copy["readerTitle"]
    subtitle = copy["intro"] if page == "request" else copy["statusIntro"] if page == "status" else copy["readerIntro"]
    main_attrs = _data_attributes(copy, page, locale_id)
    if page == "request":
        body = f'''<section class="access-panel" aria-labelledby="request-heading">
      <h2 id="request-heading">{html.escape(copy["request"])}</h2>
      <p>{html.escape(copy["intro"])}</p>
      <form class="access-form" data-request-form>
        <label>{html.escape(copy["name"])}<input type="text" name="name" autocomplete="name" required maxlength="160"></label>
        <label>{html.escape(copy["email"])}<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
        <label>{html.escape(copy["affiliation"])}<input type="text" name="affiliation" autocomplete="organization" maxlength="240"></label>
        <label>{html.escape(copy["reason"])}<textarea name="reason" maxlength="2000"></textarea></label>
        <label class="access-honeypot" aria-hidden="true">Company<input type="text" name="company" tabindex="-1" autocomplete="off"></label>
        <button type="submit">{html.escape(copy["submit"])}</button>
      </form>
      <p class="access-result" data-result role="status" aria-live="polite"></p>
      <div class="access-success" data-success hidden>
        <h3>{html.escape(copy["sent"])}</h3>
        <p>{html.escape(copy["save"])}</p>
        <p class="first-love-meta"><span>{html.escape(copy["requestId"])}</span> <span data-request-id></span></p>
        <label class="private-url-label">{html.escape(copy["statusTitle"])}<input type="text" class="private-url" data-private-url readonly></label>
        <div class="access-actions"><button class="access-action" type="button" data-copy>{html.escape(copy["copy"])}</button><a class="access-action" data-open-status>{html.escape(copy["open"])}</a></div>
      </div>
      <aside class="access-privacy" aria-label="Privacy">{html.escape(copy["privacy"])}</aside>
      <p class="access-companion"><a href="https://github.com/HanpuLi/first-love-verification">{html.escape(copy["verification"])}</a></p>
    </section>'''
    elif page == "status":
        body = f'''<section class="access-panel access-status-panel">
      <p class="status-state" data-state aria-live="polite">{html.escape(copy["checking"])}</p>
      {_version_details(copy, True)}
      <div class="access-actions"><a class="access-action" data-read hidden>{html.escape(copy["read"])}</a><a class="access-action" href="{html.escape(request_path, quote=True)}">{html.escape(copy["back"])}</a></div>
    </section>'''
    else:
        body = f'''<section class="access-panel access-reader-panel">
      <p class="reader-notice">{html.escape(copy["notice"])}</p>
      <p class="reader-log-notice">{html.escape(copy["logNotice"])}</p>
      {_version_details(copy, False)}
      <p class="status-state" data-state aria-live="polite">{html.escape(copy["checking"])}</p>
      <div class="access-actions"><a class="access-action" data-open-pdf hidden>{html.escape(copy["openPdf"])}</a><a class="access-action" href="{html.escape(status_path, quote=True)}" data-status-return>{html.escape(copy["back"])}</a></div>
      <iframe class="reader-frame" data-pdf hidden title="{html.escape(copy["readerTitle"], quote=True)}"></iframe>
    </section>'''
    footer_context = html.escape(about[locale_id]["footer_link"])
    about_href = _standard_page(locale_id, "about")
    return _head(site, languages, language, locale_id, page, copy) + f'''
<body class="first-love-page locale-{html.escape(locale_id, quote=True)}">
<a class="skip-link" href="#main">{html.escape(locale["common"]["skip_content"])}</a>
<div class="wrap">
  {_topbar(languages, locale_id, locale, page)}
  <main id="main" tabindex="-1" {main_attrs}>
    <header class="first-love-hero">
      <div><p class="first-love-eyebrow">{html.escape(copy["eyebrow"])}</p><h1>{html.escape(title)}</h1></div>
      <div class="first-love-copy"><p>{html.escape(subtitle)}</p></div>
    </header>
    {body}
  </main>
  <footer class="page-footer essay-footer">
    <p><a href="{html.escape(_home(locale_id), quote=True)}">Hanpu Li</a></p>
    <p class="page-footer-context"><a href="{html.escape(_home(locale_id) + "#writing", quote=True)}">{html.escape(copy["back_writing"] if "back_writing" in copy else locale["common"]["nav"]["writing"])}</a> <span aria-hidden="true">·</span> <a href="{html.escape(about_href, quote=True)}">{footer_context}</a></p>
  </footer>
</div>
</body>
</html>
'''


def build(root: Path, check: bool = False) -> list[Path]:
    languages = json.loads((root / "content/languages.json").read_text(encoding="utf-8"))
    copy = json.loads((root / "content/first-love-access.json").read_text(encoding="utf-8"))
    about = json.loads((root / "content/about-site.json").read_text(encoding="utf-8"))
    locales = {
        item["id"]: json.loads((root / "content/locales" / f'{item["id"]}.json').read_text(encoding="utf-8"))
        for item in languages
    }
    expected = {item["id"] for item in languages}
    if set(copy) != expected:
        raise RuntimeError(f"First Love access locale mismatch: {sorted(set(copy) ^ expected)}")
    keys = set(copy["en"])
    for lid, values in copy.items():
        if set(values) != keys:
            raise RuntimeError(f"First Love access copy schema mismatch for {lid}")
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
