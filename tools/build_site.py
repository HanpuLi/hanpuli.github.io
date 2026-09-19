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
PAGES = ("index", "ci", "shi", "404")


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


IDENTITY = load_json(CONTENT / "identity.json")
SHARED = load_json(CONTENT / "shared.json")
LANGUAGES = load_json(CONTENT / "languages.json")
LANG_BY_ID = {item["id"]: item for item in LANGUAGES}
CI_SOURCE = load_json(CONTENT / "ci-source.json")
SHI_SOURCE = load_json(CONTENT / "shi-source.json")
BASE_URL = IDENTITY["site_url"].rstrip("/")


class BuildError(RuntimeError):
    pass


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
    if page == "index":
        return "/" if locale_id == ROOT_LOCALE else f"/{locale_id}/"
    name = f"{page}.html"
    return f"/{name}" if locale_id == ROOT_LOCALE else f"/{locale_id}/{name}"


def absolute_url(locale_id: str, page: str) -> str:
    return BASE_URL + page_path(locale_id, page)


def output_path(locale_id: str, page: str) -> Path:
    folder = ROOT if locale_id == ROOT_LOCALE else ROOT / locale_id
    return folder / ("index.html" if page == "index" else f"{page}.html")


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
                f'<span aria-hidden="true">{label}</span><span class="visually-hidden">{title}</span></span>'
            )
        else:
            href = html.escape(page_path(lid, page), quote=True)
            bits.append(
                f'<a href="{href}" hreflang="{lang_attr}" lang="{lang_attr}" '
                f'aria-label="{title}" title="{title}">{label}</a>'
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


def ci_translation(locale_id: str) -> dict[str, dict[str, str]]:
    if locale_id == "en":
        return {poem["id"]: poem["en"] for poem in CI_SOURCE["poems"]}
    if locale_id == "zh":
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


def ci_toc(locale_id: str, locale: dict[str, Any]) -> str:
    cn_numbers = {1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "七", 8: "八", 9: "九", 10: "十"}
    out = []
    outside_n = 0
    for poem in CI_SOURCE["poems"]:
        pid = poem["id"]
        if pid in {"a10", "w2", "w3"}:
            outside_n += 1
            label = f'{locale["ci"]["outside"]}{cn_numbers[outside_n] if locale_id == "zh" else " " + str(outside_n)}'
            klass = ' class="waibian"'
        elif pid.startswith("a"):
            n = int(pid[1:])
            label = f'甲{cn_numbers[n]}' if locale_id == "zh" else f"A{n}"
            klass = ""
        elif pid.startswith("b"):
            n = int(pid[1:])
            label = f'乙{cn_numbers[n]}' if locale_id == "zh" else f"B{n}"
            klass = ""
        else:
            label = pid
            klass = ""
        out.append(f'<a href="#{pid}"{klass}>{html.escape(label)}</a>')
    return "".join(out)


def ci_poems_html(locale_id: str, locale: dict[str, Any]) -> str:
    translations = ci_translation(locale_id)
    blocks = []
    target_lang = LANG_BY_ID[locale_id]["html_lang"]
    for poem in CI_SOURCE["poems"]:
        voice = poem["voice"]
        classes = "poem" + (f" {voice}" if voice in {"jia", "yi"} else "")
        source_title = html.escape(poem["source_title"])
        source_body = html.escape(poem["source_body"])
        date = (
            f'\n    <div class="date" lang="zh-Hant-HK">{html.escape(poem["date"])}</div>'
            if poem.get("date") else ""
        )
        translation = ""
        if locale_id != "zh":
            item = translations[poem["id"]]
            translation = (
                f'\n    <div class="translation" lang="{html.escape(target_lang, quote=True)}">'
                f'<span class="et">{html.escape(item["title"])}</span>'
                f'{html.escape(item["body"])}</div>'
            )
        blocks.append(
            f'  <div class="{classes}" id="{poem["id"]}">\n'
            f'    <h2 lang="zh-Hant-HK">{source_title}</h2>\n'
            f'    <div class="body" lang="zh-Hant-HK">{source_body}</div>'
            f'{date}{translation}\n'
            f'  </div>'
        )
    return "\n\n".join(blocks)


def shi_translation(locale_id: str) -> list[dict[str, Any]]:
    if locale_id == "zh":
        return SHI_SOURCE["drafts"]
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


def shi_drafts_html(locale_id: str) -> str:
    drafts = shi_translation(locale_id)
    target_lang = LANG_BY_ID[locale_id]["html_lang"]
    blocks = []
    for draft in drafts:
        rows = [f'  <div class="draft" lang="{html.escape(target_lang, quote=True)}">',
                f'    <h2>{html.escape(draft["title"])}</h2>']
        for part in draft["parts"]:
            rows.append(f'    <p class="num">{html.escape(part["number"])}</p>')
            rows.append(f'    <div class="body">{html.escape(part["body"])}</div>')
        rows.append("  </div>")
        blocks.append("\n".join(rows))
    return "\n\n".join(blocks)


def font_preloads(locale_id: str, page: str) -> str:
    prefix = asset_prefix(locale_id)
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
        if locale_id in {"zh", "ja"} and page != "404":
            fonts.append("shippori-mincho-subset.woff2")
    return "\n".join(
        f'<link rel="preload" as="font" type="font/woff2" href="{prefix}assets/fonts/{name}" crossorigin>'
        for name in fonts
    )


def reading_tools(locale: dict[str, Any]) -> str:
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
    return (
        f'<aside class="reading-tools" aria-label="{html.escape(reading["label"], quote=True)}">\n'
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
        '</aside>'
    )


def specials_for(locale_id: str, page: str, locale: dict[str, Any]) -> dict[str, Any]:
    lang = LANG_BY_ID[locale_id]
    primary = IDENTITY["primary_name"]
    hero_name = html.escape(primary).replace(" ", "<br>", 1)
    alt_name = IDENTITY["alternate_names"][0]
    json_ld = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": primary,
        "alternateName": [IDENTITY["chinese_name"], *IDENTITY["alternate_names"]],
        "url": IDENTITY["site_url"],
        "sameAs": [IDENTITY["github_url"]],
        "knowsAbout": IDENTITY["knows_about"],
    }
    w2 = next(p for p in CI_SOURCE["poems"] if p["id"] == "w2")
    if locale_id == "zh":
        preview_body = html.escape(w2["source_body"])
    else:
        preview_body = html.escape(ci_translation(locale_id)["w2"]["body"])
    return {
        "HTML_LANG": html.escape(lang["html_lang"], quote=True),
        "LOCALE": locale_id,
        "ASSET_PREFIX": asset_prefix(locale_id),
        "CANONICAL_URL": html.escape(absolute_url(locale_id, page), quote=True),
        "HREFLANG_LINKS": hreflang_links(page),
        "OG_LOCALE": html.escape(lang["og_locale"], quote=True),
        "FONT_PRELOADS": font_preloads(locale_id, page),
        "READING_TOOLS": reading_tools(locale),
        "SOCIAL_IMAGE_ALT": html.escape(locale["home"]["photos"]["alt"]["03"], quote=True),
        "PRIMARY_NAME": html.escape(primary),
        "PRIMARY_NAME_HERO": hero_name,
        "CHINESE_NAME": html.escape(IDENTITY["chinese_name"]),
        "ALT_NAME": html.escape(alt_name),
        "LOCATION": html.escape(locale["home"]["location"]),
        "EMAIL": html.escape(IDENTITY["email"], quote=True),
        "GITHUB_URL": html.escape(IDENTITY["github_url"], quote=True),
        "GITHUB_LABEL": html.escape(IDENTITY["github_label"]),
        "SITE_YEAR": html.escape(SHARED["site_year"]),
        "MATERIAL_URL": html.escape(SHARED["projects"]["material"]["url"], quote=True),
        "MATERIAL_GREEN_VALUE": html.escape(SHARED["projects"]["material"]["proof_values"]["green"]),
        "MATERIAL_NDVI_VALUE": html.escape(SHARED["projects"]["material"]["proof_values"]["ndvi"]),
        "MATERIAL_S106_VALUE": html.escape(SHARED["projects"]["material"]["proof_values"]["s106"]),
        "MATERIAL_STACK": html.escape(SHARED["projects"]["material"]["stack"]),
        "SCOPERAIL_URL": html.escape(SHARED["projects"]["scoperail"]["url"], quote=True),
        "SCOPERAIL_TITLE": html.escape(SHARED["projects"]["scoperail"]["title"]),
        "SCOPERAIL_STACK": html.escape(SHARED["projects"]["scoperail"]["stack"]),
        "LIUZHENG_URL": html.escape(SHARED["projects"]["liuzheng"]["url"], quote=True),
        "LIUZHENG_TITLE": html.escape(SHARED["projects"]["liuzheng"]["title"]),
        "LIUZHENG_STACK": html.escape(SHARED["projects"]["liuzheng"]["stack"]),
        "HOME_HREF": page_path(locale_id, "index"),
        "CI_HREF": page_path(locale_id, "ci"),
        "SHI_HREF": page_path(locale_id, "shi"),
        "WRITING_HREF": page_path(locale_id, "index") + "#writing",
        "PHOTO_HREF": page_path(locale_id, "index") + "#photo",
        "LANG_SWITCHER": language_switcher(locale_id, page),
        "JSON_LD": json.dumps(json_ld, ensure_ascii=False, separators=(",", ":")),
        "SCOPERAIL_FLOW": flow_html(locale["home"]["projects"]["scoperail"]["flow"]),
        "LIUZHENG_FLOW": flow_html(locale["home"]["projects"]["liuzheng"]["flow"]),
        "CHRONOLOGY": chronology_html(locale["home"]["chronology"]),
        "POETRY_PREVIEW_TITLE": locale["home"]["poetry"]["preview_title"],
        "POETRY_PREVIEW_BODY": preview_body,
        "POETRY_PREVIEW_DATE": locale["home"]["poetry"]["preview_date"],
        "CI_SOURCE_HEADING": html.escape(CI_SOURCE["title"]),
        "SHI_SOURCE_HEADING": html.escape(SHI_SOURCE["title"]),
        "SHI_NAV_LABEL": locale["common"]["nav"]["shi"],
        "CI_TOC": ci_toc(locale_id, locale),
        "CI_POEMS": ci_poems_html(locale_id, locale),
        "SHI_DRAFTS": shi_drafts_html(locale_id),
    }


