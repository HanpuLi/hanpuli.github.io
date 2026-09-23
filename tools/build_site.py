#!/usr/bin/env python3
"""Build the multilingual static portfolio from structured content.

English is emitted at the site root. Other locales are emitted under /<locale>/.
There is no runtime i18n JavaScript: every page is a complete static document,
and all user-facing copy lives in content/, not in the renderer.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
TEMPLATES = ROOT / "templates"
TOKEN_RE = re.compile(r"{{([A-Za-z0-9_.]+)}}")
ROOT_LOCALE = "en"
PAGES = ("index", "ci", "shi", "about", "contexts", "404", "poetry-voucher")


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


IDENTITY = load_json(CONTENT / "identity.json")
SHARED = load_json(CONTENT / "shared.json")
LANGUAGES = load_json(CONTENT / "languages.json")
LANG_BY_ID = {item["id"]: item for item in LANGUAGES}
CI_SOURCE = load_json(CONTENT / "ci-source.json")
CI_SIMPLIFIED = load_json(CONTENT / "ci-simplified.json")
SHI_SOURCE = load_json(CONTENT / "shi-source.json")
SHI_SIMPLIFIED = load_json(CONTENT / "shi-simplified.json")
TRAINSPOTTING_ESSAY = load_json(CONTENT / "essay-trainspotting.json")
ABOUT_SITE = load_json(CONTENT / "about-site.json")
CONTEXTS = load_json(CONTENT / "contexts.json")
POETRY_VOUCHER = load_json(CONTENT / "poetry-voucher.json")
CHINESE_LOCALES = {"zh", "zh-hans"}
BASE_URL = IDENTITY["site_url"].rstrip("/")
PERSON_ID = f"{BASE_URL}/#person"
WEBSITE_ID = f"{BASE_URL}/#website"
SOCIAL_IMAGES = {
    "ci": ("assets/social/ci.png", 1200, 630, "image/png"),
    "shi": ("assets/social/shi.png", 1200, 630, "image/png"),
    "about": ("assets/social/about.png", 1200, 630, "image/png"),
    "essay": ("assets/social/trainspotting.png", 1200, 630, "image/png"),
}


class BuildError(RuntimeError):
    pass


def png_dimensions(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise BuildError(f"not a PNG with an IHDR header: {path}")
    return int.from_bytes(header[16:20], "big"), int.from_bytes(header[20:24], "big")


def schema_signature(value: Any, path: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else key
            out[child_path] = type(child).__name__
            out.update(schema_signature(child, child_path))
    elif isinstance(value, list):
        out[f"{path}[]"] = "list"
        for idx, child in enumerate(value):
            out.update(schema_signature(child, f"{path}[{idx}]"))
    return out


def validate_locale_schema(locale_id: str, locale: dict[str, Any], base: dict[str, Any]) -> None:
    expected = schema_signature(base)
    actual = schema_signature(locale)
    missing = sorted(set(expected) - set(actual))
    extra = sorted(set(actual) - set(expected))
    mismatched = sorted(key for key in set(expected) & set(actual) if expected[key] != actual[key])
    if missing or extra or mismatched:
        bits = []
        if missing:
            bits.append("missing=" + ", ".join(missing[:20]))
        if extra:
            bits.append("extra=" + ", ".join(extra[:20]))
        if mismatched:
            bits.append("type=" + ", ".join(mismatched[:20]))
        raise BuildError(f"locale {locale_id} does not match en schema: {'; '.join(bits)}")


def page_path(locale_id: str, page: str) -> str:
    if page == "poetry-voucher":
        return ("/" if locale_id == ROOT_LOCALE else f"/{locale_id}/") + "poetry-voucher/"
    if page == "index":
        return "/" if locale_id == ROOT_LOCALE else f"/{locale_id}/"
    name = f"{page}.html"
    return f"/{name}" if locale_id == ROOT_LOCALE else f"/{locale_id}/{name}"


def absolute_url(locale_id: str, page: str) -> str:
    return BASE_URL + page_path(locale_id, page)


def essay_page_path(locale_id: str) -> str:
    if locale_id == ROOT_LOCALE:
        return "/writing/trainspotting/"
    return f"/{locale_id}/writing/trainspotting/"


def essay_absolute_url(locale_id: str) -> str:
    return BASE_URL + essay_page_path(locale_id)


def essay_output_path(locale_id: str) -> Path:
    folder = ROOT if locale_id == ROOT_LOCALE else ROOT / locale_id
    return folder / "writing" / "trainspotting" / "index.html"


def essay_asset_prefix(locale_id: str) -> str:
    return "../../" if locale_id == ROOT_LOCALE else "../../../"


def essay_language_switcher(locale_id: str) -> str:
    bits = []
    for language in LANGUAGES:
        lid = language["id"]
        label = html.escape(language["short"])
        title = html.escape(language["label"], quote=True)
        lang_attr = html.escape(language["html_lang"], quote=True)
        if lid == locale_id:
            bits.append(
                f'<span class="current" lang="{lang_attr}" aria-current="page" title="{title}">'
                f'<span class="language-short" aria-hidden="true">{label}</span>'
                f'<span class="visually-hidden">{title}</span></span>'
            )
        else:
            href = html.escape(essay_page_path(lid), quote=True)
            bits.append(
                f'<a href="{href}" hreflang="{lang_attr}" lang="{lang_attr}" '
                f'aria-label="{title}" title="{title}">'
                f'<span class="language-short" aria-hidden="true">{label}</span></a>'
            )
    return "\n      ".join(bits)


def output_path(locale_id: str, page: str) -> Path:
    folder = ROOT if locale_id == ROOT_LOCALE else ROOT / locale_id
    if page == "poetry-voucher":
        return folder / page / "index.html"
    return folder / ("index.html" if page == "index" else f"{page}.html")


PORTFOLIO_NAV_ITEMS = (
    ("01", "writing", "writing"),
    ("02", "ci", "ci"),
    ("03", "work", "work"),
    ("04", "photo", "photo"),
    ("05", "shi", "shi"),
    ("06", "profile", "profile"),
)


def portfolio_nav_html(
    locale_id: str,
    locale: dict[str, Any],
    *,
    current: str | None = None,
    home_page: bool = False,
) -> str:
    home = page_path(locale_id, "index")
    rows = []
    for number, key, anchor in PORTFOLIO_NAV_ITEMS:
        label = locale["common"]["nav"][key]
        number_html = f'<span class="nav-no">{number}</span>'
        if key == current:
            rows.append(
                f'<span aria-current="page">{number_html} {label}</span>'
            )
            continue

        if key == "ci":
            href = "#ci" if home_page else page_path(locale_id, "ci")
        elif key == "shi":
            href = page_path(locale_id, "shi")
        else:
            href = f"#{anchor}" if home_page else f"{home}#{anchor}"
        rows.append(f'<a href="{html.escape(href, quote=True)}">{number_html} {label}</a>')
    return "\n      ".join(rows)


def asset_prefix(locale_id: str) -> str:
    return "" if locale_id == ROOT_LOCALE else "../"


def language_switcher(locale_id: str, page: str) -> str:
    bits = []
    for language in LANGUAGES:
        lid = language["id"]
        label = html.escape(language["short"])
        title = html.escape(language["label"], quote=True)
        lang_attr = html.escape(language["html_lang"], quote=True)
        if lid == locale_id:
            bits.append(
                f'<span class="current" lang="{lang_attr}" aria-current="page" title="{title}">'
                f'<span class="language-short" aria-hidden="true">{label}</span>'
                f'<span class="visually-hidden">{title}</span></span>'
            )
        else:
            href = html.escape(page_path(lid, page), quote=True)
            bits.append(
                f'<a href="{href}" hreflang="{lang_attr}" lang="{lang_attr}" '
                f'aria-label="{title}" title="{title}">'
                f'<span class="language-short" aria-hidden="true">{label}</span></a>'
            )
    return "\n      ".join(bits)


def hreflang_links(page: str) -> str:
    bits = []
    for language in LANGUAGES:
        href = html.escape(absolute_url(language["id"], page), quote=True)
        hreflang = html.escape(language["html_lang"], quote=True)
        bits.append(f'<link rel="alternate" hreflang="{hreflang}" href="{href}">')
    bits.append(f'<link rel="alternate" hreflang="x-default" href="{html.escape(absolute_url(ROOT_LOCALE, page), quote=True)}">')
    return "\n".join(bits)


def essay_hreflang_links() -> str:
    bits = []
    for language in LANGUAGES:
        href = html.escape(essay_absolute_url(language["id"]), quote=True)
        hreflang = html.escape(language["html_lang"], quote=True)
        bits.append(f'<link rel="alternate" hreflang="{hreflang}" href="{href}">')
    bits.append(
        f'<link rel="alternate" hreflang="x-default" '
        f'href="{html.escape(essay_absolute_url(ROOT_LOCALE), quote=True)}">'
    )
    return "\n".join(bits)


def icon_links(prefix: str) -> str:
    return (
        f'<link rel="icon" href="{prefix}assets/site-mark.svg" type="image/svg+xml">\n'
        f'<link rel="apple-touch-icon" href="{prefix}assets/apple-touch-icon.png">'
    )


def social_meta_html(
    *,
    locale_id: str,
    title: str,
    description: str,
    url: str,
    image_url: str,
    image_alt: str,
    width: int,
    height: int,
    image_type: str,
    og_type: str,
) -> str:
    lang = LANG_BY_ID[locale_id]
    title_attr = html.escape(title, quote=True)
    description_attr = html.escape(description, quote=True)
    url_attr = html.escape(url, quote=True)
    image_attr = html.escape(image_url, quote=True)
    alt_attr = html.escape(image_alt, quote=True)
    lines = [
        f'<meta property="og:type" content="{html.escape(og_type, quote=True)}">',
        f'<meta property="og:site_name" content="{html.escape(IDENTITY["primary_name"], quote=True)}">',
        f'<meta property="og:title" content="{title_attr}">',
        f'<meta property="og:description" content="{description_attr}">',
        f'<meta property="og:image" content="{image_attr}">',
        f'<meta property="og:image:type" content="{html.escape(image_type, quote=True)}">',
        f'<meta property="og:image:width" content="{width}">',
        f'<meta property="og:image:height" content="{height}">',
        f'<meta property="og:image:alt" content="{alt_attr}">',
        f'<meta property="og:url" content="{url_attr}">',
        f'<meta property="og:locale" content="{html.escape(lang["og_locale"], quote=True)}">',
    ]
    lines.extend(
        f'<meta property="og:locale:alternate" content="{html.escape(other["og_locale"], quote=True)}">'
        for other in LANGUAGES
        if other["id"] != locale_id
    )
    lines.extend([
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{title_attr}">',
        f'<meta name="twitter:description" content="{description_attr}">',
        f'<meta name="twitter:image" content="{image_attr}">',
        f'<meta name="twitter:image:alt" content="{alt_attr}">',
    ])
    return "\n".join(lines)


def structured_data_html(
    *,
    locale_id: str,
    page_kind: str,
    title: str,
    description: str,
    url: str,
) -> str:
    language = LANG_BY_ID[locale_id]["html_lang"]
    person = {
        "@type": "Person",
        "@id": PERSON_ID,
        "name": IDENTITY["primary_name"],
        "alternateName": [IDENTITY["chinese_name"], *IDENTITY["alternate_names"]],
        "url": IDENTITY["site_url"],
        "sameAs": [IDENTITY["github_url"]],
        "knowsAbout": IDENTITY["knows_about"],
    }
    website = {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        "url": IDENTITY["site_url"],
        "name": IDENTITY["primary_name"],
        "publisher": {"@id": PERSON_ID},
        "inLanguage": [item["html_lang"] for item in LANGUAGES],
    }
    graph = [person, website]
    if page_kind != "index":
        type_map = {
            "about": "AboutPage",
            "contexts": "CollectionPage",
            "ci": "CollectionPage",
            "shi": "CollectionPage",
            "essay": "Article",
            "poetry-voucher": "CreativeWork",
        }
        page_type = type_map[page_kind]
        node = {
            "@type": page_type,
            "@id": f"{url}#page",
            "url": url,
            "name": title,
            "description": description,
            "isPartOf": {"@id": WEBSITE_ID},
            "inLanguage": "en-GB" if page_kind == "essay" else language,
        }
        if page_kind == "about":
            node["about"] = {"@id": PERSON_ID}
        elif page_kind == "essay":
            node["author"] = {"@id": PERSON_ID}
        else:
            node["creator"] = {"@id": PERSON_ID}
        graph.append(node)
    payload = {"@context": "https://schema.org", "@graph": graph}
    return (
        '<script type="application/ld+json">\n'
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + "\n</script>"
    )


def about_toc_html(locale_id: str) -> str:
    about = ABOUT_SITE[locale_id]
    items = [
        f'<li><a href="#{html.escape(section["id"], quote=True)}">'
        f'<span>{html.escape(section["number"])}</span> {html.escape(section["title"])}</a></li>'
        for section in about["sections"]
    ]
    items.append(
        '<li><a href="#principles"><span>07</span> '
        + html.escape(about["scope_title"])
        + "</a></li>"
    )
    return (
        f'<nav class="about-toc" aria-label="{html.escape(about["toc_label"], quote=True)}">\n'
        f'  <p>{html.escape(about["toc_label"])}</p>\n'
        '  <ol>\n    '
        + "\n    ".join(items)
        + "\n  </ol>\n</nav>"
    )


def lookup(data: dict[str, Any], key: str) -> Any:
    cur: Any = data
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            raise BuildError(f"unknown template key: {key}")
        cur = cur[part]
    return cur


def render_template(template: str, locale: dict[str, Any], specials: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        token = match.group(1)
        if token in specials:
            return str(specials[token])
        if token.endswith("_attr"):
            value = lookup(locale, token[:-5])
            if not isinstance(value, str):
                raise BuildError(f"attribute token must resolve to string: {token}")
            return html.escape(value, quote=True)
        value = lookup(locale, token)
        if isinstance(value, (dict, list)):
            raise BuildError(f"template token must resolve to scalar: {token}")
        return str(value)

    rendered = TOKEN_RE.sub(replace, template)
    leftovers = TOKEN_RE.findall(rendered)
    if leftovers:
        raise BuildError("unresolved template tokens: " + ", ".join(sorted(set(leftovers))))
    return rendered


def flow_html(items: list[str]) -> str:
    rows = "\n".join(
        f'            <li><span>{idx:02d}</span><span>{item}</span></li>'
        for idx, item in enumerate(items, 1)
    )
    return '<ol class="system-flow">\n' + rows + '\n          </ol>'


def chronology_html(items: list[dict[str, str]]) -> str:
    return "\n        ".join(
        f'<div class="credit"><time>{html.escape(item["time"])}</time><p>{item["text"]}</p></div>'
        for item in items
    )


def ci_source(locale_id: str) -> dict[str, Any]:
    return CI_SIMPLIFIED if locale_id == "zh-hans" else CI_SOURCE


def ci_translation(locale_id: str) -> dict[str, dict[str, str]]:
    if locale_id == "en":
        return {poem["id"]: poem["en"] for poem in CI_SOURCE["poems"]}
    if locale_id in CHINESE_LOCALES:
        return {}
    path = CONTENT / "ci-translations" / f"{locale_id}.json"
    data = load_json(path)
    poems = data.get("poems", {})
    expected = [p["id"] for p in CI_SOURCE["poems"]]
    if set(poems) != set(expected):
        missing = sorted(set(expected) - set(poems))
        extra = sorted(set(poems) - set(expected))
        raise BuildError(f"{path}: poem id mismatch missing={missing} extra={extra}")
    return poems


def ci_separate_group() -> dict[str, Any]:
    groups = CI_SOURCE.get("separate_groups", [])
    if len(groups) != 1:
        raise BuildError(f"ci-source.json: expected exactly one separate group, got {len(groups)}")
    group = groups[0]
    poem_ids = group.get("poem_ids", [])
    if poem_ids != ["w2", "w3"]:
        raise BuildError(f"ci-source.json: unexpected separate-group ids {poem_ids!r}")
    return group


def ci_toc(locale_id: str, locale: dict[str, Any]) -> str:
    cn_numbers = {1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "七", 8: "八", 9: "九", 10: "十"}
    separate_ids = ci_separate_group()["poem_ids"]
    out = []
    for poem in CI_SOURCE["poems"]:
        pid = poem["id"]
        if pid == "a10":
            label = locale["ci"]["outside"]
            klass = ' class="waibian"'
        elif pid in separate_ids:
            index = separate_ids.index(pid) + 1
            if index == 1:
                out.append(
                    f'<span class="toc-group">{html.escape(locale["ci"]["separate_toc"])}</span>'
                )
            label = cn_numbers[index] if locale_id in CHINESE_LOCALES else str(index)
            klass = ' class="separate"'
        elif pid.startswith("a"):
            n = int(pid[1:])
            label = f'甲{cn_numbers[n]}' if locale_id in CHINESE_LOCALES else f"A{n}"
            klass = ""
        elif pid.startswith("b"):
            n = int(pid[1:])
            label = f'乙{cn_numbers[n]}' if locale_id in CHINESE_LOCALES else f"B{n}"
            klass = ""
        else:
            label = pid
            klass = ""
        out.append(f'<a href="#{pid}"{klass}>{html.escape(label)}</a>')
    return "".join(out)


def ci_poem_html(
    poem: dict[str, Any],
    *,
    locale_id: str,
    target_lang: str,
    source_lang: str,
    translations: dict[str, dict[str, str]],
) -> str:
    voice = poem["voice"]
    classes = "poem" + (f" {voice}" if voice in {"jia", "yi"} else "")
    source_title = html.escape(poem["source_title"])
    source_body = html.escape(poem["source_body"])
    source_date = (
        f'\n        <div class="date">{html.escape(poem["date"])}</div>'
        if poem.get("date")
        else ""
    )
    versions = [
        (
            f'      <section class="poem-version source" lang="{source_lang}">\n'
            f'        <h3>{source_title}</h3>\n'
            f'        <div class="body">{source_body}</div>'
            f'{source_date}\n'
            f'      </section>'
        )
    ]
    pair_class = "poem-pair source-only"
    if locale_id not in CHINESE_LOCALES:
        item = translations[poem["id"]]
        versions.append(
            f'      <section class="poem-version translation" '
            f'lang="{html.escape(target_lang, quote=True)}">\n'
            f'        <h3>{html.escape(item["title"])}</h3>\n'
            f'        <div class="body">{html.escape(item["body"])}</div>\n'
            f'      </section>'
        )
        pair_class = "poem-pair"

    return (
        f'  <div class="{classes}" id="{poem["id"]}">\n'
        f'    <div class="{pair_class}">\n'
        + "\n".join(versions)
        + "\n    </div>\n"
        f'  </div>'
    )


def ci_poems_html(locale_id: str, locale: dict[str, Any]) -> str:
    translations = ci_translation(locale_id)
    target_lang = LANG_BY_ID[locale_id]["html_lang"]
    source_data = ci_source(locale_id)
    source_lang = "zh-Hans" if locale_id == "zh-hans" else "zh-Hant-HK"
    separate_ids = set(ci_separate_group()["poem_ids"])

    cycle_poems = [p for p in source_data["poems"] if p["id"] not in separate_ids]
    separate_poems = [p for p in source_data["poems"] if p["id"] in separate_ids]

    cycle_source_title = html.escape(source_data["title"])
    cycle = [
        '<section class="ci-group ci-cycle" aria-labelledby="ci-cycle-heading">',
        '  <header class="ci-group-head">',
        '    <p class="ci-group-no">01</p>',
        '    <div class="ci-group-copy">',
        f'      <h2 id="ci-cycle-heading">{locale["ci"]["heading"]}</h2>',
        f'      <p>{locale["ci"]["subtitle"]}</p>',
        f'      <p class="source-title" lang="{source_lang}">{cycle_source_title}</p>',
        '    </div>',
        '  </header>',
    ]
    cycle.extend(
        ci_poem_html(
            poem,
            locale_id=locale_id,
            target_lang=target_lang,
            source_lang=source_lang,
            translations=translations,
        )
        for poem in cycle_poems
    )
    cycle.append("</section>")

    separate = [
        '<section class="ci-group ci-separate" aria-labelledby="ci-separate-heading">',
        '  <header class="ci-group-head">',
        '    <p class="ci-group-no">02</p>',
        '    <div class="ci-group-copy">',
        f'      <h2 id="ci-separate-heading">{locale["ci"]["separate_heading"]}</h2>',
        f'      <p>{locale["ci"]["separate_note"]}</p>',
        '    </div>',
        '  </header>',
    ]
    separate.extend(
        ci_poem_html(
            poem,
            locale_id=locale_id,
            target_lang=target_lang,
            source_lang=source_lang,
            translations=translations,
        )
        for poem in separate_poems
    )
    separate.append("</section>")

    return "\n\n".join(cycle + separate)


def shi_translation(locale_id: str) -> list[dict[str, Any]]:
    if locale_id == "zh":
        return SHI_SOURCE["drafts"]
    if locale_id == "zh-hans":
        return SHI_SIMPLIFIED["drafts"]
    path = CONTENT / "shi-translations" / f"{locale_id}.json"
    data = load_json(path)
    drafts = data.get("drafts", [])
    if len(drafts) != len(SHI_SOURCE["drafts"]):
        raise BuildError(f"{path}: expected {len(SHI_SOURCE['drafts'])} drafts, got {len(drafts)}")
    for i, draft in enumerate(drafts):
        expected_parts = len(SHI_SOURCE["drafts"][i]["parts"])
        if len(draft.get("parts", [])) != expected_parts:
            raise BuildError(f"{path}: draft {i+1} expected {expected_parts} parts")
    return drafts


def shi_draft_html(draft: dict[str, Any], lang: str, classes: str) -> str:
    rows = [
        f'    <div class="{classes}" lang="{html.escape(lang, quote=True)}">',
        f'      <h2>{html.escape(draft["title"])}</h2>',
    ]
    for part in draft["parts"]:
        rows.append(f'      <p class="num">{html.escape(part["number"])}</p>')
        rows.append(f'      <div class="body">{html.escape(part["body"])}</div>')
    rows.append("    </div>")
    return "\n".join(rows)


def shi_drafts_html(locale_id: str) -> str:
    target_lang = (
        "zh-Hant-HK" if locale_id == "zh"
        else "zh-Hans" if locale_id == "zh-hans"
        else LANG_BY_ID[locale_id]["html_lang"]
    )

    if locale_id in CHINESE_LOCALES:
        drafts = shi_translation(locale_id)
        return "\n\n".join(
            shi_draft_html(draft, target_lang, "draft")
            for draft in drafts
        )

    translations = shi_translation(locale_id)
    blocks = []
    for index, (source, translated) in enumerate(
        zip(SHI_SOURCE["drafts"], translations),
        start=1,
    ):
        blocks.append(
            f'  <section class="draft-pair" data-draft="{index}">\n'
            + shi_draft_html(source, "zh-Hant-HK", "draft source")
            + "\n"
            + shi_draft_html(translated, target_lang, "draft translation")
            + "\n  </section>"
        )
    return "\n\n".join(blocks)


def about_sections_html(locale_id: str) -> str:
    sections = ABOUT_SITE[locale_id]["sections"]
    blocks = []
    for section in sections:
        body = "\n".join(
            f'        <p>{html.escape(paragraph)}</p>'
            for paragraph in section["body"]
        )
        facts = "\n".join(
            '          <div>'
            f'<dt>{html.escape(fact["label"])}</dt>'
            f'<dd>{html.escape(fact["value"])}</dd>'
            '</div>'
            for fact in section["facts"]
        )
        blocks.append(
            f'    <section class="about-section" id="{html.escape(section["id"], quote=True)}">\n'
            '      <div class="about-section-head">\n'
            f'        <p class="about-section-no">{html.escape(section["number"])}</p>\n'
            f'        <h2>{html.escape(section["title"])}</h2>\n'
            f'        <p class="about-section-dek">{html.escape(section["dek"])}</p>\n'
            '      </div>\n'
            '      <div class="about-section-copy">\n'
            f'{body}\n'
            '        <dl class="about-facts">\n'
            f'{facts}\n'
            '        </dl>\n'
            '      </div>\n'
            '    </section>'
        )
    return "\n\n".join(blocks)


def about_scope_body_html(locale_id: str) -> str:
    return "\n".join(
        f'        <p>{html.escape(paragraph)}</p>'
        for paragraph in ABOUT_SITE[locale_id]["scope_body"]
    )


def contexts_sections_html(locale_id: str) -> str:
    copy = CONTEXTS[locale_id]
    blocks = []
    for section in copy["sections"]:
        records = []
        for record in section["records"]:
            link = ""
            if record["href"]:
                link = (
                    f'            <p class="contexts-record-link"><a href="{html.escape(record["href"], quote=True)}">'
                    f'{html.escape(record["link_label"])}</a></p>\n'
                )
            records.append(
                '        <article class="contexts-record">\n'
                f'          <p class="contexts-date">{html.escape(record["date"])}</p>\n'
                '          <div class="contexts-record-main">\n'
                f'            <h3>{html.escape(record["title"])}</h3>\n'
                f'            <p class="contexts-detail">{html.escape(record["detail"])}</p>\n'
                f'            <p class="contexts-credit"><span>{html.escape(copy["credit_label"])}</span> '
                f'{html.escape(record["credit"])}</p>\n'
                f'{link}'
                '          </div>\n'
                '        </article>'
            )
        blocks.append(
            f'    <section class="about-section contexts-section" id="{html.escape(section["id"], quote=True)}">\n'
            '      <div class="about-section-head">\n'
            f'        <p class="about-section-no">{html.escape(section["number"])}</p>\n'
            f'        <h2>{html.escape(section["title"])}</h2>\n'
            f'        <p class="about-section-dek">{html.escape(section["dek"])}</p>\n'
            '      </div>\n'
            '      <div class="about-section-copy contexts-section-copy">\n'
            '        <div class="contexts-records">\n'
            + "\n".join(records)
            + '\n        </div>\n'
            '      </div>\n'
            '    </section>'
        )
    return "\n\n".join(blocks)


def font_preloads(locale_id: str, page: str) -> str:
    # GitHub Pages serves the root 404 document at the originally requested URL.
    # Root-relative assets therefore keep working for arbitrarily deep missing paths.
    prefix = "/" if page == "404" else asset_prefix(locale_id)
    fonts = [
        "eb-garamond-latin-400.woff2",
        "shippori-mincho-common.woff2",
    ]
    if locale_id == "ru":
        fonts.extend([
            "eb-garamond-cyrillic-400.woff2",
            "cousine-latin-400.woff2",
            "cousine-cyrillic-400.woff2",
        ])
    else:
        fonts.append("courier-prime-latin-400.woff2")
        if locale_id in {"zh", "ja"}:
            fonts.append("shippori-mincho-subset.woff2")
        elif locale_id == "zh-hans":
            fonts.append("noto-serif-sc-subset.woff2")
    return "\n".join(
        f'<link rel="preload" as="font" type="font/woff2" href="{prefix}assets/fonts/{name}" crossorigin>'
        for name in fonts
    )


def reading_tools(locale: dict[str, Any], *, inert: bool = False) -> str:
    reading = locale["common"]["reading"]
    label = html.escape(reading["label"])
    title = html.escape(reading["title"])
    description = html.escape(reading["description"])
    options = (
        ("sans", "sans"),
        ("large", "large"),
        ("spacing", "spacing"),
        ("measure", "measure"),
        ("simple", "simple"),
        ("motion", "motion"),
        ("contrast", "contrast"),
    )
    controls = "\n".join(
        "        <label class=\"reading-option\">"
        f"<input type=\"checkbox\" data-reading-pref=\"{name}\">"
        f"<span>{html.escape(reading[key])}</span></label>"
        for name, key in options
    )
    reset = html.escape(reading["reset"])
    container = "div" if inert else "aside"
    label_attr = "data-label" if inert else "aria-label"
    return (
        f'<{container} class="reading-tools" {label_attr}="{html.escape(reading["label"], quote=True)}">\n'
        '  <details>\n'
        f'    <summary><span class="reading-tools-mark" aria-hidden="true">Aa</span>'
        f'<span class="reading-tools-label" aria-hidden="true">{label}</span>'
        f'<span class="visually-hidden">{label}</span></summary>\n'
        '    <div class="reading-panel">\n'
        '      <fieldset>\n'
        f'        <legend>{title}</legend>\n'
        f'        <p class="reading-description">{description}</p>\n'
        f'{controls}\n'
        '      </fieldset>\n'
        f'      <button type="button" class="reading-reset" data-reading-reset>{reset}</button>\n'
        '    </div>\n'
        '  </details>\n'
        f'</{container}>'
    )


def notfound_locale_template(locale_id: str) -> str:
    """Return inert, fully escaped 404 markup for one authored locale."""
    locale = load_json(CONTENT / "locales" / f"{locale_id}.json")
    language = LANG_BY_ID[locale_id]
    home_href = html.escape(page_path(locale_id, "index"), quote=True)
    ci_href = html.escape(page_path(locale_id, "ci") + "#b2", quote=True)
    template_id = html.escape(f"notfound-locale-{locale_id}", quote=True)
    html_lang = html.escape(language["html_lang"], quote=True)
    title = html.escape(locale["notfound"]["meta_title"], quote=True)
    primary = html.escape(IDENTITY["primary_name"])
    chinese_name = html.escape(IDENTITY["chinese_name"])
    skip = html.escape(locale["common"]["skip_content"])
    site_nav_label = html.escape(locale["common"]["site_nav_label"], quote=True)
    language_nav_label = html.escape(locale["common"]["language_nav_label"], quote=True)
    source = html.escape(locale["notfound"]["source"])
    line = html.escape(locale["notfound"]["line"])
    description = html.escape(locale["notfound"]["description"])
    home = html.escape(locale["notfound"]["home"])

    return (
        f'<template id="{template_id}" data-html-lang="{html_lang}" data-title="{title}">\n'
        f'  <a class="skip-link" href="#main">{skip}</a>\n'
        f'  {reading_tools(locale, inert=True)}\n'
        '  <div class="page-topbar" data-notfound-header>\n'
        f'    <a class="page-wordmark" href="{home_href}">{primary} '
        f'<span lang="zh-Hant-HK">{chinese_name}</span></a>\n'
        f'    <div class="page-nav" data-label="{site_nav_label}" data-notfound-nav>\n'
        f'      {portfolio_nav_html(locale_id, locale)}\n'
        '    </div>\n'
        f'    <div class="page-languages" data-label="{language_nav_label}" data-notfound-languages>\n'
        f'      {language_switcher(locale_id, "404")}\n'
        '    </div>\n'
        '  </div>\n'
        '  <div class="notfound-shell" data-notfound-main tabindex="-1">\n'
        '    <p class="notfound-code" aria-hidden="true">404</p>\n'
        '    <div class="notfound-copy">\n'
        f'      <p class="notfound-source"><a href="{ci_href}">{source}</a></p>\n'
        f'      <h1>{line}</h1>\n'
        f'      <p class="notfound-description">{description}</p>\n'
        f'      <a class="notfound-home" href="{home_href}">{home}</a>\n'
        '    </div>\n'
        '  </div>\n'
        '</template>'
    )


def notfound_runtime() -> str:
    """Localise GitHub Pages' root custom 404 without parsing strings as HTML."""
    templates = "\n".join(notfound_locale_template(item["id"]) for item in LANGUAGES)
    locale_prefixes = {
        item["html_lang"]: ("" if item["id"] == ROOT_LOCALE else f"/{item['id']}")
        for item in LANGUAGES
    }
    prefixes_json = json.dumps(locale_prefixes, ensure_ascii=False, separators=(",", ":"))
    return (
        templates
        + '\n<script data-real-404-router>\n'
        '(() => {\n'
        '  const match = location.pathname.match(/^\\/(zh-hans|zh|ja|de|fr|ru)(?=\\/|$)/);\n'
        '  const localeId = match ? match[1] : "en";\n'
        '  const template = document.getElementById("notfound-locale-" + localeId);\n'
        '  if (!(template instanceof HTMLTemplateElement)) return;\n'
        '  const fragment = template.content.cloneNode(true);\n'
        '  const upgrade = (selector, tag, labelled = false) => {\n'
        '    const source = fragment.querySelector(selector);\n'
        '    if (!source) return null;\n'
        '    const element = document.createElement(tag);\n'
        '    element.className = source.className;\n'
        '    if (labelled && source.dataset.label) element.ariaLabel = source.dataset.label;\n'
        '    while (source.firstChild) element.append(source.firstChild);\n'
        '    source.replaceWith(element);\n'
        '    return element;\n'
        '  };\n'
        '  const readingTools = upgrade(".reading-tools", "aside", true);\n'
        '  upgrade(".page-nav", "nav", true);\n'
        '  const languageNav = upgrade(".page-languages", "nav", true);\n'
        '  const topbar = upgrade(".page-topbar", "header");\n'
        '  const main = upgrade(".notfound-shell", "main");\n'
        '  if (main) { main.id = "main"; main.tabIndex = -1; }\n'
        '  for (const [selector, replacement] of [\n'
        '    [".skip-link", fragment.querySelector(".skip-link")],\n'
        '    [".reading-tools", readingTools],\n'
        '    [".page-topbar", topbar],\n'
        '    [".notfound-shell", main],\n'
        '  ]) {\n'
        '    const current = document.querySelector(selector);\n'
        '    if (current && replacement) current.replaceWith(replacement);\n'
        '  }\n'
        '  document.documentElement.lang = template.dataset.htmlLang || "en-GB";\n'
        '  document.title = template.dataset.title || document.title;\n'
        '  document.body.className = "notfound-page locale-" + localeId;\n'
        '  let tail = location.pathname;\n'
        '  if (localeId !== "en") tail = tail.slice(localeId.length + 1) || "/";\n'
        '  tail = "/" + tail.replace(/^\\/+/, "");\n'
        f'  const prefixes = {prefixes_json};\n'
        '  if (!languageNav) return;\n'
        '  for (const link of languageNav.querySelectorAll("a[hreflang]")) {\n'
        '    const prefix = prefixes[link.getAttribute("hreflang")];\n'
        '    if (prefix === undefined) continue;\n'
        '    link.href = prefix + tail;\n'
        '  }\n'
        '})();\n'
        '</script>'
    )


