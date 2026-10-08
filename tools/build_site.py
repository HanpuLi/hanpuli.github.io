#!/usr/bin/env python3
"""Build the multilingual static portfolio from structured content.

English is emitted at the site root. Other locales are emitted under /<locale>/.
The generated documents contain the core multilingual reading content. Runtime
progressive enhancements are isolated from the static i18n renderer.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path
from typing import Any

from first_love_public_pages import build as build_first_love_pages, path_for as first_love_page_path
from design_plates import site_html as design_site, voucher_html as design_voucher, specimen_css
from editorial_notes import sections_html as editorial_sections, references_html as editorial_references, project_toc
from poetry_library import Library, materialize as materialize_poetry
from poetry_pages import Pages as PoetryPages

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
POETRY = Library(ROOT)
SUMMER_TEXT = POETRY.texts['summer-2017-revised-20261008']
SUMMER_POEM = {'id':'summer-2017', **POETRY.data['summer_metadata'],
    'texts':{**{lid:edition['body'] for lid,edition in SUMMER_TEXT['editions'].items()},
             'zh-hans':POETRY.edition(SUMMER_TEXT['id'],'zh-hans')['body']}}
ESSAY_REGISTRY = load_json(CONTENT / "essays.json")["essays"]
ESSAY_METADATA = {
    item["slug"]: load_json(CONTENT / item["metadata"])
    for item in ESSAY_REGISTRY
}
ABOUT_SITE = load_json(CONTENT / "about-site.json")
CONTEXTS = load_json(CONTENT / "contexts.json")
POETRY_VOUCHER = load_json(CONTENT / "poetry-voucher.json")
CHINESE_LOCALES = {"zh", "zh-hans"}
BASE_URL = IDENTITY["site_url"].rstrip("/")
PERSON_ID = f"{BASE_URL}/#person"
WEBSITE_ID = f"{BASE_URL}/#website"
ICON_VERSION = "20260930a"
SOCIAL_IMAGES = {
    "site": ("assets/social/site.png", 1200, 630, "image/png"),
    "ci": ("assets/social/ci.png", 1200, 630, "image/png"),
    "shi": ("assets/social/shi.png", 1200, 630, "image/png"),
    "about": ("assets/social/about.png", 1200, 630, "image/png"),
    "contexts": ("assets/social/contexts.png", 1200, 630, "image/png"),
    "poetry-voucher": ("assets/social/poetry-voucher.png", 1200, 630, "image/png"),
}


class BuildError(RuntimeError):
    pass


def essay_display_title_html(value: str, *, slug: str, locale_id: str) -> str:
    """Escape a localized discovery title while permitting unnested <em> only."""
    output: list[str] = []
    depth = 0
    for part in re.split(r"(</?em>)", value):
        if part == "<em>":
            if depth:
                raise BuildError(f"{slug} {locale_id}: nested <em> in display_title")
            depth = 1
            output.append(part)
        elif part == "</em>":
            if not depth:
                raise BuildError(f"{slug} {locale_id}: unmatched </em> in display_title")
            depth = 0
            output.append(part)
        else:
            output.append(html.escape(part))
    if depth:
        raise BuildError(f"{slug} {locale_id}: unclosed <em> in display_title")
    return "".join(output)


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


def essay_page_path(locale_id: str, slug: str) -> str:
    if locale_id == ROOT_LOCALE:
        return f"/writing/{slug}/"
    return f"/{locale_id}/writing/{slug}/"


def essay_absolute_url(locale_id: str, slug: str) -> str:
    return BASE_URL + essay_page_path(locale_id, slug)


def essay_output_path(locale_id: str, slug: str) -> Path:
    folder = ROOT if locale_id == ROOT_LOCALE else ROOT / locale_id
    return folder / "writing" / slug / "index.html"


def essay_asset_prefix(locale_id: str) -> str:
    return "../../" if locale_id == ROOT_LOCALE else "../../../"


def essay_language_switcher(locale_id: str, slug: str) -> str:
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
            href = html.escape(essay_page_path(lid, slug), quote=True)
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
    ("05", "other", "other-work"),
    ("06", "profile", "profile"),
)

PROJECT_ORDINALS = {
    "poetry_voucher": 1,
    "material": 2,
    "scoperail": 3,
}

PHOTO_NOTE_KEEP_TOGETHER = {
    "en": ("35 mm", "instant film"),
    "zh": ("35 mm", "即影即有"),
    "zh-hans": ("35 mm", "即时成像胶片"),
    "ja": ("35 mmフィルム", "インスタントフィルム"),
    "de": ("35-mm-Film", "Sofortbildfilm"),
    "fr": ("35 mm", "film instantané"),
    "ru": ("35 мм", "моментальная плёнка"),
}


def section_number(section_key: str) -> str:
    return next(
        number for number, key, _anchor in PORTFOLIO_NAV_ITEMS if key == section_key
    )


def project_number(project_key: str) -> str:
    return f"{section_number('work')}.{PROJECT_ORDINALS[project_key]}"


def photography_note_html(locale_id: str, note: str) -> str:
    rendered = html.escape(note)
    for phrase in PHOTO_NOTE_KEEP_TOGETHER[locale_id]:
        escaped_phrase = html.escape(phrase)
        if escaped_phrase not in rendered:
            raise BuildError(f"photography note is missing its protected phrase: {locale_id}/{phrase}")
        rendered = rendered.replace(
            escaped_phrase,
            f'<span class="keep-together">{escaped_phrase}</span>',
        )
    return rendered


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
            href = "#ci" if home_page else POETRY.path("", locale_id)
        elif key == "other":
            href = "#other-work" if home_page else f"{home}#other-work"
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


def essay_hreflang_links(slug: str) -> str:
    bits = []
    for language in LANGUAGES:
        href = html.escape(essay_absolute_url(language["id"], slug), quote=True)
        hreflang = html.escape(language["html_lang"], quote=True)
        bits.append(f'<link rel="alternate" hreflang="{hreflang}" href="{href}">')
    bits.append(
        f'<link rel="alternate" hreflang="x-default" '
        f'href="{html.escape(essay_absolute_url(ROOT_LOCALE, slug), quote=True)}">'
    )
    return "\n".join(bits)


def essay_cards_html(locale_id: str, locale: dict[str, Any]) -> str:
    cards = []
    for index, essay in enumerate(ESSAY_REGISTRY, start=2):
        slug = essay["slug"]
        href = html.escape(essay_page_path(locale_id, slug), quote=True)
        essay_copy = ESSAY_METADATA[slug][locale_id]
        title = essay_display_title_html(
            essay_copy["display_title"], slug=slug, locale_id=locale_id
        )
        description = html.escape(essay_copy["meta_description"])
        link_label = html.escape(locale["home"]["writing"]["film_essays_meta"])
        cards.append(
            "\n".join(
                [
                    "<article>",
                    f'  <p class="writing-no">01.{index}</p>',
                    f'  <h3><a href="{href}">{title}</a></h3>',
                    f"  <p>{description}</p>",
                    '  <div class="writing-footer">',
                    f'    <p class="writing-meta"><a href="{href}">{link_label}</a></p>',
                    "  </div>",
                    "</article>",
                ]
            )
        )
    return "\n".join(cards)


def icon_links() -> str:
    return (
        '<link rel="icon" href="/favicon.ico">\n'
        f'<link rel="icon" href="/assets/site-icon-32.png?v={ICON_VERSION}" type="image/png" sizes="32x32">\n'
        f'<link rel="icon" href="/assets/site-icon-64.png?v={ICON_VERSION}" type="image/png" sizes="64x64">\n'
        f'<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png?v={ICON_VERSION}" sizes="180x180">\n'
        '<link rel="manifest" href="/site.webmanifest">\n'
        '<meta name="application-name" content="Hanpu Li">\n'
        '<meta name="apple-mobile-web-app-title" content="Hanpu Li">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
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
    image_url: str = "",
) -> str:
    language = LANG_BY_ID[locale_id]["html_lang"]
    person = {
        "@type": "Person",
        "@id": PERSON_ID,
        "name": IDENTITY["primary_name"],
        "alternateName": [IDENTITY["chinese_name"], *IDENTITY["alternate_names"]],
        "url": IDENTITY["site_url"],
        "image": f"{BASE_URL}/assets/site-icon-512.png",
        "sameAs": IDENTITY["same_as"],
        "knowsAbout": IDENTITY["knows_about"],
    }
    website = {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        "url": IDENTITY["site_url"],
        "name": IDENTITY["primary_name"],
        "image": f"{BASE_URL}/assets/site-icon-512.png",
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
            "summer-poem": "CreativeWork",
        }
        page_type = type_map[page_kind]
        node = {
            "@type": page_type,
            "@id": f"{url}#page",
            "url": url,
            "name": title,
            "description": description,
            "isPartOf": {"@id": WEBSITE_ID},
            "inLanguage": ("zh-Hans" if locale_id == "zh-hans" else "zh-Hant-HK") if page_kind == "summer-poem" else ("en-GB" if page_kind == "essay" else language),
        }
        if image_url:
            node["image"] = image_url
        if page_kind == "about":
            node["about"] = {"@id": PERSON_ID}
        elif page_kind == "essay":
            node["headline"] = title.removesuffix(f" · {IDENTITY['primary_name']}")
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


def material_title_html(locale_id: str, title: str) -> str:
    rendered = html.escape(title)
    if locale_id == "ja":
        for word in ("バーチャルプロダクション", "フットプリント"):
            rendered = rendered.replace(
                word, f'<span class="project-title-unit">{word}</span>'
            )
    return rendered


SUMMER_SLUG = "summer-2017"


def summer_page_path(locale_id: str) -> str:
    prefix = "/" if locale_id == ROOT_LOCALE else f"/{locale_id}/"
    return prefix + f"poetry/{SUMMER_SLUG}/"


def summer_output_path(locale_id: str) -> Path:
    folder = ROOT if locale_id == ROOT_LOCALE else ROOT / locale_id
    return folder / "poetry" / SUMMER_SLUG / "index.html"


def summer_hreflang_links() -> str:
    result = []
    for language in LANGUAGES:
        lid = language["id"]
        href = html.escape(BASE_URL + summer_page_path(lid), quote=True)
        lang = html.escape(language["html_lang"], quote=True)
        result.append(f'<link rel="alternate" hreflang="{lang}" href="{href}">')
    result.append(f'<link rel="alternate" hreflang="x-default" href="{BASE_URL + summer_page_path(ROOT_LOCALE)}">')
    return "\n".join(result)


def summer_language_switcher(locale_id: str) -> str:
    bits = []
    for language in LANGUAGES:
        lid = language["id"]
        label = html.escape(language["short"])
        title = html.escape(language["label"], quote=True)
        target_lang = html.escape(language["html_lang"], quote=True)
        if lid == locale_id:
            bits.append(
                f'<span class="current" lang="{target_lang}" aria-current="page" title="{title}">'
                f'<span class="language-short" aria-hidden="true">{label}</span>'
                f'<span class="visually-hidden">{title}</span></span>'
            )
        else:
            href = html.escape(summer_page_path(lid), quote=True)
            bits.append(f'<a href="{href}" hreflang="{target_lang}" lang="{target_lang}" aria-label="{title}" title="{title}">'
                        f'<span class="language-short" aria-hidden="true">{label}</span></a>')
    return "\n      ".join(bits)


def summer_source(locale_id: str) -> tuple[str, str]:
    # Interface localisation is not a substitute for a literary translation.
    if locale_id not in SUMMER_POEM["texts"]:
        raise BuildError(f"summer poem: missing published text for {locale_id}")
    return SUMMER_POEM["texts"][locale_id], LANG_BY_ID[locale_id]["html_lang"]


def summer_body_html(locale_id: str) -> str:
    body, _source_lang = summer_source(locale_id)
    sections = body.split("\n\n")
    if len(sections) != 18 or sections[6] != sections[13]:
        raise BuildError("summer poem: expected 18 stanzas and two identical refrains")
    original_shape = [len(block.splitlines()) for block in SUMMER_POEM["texts"]["zh"].split("\n\n")]
    if [len(block.splitlines()) for block in sections] != original_shape:
        raise BuildError(f"summer poem: {locale_id} changes the authored stanza/line structure")
    upper = [sections[0], *sections[1:6], sections[6]]
    lower = [sections[7], *sections[8:13], sections[13]]
    if len(upper) != len(lower) or any(
        len(first.splitlines()) != len(second.splitlines())
        for first, second in zip(upper, lower)
    ):
        raise BuildError("summer poem: upper and lower halves must have matching stanza lines")
    parts = []
    for name, stanzas in (("upper", upper), ("lower", lower)):
        units = []
        for idx, block in enumerate(stanzas):
            kind = "summer-question" if idx == 0 else "summer-stanza summer-refrain" if idx == 6 else "summer-stanza"
            units.append(f'        <p class="{kind}">{html.escape(block)}</p>')
        parts.append(f'      <div class="summer-half summer-{name}" data-half="{name}">\n'
                     + "\n".join(units) + '\n      </div>')
    coda = "\n".join(f'        <p class="summer-coda-stanza">{html.escape(block)}</p>' for block in sections[14:])
    return "\n".join(parts) + '\n      <div class="summer-coda">\n' + coda + '\n      </div>'


def render_summer_page(locale_id: str, locale: dict[str, Any], template: str) -> str:
    copy = SUMMER_POEM["locales"][locale_id]
    source, text_lang = summer_source(locale_id)
    poem_title = source.splitlines()[0]
    title = f'{poem_title} · {IDENTITY["primary_name"]}'
    absolute = BASE_URL + summer_page_path(locale_id)
    photo_path, width, height, kind = SOCIAL_IMAGES["site"]
    image_url = f"{BASE_URL}/{photo_path}"
    meta = social_meta_html(
        locale_id=locale_id, title=title, description=copy["description"],
        url=absolute, image_url=image_url, image_alt=title,
        width=width, height=height, image_type=kind, og_type="article",
    )
    structured = structured_data_html(
        locale_id=locale_id, page_kind="summer-poem",
        title=title, description=copy["description"], url=absolute, image_url=image_url,
    )
    preloads = font_preloads(locale_id, "shi").replace('href="assets/', 'href="/assets/').replace('href="../assets/', 'href="/assets/')
    shared = specials_for(locale_id, "shi", locale)
    shared.update({
        "SUMMER_META_TITLE": html.escape(title),
        "SUMMER_META_DESCRIPTION_ATTR": html.escape(copy["description"], quote=True),
        "SUMMER_CANONICAL": html.escape(absolute, quote=True),
        "SUMMER_HREFLANG_LINKS": summer_hreflang_links(),
        "SOCIAL_META": meta,
        "STRUCTURED_DATA": structured,
        "SUMMER_FONT_PRELOADS": preloads,
        "SUMMER_LANG_SWITCHER": summer_language_switcher(locale_id),
        "SUMMER_TITLE": html.escape(poem_title),
        "SUMMER_TEXT_LANG": text_lang,
        "SUMMER_ARCHIVE_LABEL": html.escape(copy["archive_label"]),
        "SUMMER_DATE": html.escape(copy["archive_date"]),
        "SUMMER_LANGUAGE_NOTE": html.escape(copy["original_notice"]),
        "SUMMER_ORIGINAL_LINK": (
            ' <a class="summer-original-link" href="' + summer_page_path("zh") + '">'
            + html.escape(copy["original_link_label"]) + '</a>'
            if locale_id not in ("zh", "zh-hans") else ""
        ),
        "SUMMER_BACK_LABEL": html.escape(copy["back_label"]),
        "SUMMER_BODY": summer_body_html(locale_id),
    })
    return render_template(template, locale, shared)



def about_sections_html(locale_id: str) -> str:
    copy = ABOUT_SITE[locale_id]
    return editorial_sections(copy["sections"], copy)


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
            credit = ""
            if not (section["id"] == "public-records" and record["credit"] == "Hanpu Li"):
                credit = (
                    f'            <p class="contexts-credit"><span>{html.escape(copy["credit_label"])}</span> '
                    f'{html.escape(record["credit"])}</p>\n'
                )
            records.append(
                '        <article class="contexts-record">\n'
                f'          <p class="contexts-date">{html.escape(record["date"])}</p>\n'
                '          <div class="contexts-record-main">\n'
                f'            <h3>{html.escape(record["title"])}</h3>\n'
                f'            <p class="contexts-detail">{html.escape(record["detail"])}</p>\n'
                f'{credit}'
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
        ("dyslexia", "dyslexia"),
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
    ci_href = html.escape(POETRY.work_url("jia-yi-b2",locale_id),quote=True)
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
        '  <div class="page-topbar" data-notfound-header>\n'
        f'    <a class="page-wordmark" href="{home_href}">{primary} '
        f'<span lang="zh-Hant-HK">{chinese_name}</span></a>\n'
        f'    <div class="page-nav" data-label="{site_nav_label}" data-notfound-nav>\n'
        f'      {portfolio_nav_html(locale_id, locale)}\n'
        '    </div>\n'
        '    <div class="page-utility">\n'
        f'      <div class="page-languages" data-label="{language_nav_label}" data-notfound-languages>\n'
        f'        {language_switcher(locale_id, "404")}\n'
        '      </div>\n'
        f'      {reading_tools(locale, inert=True)}\n'
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
        '  upgrade(".reading-tools", "aside", true);\n'
        '  upgrade(".page-nav", "nav", true);\n'
        '  const languageNav = upgrade(".page-languages", "nav", true);\n'
        '  const topbar = upgrade(".page-topbar", "header");\n'
        '  const main = upgrade(".notfound-shell", "main");\n'
        '  if (main) { main.id = "main"; main.tabIndex = -1; }\n'
        '  for (const [selector, replacement] of [\n'
        '    [".skip-link", fragment.querySelector(".skip-link")],\n'
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
    alt_name = IDENTITY["alternate_names"][0] if IDENTITY["alternate_names"] else ""
    if page == "index":
        meta_title = locale["home"]["meta_title"]
        meta_description = locale["home"]["meta_description"]
        social_path, social_width, social_height, social_type = SOCIAL_IMAGES["site"]
        social_image = f"{BASE_URL}/{social_path}"
        social_alt = meta_title
        og_type = "website"
        page_kind = "index"
    elif page == "poetry-voucher":
        meta_title = POETRY_VOUCHER[locale_id]["title"] + " · Hanpu Li"
        meta_description = POETRY_VOUCHER[locale_id]["description"]
        social_path, social_width, social_height, social_type = SOCIAL_IMAGES["poetry-voucher"]
        social_image = f"{BASE_URL}/{social_path}"
        social_alt = meta_title
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
        social_path, social_width, social_height, social_type = SOCIAL_IMAGES["contexts"]
        social_image = f"{BASE_URL}/{social_path}"
        social_alt = meta_title
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
            image_url=social_image,
        )
        if page != "404"
        else ""
    )
    preview_body = html.escape(POETRY.edition('zhegutian-20260909-text', locale_id)['body'])
    lede_note = locale["home"]["lede_note"].strip()
    hero_footnote_mark = '<sup class="hero-footnote-mark" aria-hidden="true">*</sup>' if lede_note else ""
    hero_footnote = (
        f'        <p class="hero-footnote" role="note"><span aria-hidden="true">*</span> {html.escape(lede_note)}</p>'
        if lede_note
        else ""
    )
    pv_receipt_width, pv_receipt_height = png_dimensions(ROOT / "poetry-voucher" / "sample-receipt.png")
    pv_voucher_width, pv_voucher_height = png_dimensions(ROOT / "poetry-voucher" / "sample-voucher.png")
    pv_full_path = ROOT / "poetry-voucher" / "sample-full.png"
    pv_full_width, pv_full_height = png_dimensions(pv_full_path)
    physical_dimensions = {}
    for edition in ("b3", "b4"):
        width, height = png_dimensions(ROOT / "assets/projects/poetry-voucher" / f"physical-{edition}.png")
        physical_dimensions.update({f"PV_PHYSICAL_{edition.upper()}_WIDTH": str(width), f"PV_PHYSICAL_{edition.upper()}_HEIGHT": str(height)})
    pv_editorial_width, pv_editorial_height = png_dimensions(ROOT / "assets" / "projects" / "poetry-voucher" / "poetry-voucher-paper-960.png")
    return {
        **{"PV_" + key.upper(): html.escape(value, quote=True) for key, value in POETRY_VOUCHER[locale_id].items() if isinstance(value, str)},
        **physical_dimensions,
        "DESIGN_SITE": design_site(locale_id),
        "DESIGN_VOUCHER": design_voucher(locale_id),
        "PV_HREF": page_path(locale_id, "poetry-voucher"),
        "PV_TOC": project_toc(POETRY_VOUCHER[locale_id]),
        "PV_NOTES": editorial_sections(POETRY_VOUCHER[locale_id]["notes"], POETRY_VOUCHER[locale_id], project=True),
        "PV_REFERENCES": editorial_references(POETRY_VOUCHER[locale_id]["notes"], POETRY_VOUCHER[locale_id]),
        "PV_SECTION_NUMBER": section_number("work"),
        "PV_PROJECT_NUMBER": project_number("poetry_voucher"),
        "MATERIAL_PROJECT_NUMBER": project_number("material"),
        "SCOPERAIL_PROJECT_NUMBER": project_number("scoperail"),
        "PHOTO_NOTE": photography_note_html(locale_id, locale["home"]["photos"]["note"]),
        "PV_MAKE_URL": "/poetry-voucher/shop.html?lang=" + {"zh":"zh-Hant", "zh-hans":"zh-Hans"}.get(locale_id, locale_id),
        "PV_RECEIPT_WIDTH": str(pv_receipt_width),
        "PV_RECEIPT_HEIGHT": str(pv_receipt_height),
        "PV_VOUCHER_WIDTH": str(pv_voucher_width),
        "PV_VOUCHER_HEIGHT": str(pv_voucher_height),
        "PV_FULL_WIDTH": str(pv_full_width),
        "PV_FULL_HEIGHT": str(pv_full_height),
        "PV_EDITORIAL_WIDTH": str(pv_editorial_width),
        "PV_EDITORIAL_HEIGHT": str(pv_editorial_height),
        "HTML_LANG": html.escape(lang["html_lang"], quote=True),
        "GOOGLE_SITE_VERIFICATION": (
            f'\n<meta name="google-site-verification" content="{html.escape(IDENTITY["google_site_verification"], quote=True)}">'
            if page == "index" and locale_id == ROOT_LOCALE and IDENTITY.get("google_site_verification")
            else ""
        ),
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
        "ICON_LINKS": icon_links(),
        "FONT_PRELOADS": font_preloads(locale_id, page),
        "NOTFOUND_RUNTIME": notfound_runtime() if page == "404" and locale_id == ROOT_LOCALE else "",
        "READING_TOOLS": reading_tools(locale),
        "HERO_FOOTNOTE_MARK": hero_footnote_mark,
        "HERO_FOOTNOTE": hero_footnote,
        "HERO_ALIAS": (
            f'        <p>{html.escape(locale["home"]["alias"])}</p>'
            if locale["home"]["alias"]
            else ""
        ),
        "SOCIAL_IMAGE_ALT": html.escape(locale["home"]["photos"]["alt"]["03"], quote=True),
        "PRIMARY_NAME": html.escape(primary),
        "PRIMARY_NAME_HERO": hero_name,
        "CHINESE_NAME": html.escape(IDENTITY["chinese_name"]),
        "ALT_NAME": html.escape(alt_name),
        "LOCATION": html.escape(locale["home"]["location"]),
        "FOOTER_ALT_LINE": (
            f'      <p>{html.escape(alt_name)} · {html.escape(locale["home"]["location"])}</p>'
            if alt_name
            else ""
        ),
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
        "ABOUT_DESIGN_TITLE": html.escape(about["design_title"]),
        "ABOUT_DESIGN_READING_LABEL": html.escape(about["design_reading_label"]),
        "ABOUT_DESIGN_READING_SAMPLE": html.escape(about["design_reading_sample"]),
        "ABOUT_DESIGN_READING_NOTE": html.escape(about["design_reading_note"]),
        "ABOUT_DESIGN_META_LABEL": html.escape(about["design_meta_label"]),
        "ABOUT_DESIGN_META_SAMPLE": html.escape(about["design_meta_sample"]),
        "ABOUT_DESIGN_META_NOTE": html.escape(about["design_meta_note"]),
        "ABOUT_DESIGN_GRID_LABEL": html.escape(about["design_grid_label"]),
        "ABOUT_DESIGN_GRID_NOTE": html.escape(about["design_grid_note"]),
        "ABOUT_DESIGN_RULE_LABEL": html.escape(about["design_rule_label"]),
        "ABOUT_DESIGN_RULE_NOTE": html.escape(about["design_rule_note"]),
        "ABOUT_TOC": about_toc_html(locale_id),
        "ABOUT_SECTIONS": about_sections_html(locale_id),
        "ABOUT_REFERENCES": editorial_references(about["sections"], about),
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
        "MATERIAL_TITLE": material_title_html(
            locale_id, locale["home"]["projects"]["material"]["title"]
        ),
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
        "FIRST_LOVE_HREF": first_love_page_path(locale_id, "request"),
        "FIRST_LOVE_ABSTRACT_HREF": first_love_page_path(locale_id, "request"),
        "HOME_HREF": page_path(locale_id, "index"),
        "CI_HREF": POETRY.path("", locale_id),
        "B2_HREF": POETRY.work_url("jia-yi-b2",locale_id),
        "B3_HREF": POETRY.work_url("jia-yi-b3",locale_id),
        "B4_HREF": POETRY.work_url("jia-yi-b4",locale_id),
        "POETRY_FIRST_HREF": POETRY.work_url("zhegutian-20260909",locale_id),
        "POETRY_SECOND_HREF": POETRY.work_url("linjiangxian-20260909",locale_id),
        "POETRY_COLLECTION_HREF": POETRY.path("jia-yi",locale_id),
        "SHI_HREF": POETRY.path("",locale_id),
        "TRAINSPOTTING_HREF": essay_page_path(locale_id, "trainspotting"),
        "ESSAY_CARDS": essay_cards_html(locale_id, locale),
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

    }


def render_page(locale_id: str, page: str, locale: dict[str, Any]) -> str:
    if page in {"ci", "shi"}:
        return PoetryPages(sys.modules[__name__]).legacy(page,locale_id,locale)
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
    essay_slugs = [item.get("slug") for item in ESSAY_REGISTRY]
    if len(essay_slugs) != len(set(essay_slugs)):
        raise BuildError("essay registry contains duplicate slugs")
    if "trainspotting" not in essay_slugs:
        raise BuildError("essay registry must retain the trainspotting route")
    for item in ESSAY_REGISTRY:
        missing_fields = [
            field for field in ("slug", "title", "source", "metadata", "social_image")
            if not isinstance(item.get(field), str) or not item[field].strip()
        ]
        if missing_fields:
            raise BuildError(f"essay registry entry missing fields: {missing_fields}")
        slug = item["slug"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            raise BuildError(f"invalid essay slug: {slug}")
        source_path = CONTENT / item["source"]
        if not source_path.is_file():
            raise BuildError(f"missing essay source: {source_path}")
        metadata = ESSAY_METADATA[slug]
        actual_essay_locales = set(metadata)
        if actual_essay_locales != expected_essay_locales:
            missing = sorted(expected_essay_locales - actual_essay_locales)
            extra = sorted(actual_essay_locales - expected_essay_locales)
            raise BuildError(
                f"{slug} essay locale mismatch missing={missing} extra={extra}"
            )
        for lid, copy in metadata.items():
            for key in ("display_title", "meta_description", "language_note"):
                if not isinstance(copy.get(key), str):
                    raise BuildError(f"{slug} {lid}: {key} must be a string")
            if not copy["display_title"].strip():
                raise BuildError(f"{slug} {lid}: display_title must not be empty")
            essay_display_title_html(copy["display_title"], slug=slug, locale_id=lid)
            if lid != ROOT_LOCALE and not copy["language_note"].strip():
                raise BuildError(f"{slug} {lid}: missing English-body notice")

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

    if set(SUMMER_POEM["locales"]) != set(LANG_BY_ID):
        raise BuildError("summer poem: missing locale metadata")
    for lid, copy in SUMMER_POEM["locales"].items():
        validate_locale_schema(lid, copy, SUMMER_POEM["locales"]["en"])
    if SUMMER_POEM["dates"] != {
        "original_start":"2017-11-06", "original_end":"2017-11-20",
        "original_draft":17, "revision":"2026-10-08",
    }:
        raise BuildError("summer poem: publication dates changed unexpectedly")
    changed: list[Path] = materialize_poetry(check=check)
    poetry_pages = PoetryPages(sys.modules[__name__])
    changed.extend(poetry_pages.build(locales,check=check))
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
    for essay in ESSAY_REGISTRY:
        slug = essay["slug"]
        essay_body = (CONTENT / essay["source"]).read_text(encoding="utf-8")
        social_path = essay["social_image"]
        social_width, social_height = png_dimensions(ROOT / social_path)
        for lid, locale in locales.items():
            lang = LANG_BY_ID[lid]
            essay_copy = ESSAY_METADATA[slug][lid]
            description = essay_copy["meta_description"]
            essay_title = f"{essay['title']} · {IDENTITY['primary_name']}"
            essay_url = essay_absolute_url(lid, slug)
            essay_social = social_meta_html(
                locale_id=lid,
                title=essay_title,
                description=description,
                url=essay_url,
                image_url=f"{BASE_URL}/{social_path}",
                image_alt=essay_title,
                width=social_width,
                height=social_height,
                image_type="image/png",
                og_type="article",
            )
            essay_structured_data = structured_data_html(
                locale_id=lid,
                page_kind="essay",
                title=essay_title,
                description=description,
                url=essay_url,
                image_url=f"{BASE_URL}/{social_path}",
            )
            note = essay_copy["language_note"].strip()
            note_html = (
                f'<p class="essay-note" role="note">{html.escape(note)}</p>'
                if note
                else "<!-- English body; no language notice needed. -->"
            )
            essay_target = essay_output_path(lid, slug)
            essay_target.parent.mkdir(parents=True, exist_ok=True)
            essay_rendered = render_template(
                essay_template,
                locale,
                {
                    "HTML_LANG": html.escape(lang["html_lang"], quote=True),
                    "LOCALE": lid,
                    "OG_LOCALE": html.escape(lang["og_locale"], quote=True),
                    "ESSAY_PAGE_TITLE": html.escape(essay_title),
                    "ESSAY_ASSET_PREFIX": essay_asset_prefix(lid),
                    "ESSAY_HREFLANG_LINKS": essay_hreflang_links(slug),
                    "SOCIAL_META": essay_social,
                    "STRUCTURED_DATA": essay_structured_data,
                    "ICON_LINKS": icon_links(),
                    "READING_TOOLS": reading_tools(locale),
                    "PRIMARY_NAME": html.escape(IDENTITY["primary_name"]),
                    "CHINESE_NAME": html.escape(IDENTITY["chinese_name"]),
                    "HOME_HREF": page_path(lid, "index"),
                    "WRITING_HREF": page_path(lid, "index") + "#writing",
                    "ABOUT_HREF": page_path(lid, "about"),
                    "ABOUT_LINK_LABEL": html.escape(ABOUT_SITE[lid]["footer_link"]),
                    "ESSAY_LANG_SWITCHER": essay_language_switcher(lid, slug),
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

    summer_template = (TEMPLATES / "summer-poem.html").read_text(encoding="utf-8")
    for lid, locale in locales.items():
        target = summer_output_path(lid)
        content = render_summer_page(lid, locale, summer_template)
        if not content.endswith("\n"):
            content += "\n"
        old = target.read_text(encoding="utf-8") if target.exists() else None
        if old != content:
            changed.append(target)
            if not check:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")

    def sitemap_entry(location: str, variants: dict[str, str], x_default: str) -> list[str]:
        rows = ["  <url>", f"    <loc>{html.escape(location, quote=True)}</loc>"]
        for language in LANGUAGES:
            hreflang = html.escape(language["html_lang"], quote=True)
            href = html.escape(variants[language["id"]], quote=True)
            rows.append(
                f'    <xhtml:link rel="alternate" hreflang="{hreflang}" href="{href}" />'
            )
        rows.append(
            f'    <xhtml:link rel="alternate" hreflang="x-default" '
            f'href="{html.escape(x_default, quote=True)}" />'
        )
        rows.append("  </url>")
        return rows

    standard_pages = ("index", "about", "contexts", "poetry-voucher")
    standard_variants = {
        page: {language["id"]: absolute_url(language["id"], page) for language in LANGUAGES}
        for page in standard_pages
    }
    essay_variants = {
        essay["slug"]: {
            language["id"]: BASE_URL + essay_page_path(language["id"], essay["slug"])
            for language in LANGUAGES
        }
        for essay in ESSAY_REGISTRY
    }
    poetry_variants = {
        route: {language['id']: BASE_URL + POETRY.path(route,language['id']) for language in LANGUAGES}
        for route in POETRY.routes() if route != 'summer-2017'
    }
    summer_variants = {
        language["id"]: BASE_URL + summer_page_path(language["id"])
        for language in LANGUAGES
    }
    first_love_variants = {
        language["id"]: BASE_URL + first_love_page_path(language["id"], "request")
        for language in LANGUAGES
    }

    sitemap_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ]
    for language in LANGUAGES:
        lid = language["id"]
        for page in standard_pages:
            variants = standard_variants[page]
            sitemap_lines.extend(
                sitemap_entry(variants[lid], variants, variants[ROOT_LOCALE])
            )
        for variants in poetry_variants.values():
            sitemap_lines.extend(sitemap_entry(variants[lid],variants,variants[ROOT_LOCALE]))
        for variants in essay_variants.values():
            sitemap_lines.extend(
                sitemap_entry(
                    variants[lid],
                    variants,
                    variants[ROOT_LOCALE],
                )
            )
        sitemap_lines.extend(
            sitemap_entry(
                first_love_variants[lid],
                first_love_variants,
                first_love_variants[ROOT_LOCALE],
            )
        )
        sitemap_lines.extend(
            sitemap_entry(
                summer_variants[lid],
                summer_variants,
                summer_variants[ROOT_LOCALE],
            )
        )
    sitemap_lines.append("</urlset>")
    sitemap = "\n".join(sitemap_lines) + "\n"
    sitemap_path = ROOT / "sitemap.xml"
    old_sitemap = sitemap_path.read_text(encoding="utf-8") if sitemap_path.exists() else None
    if old_sitemap != sitemap:
        changed.append(sitemap_path)
        if not check:
            sitemap_path.write_text(sitemap, encoding="utf-8")

    app_sources = [(TEMPLATES / 'poetry-voucher-retired.html', ROOT / 'poetry-voucher' / 'make.html'),
                   (TEMPLATES / 'poetry-voucher-shop.html', ROOT / 'poetry-voucher' / 'shop.html'),
                   (TEMPLATES / 'poetry-voucher-shop.html', ROOT / 'poetry-voucher' / 'order.html')]
    # Explicit public bundle: never sweep private printer files into the output.
    app_sources += [(CONTENT / 'poetry-voucher-app' / name, ROOT / 'poetry-voucher' / name)
                    for name in ('gallery.js', 'i18n.js', 'editions.json', 'studio.css', 'shop.js', 'shop-copy.js', 'shop.css', 'accessibility.css', 'order-reading.js', 'order-core.js', 'h10-print.js', 'retired-studio.js')]
    for source, target in app_sources:
        data = source.read_bytes()
        if target.name == 'order.html':
            data = data.replace(b'data-page="shop"', b'data-page="order"').replace(b'<div id="shop-front">', b'<div id="shop-front" hidden>').replace(b'aria-labelledby="order-heading" hidden', b'aria-labelledby="order-heading"').replace(b'/poetry-voucher/shop.html">\n<link rel="stylesheet"', b'/poetry-voucher/order.html">\n<link rel="stylesheet"')
        if not target.exists() or target.read_bytes() != data:
            changed.append(target)
            if not check:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
    design_css_path = ROOT / "assets" / "design" / "specimen-type.css"
    design_css = specimen_css()
    if not design_css_path.exists() or design_css_path.read_text() != design_css:
        changed.append(design_css_path)
        if not check:
            design_css_path.write_text(design_css)
    from voucher_publication import build_publication
    changed.extend(build_publication(ROOT, check=check))
    changed.extend(build_first_love_pages(ROOT, check=check))
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