def render_page(locale_id: str, page: str, locale: dict[str, Any]) -> str:
    template = (TEMPLATES / f"{page}.html").read_text(encoding="utf-8")
    return render_template(template, locale, specials_for(locale_id, page, locale))


def build(check: bool = False) -> list[Path]:
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

    changed: list[Path] = []
    for lid, locale in locales.items():
        if lid != ROOT_LOCALE:
            (ROOT / lid).mkdir(exist_ok=True)
        for page in PAGES:
            target = output_path(lid, page)
            rendered = render_page(lid, page, locale)
            if not rendered.endswith("\n"):
                rendered += "\n"
            old = target.read_text(encoding="utf-8") if target.exists() else None
            if old != rendered:
                changed.append(target)
                if not check:
                    target.write_text(rendered, encoding="utf-8")

    sitemap_lines = ['<?xml version="1.0" encoding="UTF-8"?>',
                     '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for language in LANGUAGES:
        for page in ("index", "ci", "shi"):
            sitemap_lines.append(f'  <url><loc>{html.escape(absolute_url(language["id"], page))}</loc></url>')
    sitemap_lines.append("</urlset>")
    sitemap = "\n".join(sitemap_lines) + "\n"
    sitemap_path = ROOT / "sitemap.xml"
    old_sitemap = sitemap_path.read_text(encoding="utf-8") if sitemap_path.exists() else None
    if old_sitemap != sitemap:
        changed.append(sitemap_path)
        if not check:
            sitemap_path.write_text(sitemap, encoding="utf-8")

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