def specials_for(locale_id: str, page: str, locale: dict[str, Any]) -> dict[str, Any]:
    lang = LANG_BY_ID[locale_id]
    about = ABOUT_SITE[locale_id]
    contexts = CONTEXTS[locale_id]
    primary = IDENTITY["primary_name"]
    hero_name = html.escape(primary).replace(" ", "<br>", 1)
    alt_name = IDENTITY["alternate_names"][0]
    if page == "index":
        meta_title = locale["home"]["meta_title"]
        meta_description = locale["home"]["meta_description"]
        social_image = f"{BASE_URL}/assets/photos/03.jpg"
        social_alt = locale["home"]["photos"]["alt"]["03"]
        social_width, social_height, social_type = 1200, 800, "image/jpeg"
        og_type = "website"
        page_kind = "index"
    elif page in {"ci", "shi"}:
        meta_title = locale[page]["meta_title"]
        meta_description = locale[page]["meta_description"]
        social_path, social_width, social_height, social_type = SOCIAL_IMAGES[page]
        social_image = f"{BASE_URL}/{social_path}"
        social_alt = meta_title
        og_type = "article"
        page_kind = page
    elif page == "poetry-voucher":
        meta_title = POETRY_VOUCHER[locale_id]["title"] + " · Hanpu Li"
        meta_description = POETRY_VOUCHER[locale_id]["description"]
        social_image = f"{BASE_URL}/poetry-voucher/sample-voucher.png"
        social_alt = POETRY_VOUCHER[locale_id]["preview_alt"]
        social_width, social_height = png_dimensions(ROOT / "poetry-voucher" / "sample-voucher.png")
        social_type = "image/png"
        og_type, page_kind = "article", "poetry-voucher"
    elif page == "about":
        meta_title = about["meta_title"]
        meta_description = about["meta_description"]
        social_path, social_width, social_height, social_type = SOCIAL_IMAGES["about"]
        social_image = f"{BASE_URL}/{social_path}"
        social_alt = meta_title
        og_type = "website"
        page_kind = "about"
    elif page == "contexts":
        meta_title = CONTEXTS[locale_id]["meta_title"]
        meta_description = CONTEXTS[locale_id]["meta_description"]
        social_image = f"{BASE_URL}/assets/photos/03.jpg"
        social_alt = locale["home"]["photos"]["alt"]["03"]
        social_width, social_height, social_type = 1200, 800, "image/jpeg"
        og_type = "website"
        page_kind = "contexts"
    else:
        meta_title = locale["notfound"]["meta_title"]
        meta_description = ""
        social_image = ""
        social_alt = ""
        social_width, social_height, social_type = 0, 0, ""
        og_type = "website"
        page_kind = "index"

    canonical = absolute_url(locale_id, page)
    social_meta = (
        social_meta_html(
            locale_id=locale_id,
            title=meta_title,
            description=meta_description,
            url=canonical,
            image_url=social_image,
            image_alt=social_alt,
            width=social_width,
            height=social_height,
            image_type=social_type,
            og_type=og_type,
        )
        if page != "404"
        else ""
    )
    structured_data = (
        structured_data_html(
            locale_id=locale_id,
            page_kind=page_kind,
            title=meta_title,
            description=meta_description,
            url=canonical,
        )
        if page != "404"
        else ""
    )
    w2 = next(p for p in ci_source(locale_id)["poems"] if p["id"] == "w2")
    if locale_id in CHINESE_LOCALES:
        preview_body = html.escape(w2["source_body"])
    else:
        preview_body = html.escape(ci_translation(locale_id)["w2"]["body"])
    lede_note = locale["home"]["lede_note"].strip()
    hero_footnote_mark = '<sup class="hero-footnote-mark" aria-hidden="true">*</sup>' if lede_note else ""
    hero_footnote = (
        f'        <p class="hero-footnote" role="note"><span aria-hidden="true">*</span> {html.escape(lede_note)}</p>'
        if lede_note
        else ""
    )
    pv_receipt_width, pv_receipt_height = png_dimensions(ROOT / "poetry-voucher" / "sample-receipt.png")
    pv_voucher_width, pv_voucher_height = png_dimensions(ROOT / "poetry-voucher" / "sample-voucher.png")
    pv_editorial_width, pv_editorial_height = png_dimensions(ROOT / "assets" / "projects" / "poetry-voucher" / "poetry-voucher-paper-960.png")
    return {
        **{"PV_" + key.upper(): html.escape(value, quote=True) for key, value in POETRY_VOUCHER[locale_id].items()},
        "PV_HREF": page_path(locale_id, "poetry-voucher"),
        "PV_MAKE_URL": "/poetry-voucher/shop.html?lang=" + {"zh":"zh-Hant", "zh-hans":"zh-Hans"}.get(locale_id, locale_id),
        "PV_RECEIPT_WIDTH": str(pv_receipt_width),
        "PV_RECEIPT_HEIGHT": str(pv_receipt_height),
        "PV_VOUCHER_WIDTH": str(pv_voucher_width),
        "PV_VOUCHER_HEIGHT": str(pv_voucher_height),
        "PV_EDITORIAL_WIDTH": str(pv_editorial_width),
        "PV_EDITORIAL_HEIGHT": str(pv_editorial_height),
        "HTML_LANG": html.escape(lang["html_lang"], quote=True),
        "SOURCE_LANG": "zh-Hans" if locale_id == "zh-hans" else "zh-Hant-HK",
        "CI_GLYPH": "词" if locale_id == "zh-hans" else "詞",
        "SHI_GLYPH": "诗" if locale_id == "zh-hans" else "詩",
        "LOCALE": locale_id,
        "ASSET_PREFIX": "/" if page == "404" else asset_prefix(locale_id),
        "CANONICAL_URL": html.escape(canonical, quote=True),
        "HREFLANG_LINKS": hreflang_links(page),
        "OG_LOCALE": html.escape(lang["og_locale"], quote=True),
        "SOCIAL_META": social_meta,
        "STRUCTURED_DATA": structured_data,
        "ICON_LINKS": icon_links("/" if page in {"404", "poetry-voucher"} else asset_prefix(locale_id)),
        "FONT_PRELOADS": font_preloads(locale_id, page),
        "NOTFOUND_RUNTIME": notfound_runtime() if page == "404" and locale_id == ROOT_LOCALE else "",
        "READING_TOOLS": reading_tools(locale),
        "HERO_FOOTNOTE_MARK": hero_footnote_mark,
        "HERO_FOOTNOTE": hero_footnote,
        "SOCIAL_IMAGE_ALT": html.escape(locale["home"]["photos"]["alt"]["03"], quote=True),
        "PRIMARY_NAME": html.escape(primary),
        "PRIMARY_NAME_HERO": hero_name,
        "CHINESE_NAME": html.escape(IDENTITY["chinese_name"]),
        "ALT_NAME": html.escape(alt_name),
        "LOCATION": html.escape(locale["home"]["location"]),
        "EMAIL": html.escape(IDENTITY["email"], quote=True),
        "GITHUB_URL": html.escape(IDENTITY["github_url"], quote=True),
        "GITHUB_LABEL": html.escape(IDENTITY["github_label"]),
        "SITE_REPO_URL": html.escape(SHARED["site_repo_url"], quote=True),
        "SITE_YEAR": html.escape(SHARED["site_year"]),
        "ABOUT_HREF": page_path(locale_id, "about"),
        "ABOUT_LINK_LABEL": html.escape(about["footer_link"]),
        "ABOUT_META_TITLE": html.escape(about["meta_title"]),
        "ABOUT_META_TITLE_ATTR": html.escape(about["meta_title"], quote=True),
        "ABOUT_META_DESCRIPTION_ATTR": html.escape(about["meta_description"], quote=True),
        "ABOUT_EYEBROW": html.escape(about["eyebrow"]),
        "ABOUT_TITLE": html.escape(about["title"]),
        "ABOUT_LEDE": html.escape(about["lede"]),
        "ABOUT_PRINCIPLE": html.escape(about["principle"]),
        "ABOUT_TOC": about_toc_html(locale_id),
        "ABOUT_SECTIONS": about_sections_html(locale_id),
        "ABOUT_SCOPE_TITLE": html.escape(about["scope_title"]),
        "ABOUT_SCOPE_BODY": about_scope_body_html(locale_id),
        "ABOUT_PRIVACY_TITLE": html.escape(about["privacy_title"]),
        "ABOUT_PRIVACY_BODY": html.escape(about["privacy_body"]),
        "ABOUT_SOURCE_LINK": html.escape(about["source_link"]),
        "CONTEXTS_HREF": page_path(locale_id, "contexts"),
        "CONTEXTS_LINK_LABEL": html.escape(contexts["link_label"]),
        "CONTEXTS_META_TITLE": html.escape(contexts["meta_title"]),
        "CONTEXTS_META_DESCRIPTION_ATTR": html.escape(contexts["meta_description"], quote=True),
        "CONTEXTS_EYEBROW": html.escape(contexts["eyebrow"]),
        "CONTEXTS_TITLE": html.escape(contexts["title"]),
        "CONTEXTS_LEDE": html.escape(contexts["lede"]),
        "CONTEXTS_PRINCIPLE": html.escape(contexts["principle"]),
        "CONTEXTS_SECTIONS": contexts_sections_html(locale_id),
        "CONTEXTS_FOOTER_NOTE": html.escape(contexts["footer_note"]),
        "MATERIAL_URL": html.escape(SHARED["projects"]["material"]["url"], quote=True),
        "MATERIAL_GREEN_VALUE": html.escape(SHARED["projects"]["material"]["proof_values"]["green"]),
        "MATERIAL_NDVI_VALUE": html.escape(SHARED["projects"]["material"]["proof_values"]["ndvi"]),
        "MATERIAL_S106_VALUE": html.escape(SHARED["projects"]["material"]["proof_values"]["s106"]),
        "MATERIAL_STACK": html.escape(SHARED["projects"]["material"]["stack"]),
        "SCOPERAIL_URL": html.escape(SHARED["projects"]["scoperail"]["url"], quote=True),
        "SCOPERAIL_TITLE": html.escape(SHARED["projects"]["scoperail"]["title"]),
        "SCOPERAIL_STACK": html.escape(SHARED["projects"]["scoperail"]["stack"]),
        "FIRST_LOVE_VERIFY_URL": html.escape(
            SHARED["writing"]["first_love_verification_url"], quote=True
        ),
        "HOME_HREF": page_path(locale_id, "index"),
        "CI_HREF": page_path(locale_id, "ci"),
        "SHI_HREF": page_path(locale_id, "shi"),
        "TRAINSPOTTING_HREF": essay_page_path(locale_id),
        "LANG_SWITCHER": language_switcher(locale_id, page),
        "PORTFOLIO_NAV": portfolio_nav_html(
            locale_id,
            locale,
            current="ci" if page == "ci" else "shi" if page == "shi" else None,
            home_page=page == "index",
        ),
        "SCOPERAIL_FLOW": flow_html(locale["home"]["projects"]["scoperail"]["flow"]),
        "CHRONOLOGY": chronology_html(locale["home"]["chronology"]),
        "POETRY_PREVIEW_TITLE": locale["home"]["poetry"]["preview_title"],
        "POETRY_PREVIEW_BODY": preview_body,
        "POETRY_PREVIEW_DATE": locale["home"]["poetry"]["preview_date"],
        "SHI_SOURCE_HEADING": html.escape(
            SHI_SIMPLIFIED["title"] if locale_id == "zh-hans" else SHI_SOURCE["title"]
        ),
        "CI_TOC": ci_toc(locale_id, locale),
        "CI_POEMS": ci_poems_html(locale_id, locale),
        "SHI_DRAFTS": shi_drafts_html(locale_id),
        "SHI_DRAFTS_CLASS": (
            "source-only" if locale_id in CHINESE_LOCALES else "comparison"
        ),
    }


