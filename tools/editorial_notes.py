"""Render the two editorial essays and their explicit, shared references.

No markup is accepted from copy. [[reference-id]] is the only inline notation;
unknown references fail the build. Tariff figures come from the public renderer,
not a second set of editable prices in a template.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

from voucher_publication import publication_data

ROOT = Path(__file__).resolve().parents[1]
IMPLEMENTATION_SOURCE_URL = "https://github.com/HanpuLi/hanpuli.github.io/tree/main/content/poetry-voucher-app/"
IMPLEMENTATION_MANIFEST_URL = "/poetry-voucher/publication-build.js"
REFERENCES = json.loads((ROOT / "content/editorial-references.json").read_text(encoding="utf-8"))
CITATION = re.compile(r"\[\[([a-z][a-z-]*)\]\]")


def reference_ids(sections: list[dict]) -> list[str]:
    used: list[str] = []
    for section in sections:
        for paragraph in section["body"]:
            for key in CITATION.findall(paragraph):
                if key not in REFERENCES:
                    raise ValueError(f"Unknown editorial reference: {key}")
                if key not in used:
                    used.append(key)
    return used


def paragraph_html(text: str, used: list[str], label: str) -> str:
    parts: list[str] = []
    end = 0
    for match in CITATION.finditer(text):
        key = match.group(1)
        number = used.index(key) + 1
        parts.append(html.escape(text[end:match.start()]))
        parts.append(
            f'<sup class="editorial-citation"><a href="#ref-{key}" '
            f'aria-label="{html.escape(label, quote=True)} {number}: '
            f'{html.escape(REFERENCES[key]["author"], quote=True)}">[{number}]</a></sup>'
        )
        end = match.end()
    parts.append(html.escape(text[end:]))
    return "".join(parts)


def tariff_values() -> dict[str, int | str]:
    source = (ROOT / "content/poetry-voucher-app/gallery.js").read_text(encoding="utf-8")
    match = re.search(r"const TARIFF=Object\.freeze\(\{(.*?)\}\);", source, re.S)
    if not match:
        raise ValueError("The public tariff declaration could not be read")
    body = match.group(1)
    required = ["base", "character", "line", "stanza", "roundUnit", "roundEnding", "addOn"]
    values: dict[str, int | str] = {}
    for key in required:
        field = re.search(rf"\b{key}:([0-9]+)\b", body)
        if not field:
            raise ValueError(f"Missing numeric public tariff field: {key}")
        values[key] = int(field.group(1))
    version = re.search(r"\bversion:'([^']+)'", body)
    if not version:
        raise ValueError("Missing public tariff version")
    values["version"] = version.group(1)
    return values


def tariff_html(copy: dict) -> str:
    values = tariff_values()
    money = lambda value: f"£{int(value) // 100}.{int(value) % 100:02d}"
    entries = [("tariff_base", "base"), ("tariff_char", "character"),
               ("tariff_line", "line"), ("tariff_stanza", "stanza")]
    rows = []
    for label, key in entries:
        amount = ("" if key == "base" else "+") + money(values[key])
        rows.append(f'<div><dt>{html.escape(copy[label])}</dt><dd>{amount}</dd></div>')
    rows.append(f'<div class="tariff-rounding"><dt>{html.escape(copy["tariff_price"])}</dt>'
                f'<dd>{html.escape(copy["tariff_rounding"])}</dd></div>')
    for label in ["tariff_font", "tariff_translation"]:
        rows.append(f'<div><dt>{html.escape(copy[label])}</dt><dd>+{money(values["addOn"])}</dd></div>')
    return ('<details class="editorial-tariff"><summary>'
            + html.escape(copy["tariff_detail"]) + ' · ' + html.escape(str(values["version"]))
            + '</summary><dl class="pv-tariff">' + ''.join(rows) + '</dl><p>'
            + html.escape(copy["tariff_note"]) + '</p></details>')


def paper_values() -> dict[str, int]:
    source = (ROOT / "content/poetry-voucher-app/gallery.js").read_text(encoding="utf-8")
    match = re.search(r"const PAPER_CONFIG=Object\.freeze\(\{(.*?)\}\);", source, re.S)
    if not match:
        raise ValueError("The public paper declaration could not be read")
    values: dict[str, int] = {}
    for key in ("paperMm", "printableDots", "dotsPerMm"):
        field = re.search(rf"\b{key}:([0-9]+)\b", match.group(1))
        if not field:
            raise ValueError(f"Missing numeric public paper field: {key}")
        values[key] = int(field.group(1))
    if values["printableDots"] > values["paperMm"] * values["dotsPerMm"]:
        raise ValueError("The printable image is wider than the declared paper")
    if "/BitsPerComponent 1" not in source:
        raise ValueError("The public PDF is no longer one-bit")
    return values


def implementation_html(copy: dict) -> str:
    build = publication_data(ROOT)
    paper = paper_values()
    steps = (
        ("catalogue", "catalogue_note"),
        ("configure", "configure_note"),
        ("freeze", "freeze_note"),
        ("render", "render_note"),
        ("keep", "keep_note"),
        ("print", "print_note"),
    )
    items = "".join(
        '<li><span class="pv-implementation-no">' + f'{number:02d}' + '</span><div><strong>'
        + html.escape(copy[f"implementation_{label}"]) + '</strong><span>'
        + html.escape(copy[f"implementation_{note}"]) + '</span></div></li>'
        for number, (label, note) in enumerate(steps, 1)
    )
    spec = f'{paper["paperMm"]} mm · {paper["printableDots"]} dots · 1 bit'
    return (
        '<figure class="pv-implementation"><figcaption>'
        + html.escape(copy["implementation_flow_label"]) + '</figcaption>'
        '<ol>' + items + '</ol></figure>'
        '<dl class="pv-implementation-meta"><div><dt>'
        + html.escape(copy["implementation_build_label"]) + '</dt><dd><code>'
        + html.escape(build["renderer"]) + '</code></dd></div><div><dt>'
        + html.escape(copy["implementation_paper_label"]) + '</dt><dd>'
        + html.escape(spec) + '</dd></div></dl>'
        '<nav class="pv-implementation-links" aria-label="'
        + html.escape(copy["implementation_links_label"], quote=True) + '">'
        '<a href="' + html.escape(IMPLEMENTATION_SOURCE_URL, quote=True) + '">'
        + html.escape(copy["implementation_source"]) + '</a>'
        '<a href="' + html.escape(IMPLEMENTATION_MANIFEST_URL, quote=True) + '">'
        + html.escape(copy["implementation_manifest"]) + '</a></nav>'
    )


def sections_html(sections: list[dict], copy: dict, project: bool = False) -> str:
    used = reference_ids(sections)
    blocks: list[str] = []
    for section in sections:
        sid = html.escape(section["id"], quote=True)
        body = "\n".join('<p>' + paragraph_html(p, used, copy["references_title"]) + '</p>'
                         for p in section["body"])
        feature_kind = section.get("feature")
        if feature_kind == "tariff":
            feature = tariff_html(copy)
        elif feature_kind == "implementation":
            feature = implementation_html(copy)
        else:
            feature = ""
        facts = section.get("facts", [])
        if facts:
            feature += '<dl class="about-facts">' + ''.join(
                '<div><dt>' + html.escape(f["label"]) + '</dt><dd>' + html.escape(f["value"]) + '</dd></div>'
                for f in facts) + '</dl>'
        blocks.append(
            f'<section class="about-section editorial-section" id="{sid}" aria-labelledby="heading-{sid}">'
            '<div class="about-section-head">'
            f'<p class="about-section-no">{html.escape(section["number"])}</p>'
            f'<h2 id="heading-{sid}">{html.escape(section["title"])}</h2>'
            f'<p class="about-section-dek">{html.escape(section["dek"])}</p></div>'
            f'<div class="about-section-copy">{body}{feature}</div></section>'
        )
    return "\n".join(blocks)


def references_html(sections: list[dict], copy: dict) -> str:
    used = reference_ids(sections)
    if not used:
        return ""
    entries = []
    for key in used:
        item = REFERENCES[key]
        extra = ""
        if item.get("reading_url"):
            extra = (' <a class="reference-copy" href="' + html.escape(item["reading_url"], quote=True)
                     + '">' + html.escape(item["reading_label"]) + '</a>')
        entries.append(
            f'<li id="ref-{key}"><span lang="en">{html.escape(item["author"])}. '
            f'<a href="{html.escape(item["url"], quote=True)}"><cite>{html.escape(item["title"])}</cite></a>. '
            f'{html.escape(item["publication"])}.{extra}</span></li>'
        )
    return ('<section id="references" class="editorial-references" aria-labelledby="references-heading">'
            '<h2 id="references-heading">' + html.escape(copy["references_title"]) + '</h2><p>'
            + html.escape(copy["references_intro"]) + '</p><ol>' + ''.join(entries) + '</ol></section>')


def project_toc(copy: dict) -> str:
    links = ''.join('<li><a href="#' + html.escape(s["id"], quote=True) + '"><span>'
                    + html.escape(s["number"]) + '</span> ' + html.escape(s["title"]) + '</a></li>'
                    for s in copy["notes"])
    return ('<nav class="pv-contents" aria-label="' + html.escape(copy["toc_label"], quote=True)
            + '"><h2>' + html.escape(copy["toc_label"]) + '</h2><ol>' + links + '</ol></nav>')