def render_page(locale_id: str, page: str, locale: dict[str, Any]) -> str:
    template = (TEMPLATES / f"{page}.html").read_text(encoding="utf-8")
    return render_template(template, locale, specials_for(locale_id, page, locale))


def build(check: bool = False) -> list[Path]:
    if set(POETRY_VOUCHER) != set(LANG_BY_ID):
        raise BuildError("Poetry Voucher locale mismatch")
    for lid, copy in POETRY_VOUCHER.items():
        validate_locale_schema(lid, copy, POETRY_VOUCHER["en"])
    en_locale = load_json(CONTENT / "locales" / "en.json")
    locales: dict[str, dict[str, Any]] = {}
    for language in LANGUAGES:
        lid = language["id"]
        path = CONTENT / "locales" / f"{lid}.json"
        if not path.exists():
            raise BuildError(f"missing locale file: {path}")
        locale = load_json(path)
        validate_locale_schema(lid, locale, en_locale)
        locales[lid] = locale

    expected_essay_locales = set(LANG_BY_ID)
    actual_essay_locales = set(TRAINSPOTTING_ESSAY)
    if actual_essay_locales != expected_essay_locales:
        missing = sorted(expected_essay_locales - actual_essay_locales)
        extra = sorted(actual_essay_locales - expected_essay_locales)
        raise BuildError(f"Trainspotting essay locale mismatch missing={missing} extra={extra}")

    actual_about_locales = set(ABOUT_SITE)
    if actual_about_locales != expected_essay_locales:
        missing = sorted(expected_essay_locales - actual_about_locales)
        extra = sorted(actual_about_locales - expected_essay_locales)
        raise BuildError(f"about-site locale mismatch missing={missing} extra={extra}")
    about_schema = schema_signature(ABOUT_SITE[ROOT_LOCALE])
    for lid in LANG_BY_ID:
        current = schema_signature(ABOUT_SITE[lid])
        if current != about_schema:
            missing = sorted(set(about_schema) - set(current))
            extra = sorted(set(current) - set(about_schema))
            mismatched = sorted(
                key for key in set(about_schema) & set(current)
                if about_schema[key] != current[key]
            )
            raise BuildError(
                f"about-site schema mismatch for {lid}: "
                f"missing={missing[:10]} extra={extra[:10]} type={mismatched[:10]}"
            )

    if set(CONTEXTS) != expected_essay_locales:
        missing = sorted(expected_essay_locales - set(CONTEXTS))
        extra = sorted(set(CONTEXTS) - expected_essay_locales)
        raise BuildError(f"contexts locale mismatch missing={missing} extra={extra}")
    contexts_schema = schema_signature(CONTEXTS[ROOT_LOCALE])
    for lid in LANG_BY_ID:
        current = schema_signature(CONTEXTS[lid])
        if current != contexts_schema:
            missing = sorted(set(contexts_schema) - set(current))
            extra = sorted(set(current) - set(contexts_schema))
            mismatched = sorted(
                key for key in set(contexts_schema) & set(current)
                if contexts_schema[key] != current[key]
            )
            raise BuildError(
                f"contexts schema mismatch for {lid}: "
                f"missing={missing[:10]} extra={extra[:10]} type={mismatched[:10]}"
            )

    changed: list[Path] = []
    for lid, locale in locales.items():
        if lid != ROOT_LOCALE:
            (ROOT / lid).mkdir(exist_ok=True)
        for page in PAGES:
            target = output_path(lid, page)
            if not check:
                target.parent.mkdir(parents=True, exist_ok=True)
            rendered = render_page(lid, page, locale)
            if not rendered.endswith("\n"):
                rendered += "\n"
            old = target.read_text(encoding="utf-8") if target.exists() else None
            if old != rendered:
                changed.append(target)
                if not check:
                    target.write_text(rendered, encoding="utf-8")

    essay_template = (TEMPLATES / "essay.html").read_text(encoding="utf-8")
    essay_body = (CONTENT / "essays" / "trainspotting.inc").read_text(encoding="utf-8")
    for lid, locale in locales.items():
        lang = LANG_BY_ID[lid]
        essay_copy = TRAINSPOTTING_ESSAY[lid]
        description = essay_copy["meta_description"]
        essay_title = "From Gears to Gasp · Hanpu Li"
        essay_url = essay_absolute_url(lid)
        social_path, social_width, social_height, social_type = SOCIAL_IMAGES["essay"]
        essay_social = social_meta_html(
            locale_id=lid,
            title=essay_title,
            description=description,
            url=essay_url,
            image_url=f"{BASE_URL}/{social_path}",
            image_alt=essay_title,
            width=social_width,
            height=social_height,
            image_type=social_type,
            og_type="article",
        )
        essay_structured_data = structured_data_html(
            locale_id=lid,
            page_kind="essay",
            title=essay_title,
            description=description,
            url=essay_url,
        )
        note = essay_copy["language_note"].strip()
        note_html = (
            f'<p class="essay-note" role="note">{html.escape(note)}</p>'
            if note
            else "<!-- English body; no language notice needed. -->"
        )
        essay_target = essay_output_path(lid)
        essay_target.parent.mkdir(parents=True, exist_ok=True)
        essay_rendered = render_template(
            essay_template,
            locale,
            {
                "HTML_LANG": html.escape(lang["html_lang"], quote=True),
                "LOCALE": lid,
                "OG_LOCALE": html.escape(lang["og_locale"], quote=True),
                "ESSAY_ASSET_PREFIX": essay_asset_prefix(lid),
                "ESSAY_HREFLANG_LINKS": essay_hreflang_links(),
                "SOCIAL_META": essay_social,
                "STRUCTURED_DATA": essay_structured_data,
                "ICON_LINKS": icon_links(essay_asset_prefix(lid)),
                "READING_TOOLS": reading_tools(locale),
                "PRIMARY_NAME": html.escape(IDENTITY["primary_name"]),
                "CHINESE_NAME": html.escape(IDENTITY["chinese_name"]),
                "HOME_HREF": page_path(lid, "index"),
                "WRITING_HREF": page_path(lid, "index") + "#writing",
                "ABOUT_HREF": page_path(lid, "about"),
                "ABOUT_LINK_LABEL": html.escape(ABOUT_SITE[lid]["footer_link"]),
                "ESSAY_LANG_SWITCHER": essay_language_switcher(lid),
                "PORTFOLIO_NAV": portfolio_nav_html(
                    lid,
                    locale,
                    current="writing",
                    home_page=False,
                ),
                "ESSAY_META_DESCRIPTION_ATTR": html.escape(description, quote=True),
                "ESSAY_LANGUAGE_NOTE": note_html,
                "ESSAY_BODY": essay_body,
                "ESSAY_CANONICAL": html.escape(essay_url, quote=True),
            },
        )
        if not essay_rendered.endswith("\n"):
            essay_rendered += "\n"
        old_essay = essay_target.read_text(encoding="utf-8") if essay_target.exists() else None
        if old_essay != essay_rendered:
            changed.append(essay_target)
            if not check:
                essay_target.write_text(essay_rendered, encoding="utf-8")

    sitemap_lines = ['<?xml version="1.0" encoding="UTF-8"?>',
                     '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for language in LANGUAGES:
        for page in ("index", "ci", "shi", "about", "contexts", "poetry-voucher"):
            sitemap_lines.append(f'  <url><loc>{html.escape(absolute_url(language["id"], page))}</loc></url>')
        sitemap_lines.append(f'  <url><loc>{html.escape(BASE_URL + essay_page_path(language["id"]))}</loc></url>')
    sitemap_lines.append("</urlset>")
    sitemap = "\n".join(sitemap_lines) + "\n"
    sitemap_path = ROOT / "sitemap.xml"
    old_sitemap = sitemap_path.read_text(encoding="utf-8") if sitemap_path.exists() else None
    if old_sitemap != sitemap:
        changed.append(sitemap_path)
        if not check:
            sitemap_path.write_text(sitemap, encoding="utf-8")

    app_sources = [(TEMPLATES / 'poetry-voucher-studio.html', ROOT / 'poetry-voucher' / 'make.html'),
                   (TEMPLATES / 'poetry-voucher-shop.html', ROOT / 'poetry-voucher' / 'shop.html'),
                   (TEMPLATES / 'poetry-voucher-shop.html', ROOT / 'poetry-voucher' / 'order.html')]
    # Explicit public bundle: never sweep private printer files into the output.
    app_sources += [(CONTENT / 'poetry-voucher-app' / name, ROOT / 'poetry-voucher' / name)
                    for name in ('gallery.js', 'i18n.js', 'editions.json', 'studio.css', 'shop.js', 'shop-copy.js', 'shop.css')]
    for source, target in app_sources:
        data = source.read_bytes()
        if target.name == 'order.html':
            data = data.replace(b'data-page="shop"', b'data-page="order"').replace(b'<div id="shop-front">', b'<div id="shop-front" hidden>').replace(b'aria-labelledby="order-heading" hidden', b'aria-labelledby="order-heading"').replace(b'/poetry-voucher/shop.html">\n<link rel="stylesheet"', b'/poetry-voucher/order.html">\n<link rel="stylesheet"')
        if not target.exists() or target.read_bytes() != data:
            changed.append(target)
            if not check:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if generated files are stale")
    args = parser.parse_args()
    try:
        changed = build(check=args.check)
    except (BuildError, FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"build_site: ERROR: {exc}", file=sys.stderr)
        return 2
    if args.check and changed:
        print("build_site: generated files are stale:", file=sys.stderr)
        for path in changed:
            print(f"  {path.relative_to(ROOT)}", file=sys.stderr)
        return 1
    if changed and not args.check:
        print(f"build_site: wrote {len(changed)} generated files")
        for path in changed:
            print(f"  {path.relative_to(ROOT)}")
    else:
        print("build_site: generated files already current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
