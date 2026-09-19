#!/usr/bin/env python3
"""Semantic and structural checks for the multilingual portfolio."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
CI_IDS = ("a1","b1","a2","b2","b3","b4","b5","a3","a4","a5","a6","a7","b6","a8","b7","a9","a10","w2","w3")
EXPECTED_EDUCATION = {
    "en": "York · English Language and Linguistics → film · QMUL",
    "zh": "約克 · 英語語言與語言學 → 電影 · QMUL",
    "zh-hans": "约克 · 英语语言与语言学 → 电影 · QMUL",
    "ja": "York · 英語・言語学 → 映画 · QMUL",
    "de": "York · Englische Sprache und Linguistik → Film · QMUL",
    "fr": "York · langue anglaise et linguistique → cinéma · QMUL",
    "ru": "York · английский язык и лингвистика → кино · QMUL",
}


def load(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def signature(value, path=""):
    out = {}
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else key
            out[child_path] = type(child).__name__
            out.update(signature(child, child_path))
    elif isinstance(value, list):
        out[f"{path}[]"] = "list"
        for i, child in enumerate(value):
            out.update(signature(child, f"{path}[{i}]"))
    return out


def break_pattern(text: str):
    return tuple(line == "" for line in text.split("\n"))


def nonblank_lines(text: str):
    return tuple(line for line in text.split("\n") if line != "")


def contains_markup(text: str) -> bool:
    return bool(re.search(r"<[^>]+>", text))


def simplified_font_characters(text: str) -> str:
    def wanted(char: str) -> bool:
        code = ord(char)
        return (
            0x3000 <= code <= 0x303F
            or 0x3400 <= code <= 0x9FFF
            or 0xF900 <= code <= 0xFAFF
            or 0xFF00 <= code <= 0xFFEF
        )

    return "".join(sorted({char for char in text if wanted(char)}))


def main() -> int:
    errors = []
    languages = load(CONTENT / "languages.json")
    locales = tuple(item["id"] for item in languages)
    chinese_locales = {"zh", "zh-hans"}
    translation_locales = tuple(locale for locale in locales if locale not in {"en", *chinese_locales})
    shi_locales = tuple(locale for locale in locales if locale not in chinese_locales)
    expected_alternates = len(locales) + 1

    en = load(CONTENT / "locales" / "en.json")
    sig = signature(en)

    for locale in locales:
        path = CONTENT / "locales" / f"{locale}.json"
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
            continue
        data = load(path)
        current = signature(data)
        missing = sorted(set(sig) - set(current))
        extra = sorted(set(current) - set(sig))
        wrong = sorted(k for k in set(sig) & set(current) if sig[k] != current[k])
        if missing or extra or wrong:
            errors.append(f"{locale} locale schema mismatch: missing={missing} extra={extra} type={wrong}")
        if data.get("home", {}).get("education") != EXPECTED_EDUCATION[locale]:
            errors.append(
                f"{locale} home.education no longer matches the approved factual trajectory: "
                f"{data.get('home', {}).get('education')!r}"
            )
        if locale != "en":
            chronology_text = "\n".join(
                item.get("text", "") for item in data.get("home", {}).get("chronology", [])
            )
            leaked_english = (
                "Young Presenter Competition",
                "Script Supervisor",
                "Beijing LGBT Center",
                "Wuhan LGBT Center",
                "University of York",
                "Macao International Microfilm Festival",
                "Golden Rooster",
                "Zhengding County Television",
                "Hebei Traffic Radio",
            )
            for phrase in leaked_english:
                if phrase in chronology_text:
                    errors.append(
                        f"{locale} chronology still contains an unlocalised English label: {phrase}"
                    )
            radio_brand = '<span lang="en-GB">University Radio York 88.3FM</span>'
            if "University Radio York 88.3FM" in chronology_text and radio_brand not in chronology_text:
                errors.append(
                    f"{locale} chronology must mark the retained University Radio York brand as English"
                )

    essay_locales = load(CONTENT / "essay-trainspotting.json")
    if set(essay_locales) != set(locales):
        errors.append(
            "Trainspotting essay locale mismatch: "
            f"missing={sorted(set(locales) - set(essay_locales))} "
            f"extra={sorted(set(essay_locales) - set(locales))}"
        )
    else:
        for locale in locales:
            item = essay_locales[locale]
            for key in ("meta_description", "language_note"):
                if not isinstance(item.get(key), str):
                    errors.append(f"{locale} Trainspotting essay: {key} must be a string")
            if locale != "en" and not item.get("language_note", "").strip():
                errors.append(f"{locale} Trainspotting essay: missing English-body notice")

    ja_literary_text = (
        (CONTENT / "locales" / "ja.json").read_text(encoding="utf-8")
        + "\n"
        + (CONTENT / "ci-translations" / "ja.json").read_text(encoding="utf-8")
    )
    for romanized in ("Linjiangxian", "Zhegutian", "Tasuoxing", "Dujiangyun", "Shiliuziling", "Shanpoyang"):
        if romanized in ja_literary_text:
            errors.append(f"ja literary copy uses pinyin/transliteration instead of the available kanji form: {romanized}")
    if re.search(r"[\u3400-\u9fff] の調べ", ja_literary_text):
        errors.append("ja literary copy has an unnatural ASCII space before the particle in a tune-name label")

    ci = load(CONTENT / "ci-source.json")
    poems = {item["id"]: item for item in ci["poems"]}
    if tuple(poems) != CI_IDS:
        errors.append(f"ci-source ids/order changed: {tuple(poems)}")

    ci_simplified = load(CONTENT / "ci-simplified.json")
    ci_source_hash = hashlib.sha256((CONTENT / "ci-source.json").read_bytes()).hexdigest()
    if ci_simplified.get("source_sha256") != ci_source_hash:
        errors.append("ci-simplified.json is stale relative to ci-source.json")
    simplified_poems = {item["id"]: item for item in ci_simplified.get("poems", [])}
    if tuple(simplified_poems) != CI_IDS:
        errors.append(f"ci-simplified ids/order changed: {tuple(simplified_poems)}")
    else:
        for pid in CI_IDS:
            source_title = poems[pid]["source_title"]
            simplified_title = simplified_poems[pid].get("source_title", "")
            source_body = poems[pid]["source_body"]
            simplified_body = simplified_poems[pid].get("source_body", "")
            if len(simplified_title) != len(source_title) or len(simplified_body) != len(source_body):
                errors.append(f"zh-hans ci {pid}: script conversion changed source length")
            if len(nonblank_lines(simplified_body)) != len(nonblank_lines(source_body)):
                errors.append(f"zh-hans ci {pid}: line count differs from Traditional source")
            if break_pattern(simplified_body) != break_pattern(source_body):
                errors.append(f"zh-hans ci {pid}: stanza/line-break pattern differs from Traditional source")

    en_patterns = {
        pid: (len(nonblank_lines(poems[pid]["en"]["body"])), break_pattern(poems[pid]["en"]["body"]))
        for pid in CI_IDS
    }
    for locale in translation_locales:
        path = CONTENT / "ci-translations" / f"{locale}.json"
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
            continue
        data = load(path)
        items = data.get("poems", {})
        if set(items) != set(CI_IDS):
            errors.append(f"{locale} ci ids mismatch: missing={sorted(set(CI_IDS)-set(items))} extra={sorted(set(items)-set(CI_IDS))}")
            continue
        for pid in CI_IDS:
            item = items[pid]
            if not isinstance(item.get("title"), str) or not item["title"].strip():
                errors.append(f"{locale} ci {pid}: missing title")
            elif contains_markup(item["title"]):
                errors.append(f"{locale} ci {pid}: literary title must not contain HTML markup")
            body = item.get("body")
            if not isinstance(body, str) or not body.strip():
                errors.append(f"{locale} ci {pid}: missing body")
                continue
            if contains_markup(body):
                errors.append(f"{locale} ci {pid}: literary body must not contain HTML markup")
            expected_count, expected_breaks = en_patterns[pid]
            if len(nonblank_lines(body)) != expected_count:
                errors.append(f"{locale} ci {pid}: line count {len(nonblank_lines(body))} != {expected_count}")
            if break_pattern(body) != expected_breaks:
                errors.append(f"{locale} ci {pid}: stanza/line-break pattern differs from English reference")

    b2_quotes = {
        "zh": nonblank_lines(poems["b2"]["source_body"])[4],
        "zh-hans": nonblank_lines(simplified_poems["b2"]["source_body"])[4],
        "en": nonblank_lines(poems["b2"]["en"]["body"])[5],
    }
    for locale in translation_locales:
        translated_b2 = load(CONTENT / "ci-translations" / f"{locale}.json")["poems"]["b2"]["body"]
        b2_quotes[locale] = nonblank_lines(translated_b2)[5]

    shi = load(CONTENT / "shi-source.json")
    source_patterns = [
        [
            (len(nonblank_lines(part["body"])), break_pattern(part["body"]))
            for part in draft["parts"]
        ]
        for draft in shi["drafts"]
    ]

    shi_simplified = load(CONTENT / "shi-simplified.json")
    shi_source_hash = hashlib.sha256((CONTENT / "shi-source.json").read_bytes()).hexdigest()
    if shi_simplified.get("source_sha256") != shi_source_hash:
        errors.append("shi-simplified.json is stale relative to shi-source.json")
    simplified_drafts = shi_simplified.get("drafts", [])
    if len(simplified_drafts) != len(shi["drafts"]):
        errors.append(
            f"zh-hans shi: expected {len(shi['drafts'])} drafts, got {len(simplified_drafts)}"
        )
    else:
        for di, draft in enumerate(simplified_drafts):
            parts = draft.get("parts", [])
            if len(parts) != len(shi["drafts"][di]["parts"]):
                errors.append(f"zh-hans shi draft {di+1}: part count differs from Traditional source")
                continue
            for pi, part in enumerate(parts):
                body = part.get("body", "")
                source_body = shi["drafts"][di]["parts"][pi]["body"]
                expected_count, expected_breaks = source_patterns[di][pi]
                if len(body) != len(source_body):
                    errors.append(f"zh-hans shi draft {di+1} part {pi+1}: script conversion changed source length")
                if len(nonblank_lines(body)) != expected_count:
                    errors.append(f"zh-hans shi draft {di+1} part {pi+1}: line count differs from Traditional source")
                if break_pattern(body) != expected_breaks:
                    errors.append(f"zh-hans shi draft {di+1} part {pi+1}: stanza/line-break pattern differs from Traditional source")

    for locale in shi_locales:
        path = CONTENT / "shi-translations" / f"{locale}.json"
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
            continue
        data = load(path)
        drafts = data.get("drafts", [])
        if len(drafts) != 2:
            errors.append(f"{locale} shi: expected 2 drafts, got {len(drafts)}")
            continue
        for di, draft in enumerate(drafts):
            parts = draft.get("parts", [])
            if len(parts) != 2:
                errors.append(f"{locale} shi draft {di+1}: expected 2 parts, got {len(parts)}")
                continue
            for pi, part in enumerate(parts):
                body = part.get("body")
                if not isinstance(body, str) or not body.strip():
                    errors.append(f"{locale} shi draft {di+1} part {pi+1}: missing body")
                    continue
                if contains_markup(body):
                    errors.append(f"{locale} shi draft {di+1} part {pi+1}: literary body must not contain HTML markup")
                expected_count, expected_breaks = source_patterns[di][pi]
                if len(nonblank_lines(body)) != expected_count:
                    errors.append(
                        f"{locale} shi draft {di+1} part {pi+1}: line count "
                        f"{len(nonblank_lines(body))} != {expected_count}"
                    )
                if break_pattern(body) != expected_breaks:
                    errors.append(f"{locale} shi draft {di+1} part {pi+1}: stanza/line-break pattern differs from source")

    zh_hans_text = "\n".join(
        [
            (CONTENT / "locales" / "zh-hans.json").read_text(encoding="utf-8"),
            (CONTENT / "ci-simplified.json").read_text(encoding="utf-8"),
            (CONTENT / "shi-simplified.json").read_text(encoding="utf-8"),
            load(CONTENT / "essay-trainspotting.json")["zh-hans"]["language_note"],
        ]
    )
    forbidden_traditional = set("體語攝寫詞詩電郵證據閱讀顯儲裝襯線縮欄寬簡動對虛擬製遙經濟擴綠轉換檔錄劇膠發義聲幀長評論會這兩倫學麗後無題頂頁別處")
    leaked = sorted(char for char in forbidden_traditional if char in zh_hans_text)
    if leaked:
        errors.append("zh-hans contains Traditional-only glyphs that should be simplified: " + " ".join(leaked))

    font_meta_path = ROOT / "assets" / "fonts" / "noto-serif-sc-subset.meta.json"
    font_path = ROOT / "assets" / "fonts" / "noto-serif-sc-subset.woff2"
    locale_font_path = ROOT / "assets" / "fonts" / "noto-serif-sc-locale.woff2"
    if not font_meta_path.exists() or not font_path.exists():
        errors.append("Simplified-Chinese font subset or metadata is missing")
    if not locale_font_path.exists():
        errors.append("Simplified-Chinese locale-switch font subset is missing")
    if font_meta_path.exists() and font_path.exists():
        font_meta = load(font_meta_path)
        chars = simplified_font_characters(zh_hans_text)
        chars_hash = hashlib.sha256(chars.encode("utf-8")).hexdigest()
        font_hash = hashlib.sha256(font_path.read_bytes()).hexdigest()
        if font_meta.get("character_count") != len(chars):
            errors.append("Simplified-Chinese font subset character count is stale")
        if font_meta.get("character_set_sha256") != chars_hash:
            errors.append("Simplified-Chinese font subset character set is stale")
        if font_meta.get("font_sha256") != font_hash:
            errors.append("Simplified-Chinese font subset hash does not match its metadata")

    for locale in locales:
        folder = ROOT if locale == "en" else ROOT / locale
        locale_data = load(CONTENT / "locales" / f"{locale}.json")
        expected_lang = next(item["html_lang"] for item in languages if item["id"] == locale)
        essay_path = folder / "writing" / "trainspotting" / "index.html"
        if not essay_path.exists():
            errors.append(f"missing generated {essay_path.relative_to(ROOT)}")
        else:
            essay_text = essay_path.read_text(encoding="utf-8")
            if "{{" in essay_text or "}}" in essay_text:
                errors.append(f"{essay_path.relative_to(ROOT)}: unresolved template token")
            if not re.search(rf'<html\b[^>]*\blang="{re.escape(expected_lang)}"', essay_text):
                errors.append(f"{essay_path.relative_to(ROOT)}: wrong html lang")
            if '<div lang="en-GB">' not in essay_text:
                errors.append(f"{essay_path.relative_to(ROOT)}: essay body is not explicitly marked as English")
            if essay_text.count('class="current"') != 1:
                errors.append(f"{essay_path.relative_to(ROOT)}: expected one current essay language")
            essay_nav_numbers = re.findall(
                r'<span class="nav-no">(0[1-6])</span>',
                essay_text,
            )
            if essay_nav_numbers != ["01", "02", "03", "04", "05", "06"]:
                errors.append(
                    f"{essay_path.relative_to(ROOT)}: portfolio nav order is {essay_nav_numbers}, expected 01–06"
                )
            if not re.search(
                r'<span aria-current="page">\s*<span class="nav-no">01</span>',
                essay_text,
            ):
                errors.append(
                    f"{essay_path.relative_to(ROOT)}: Trainspotting must mark 01 writing as current"
                )
            for language in languages:
                lid = language["id"]
                if lid == locale:
                    continue
                href = "/writing/trainspotting/" if lid == "en" else f"/{lid}/writing/trainspotting/"
                if f'href="{href}"' not in essay_text:
                    errors.append(
                        f"{essay_path.relative_to(ROOT)}: missing essay language link {href}"
                    )

        for name in ("index.html", "ci.html", "shi.html", "404.html"):
            path = folder / name
            if not path.exists():
                errors.append(f"missing generated {path.relative_to(ROOT)}")
                continue
            text = path.read_text(encoding="utf-8")
            if "{{" in text or "}}" in text:
                errors.append(f"{path.relative_to(ROOT)}: unresolved template token")
            expected = next(item["html_lang"] for item in languages if item["id"] == locale)
            if not re.search(rf'<html\b[^>]*\blang="{re.escape(expected)}"', text):
                errors.append(f"{path.relative_to(ROOT)}: wrong html lang")
            has_sc_font = "noto-serif-sc-subset.woff2" in text
            if locale == "zh-hans" and not has_sc_font:
                errors.append(f"{path.relative_to(ROOT)}: Simplified-Chinese page is missing the SC font subset")
            if locale != "zh-hans" and has_sc_font:
                errors.append(f"{path.relative_to(ROOT)}: non-Simplified page must not load the SC font subset")
            if name != "404.html":
                alternates = len(re.findall(r'<link rel="alternate" hreflang=', text))
                if alternates != expected_alternates:
                    errors.append(
                        f"{path.relative_to(ROOT)}: expected {expected_alternates} hreflang links, got {alternates}"
                    )
                nav_numbers = re.findall(
                    r'<span class="nav-no">(0[1-6])</span>',
                    text,
                )
                if nav_numbers != ["01", "02", "03", "04", "05", "06"]:
                    errors.append(
                        f"{path.relative_to(ROOT)}: portfolio nav order is {nav_numbers}, expected 01–06"
                    )
                expected_current = {"ci.html": "04", "shi.html": "05"}.get(name)
                if expected_current and not re.search(
                    rf'<span aria-current="page">\s*<span class="nav-no">{expected_current}</span>',
                    text,
                ):
                    errors.append(
                        f"{path.relative_to(ROOT)}: expected nav item {expected_current} to be current"
                    )
            if name == "ci.html":
                source_versions = text.count('class="poem-version source"')
                translated_versions = text.count('class="poem-version translation"')
                if source_versions != len(CI_IDS):
                    errors.append(
                        f"{path.relative_to(ROOT)}: expected {len(CI_IDS)} source poem versions, got {source_versions}"
                    )
                expected_translations = 0 if locale in chinese_locales else len(CI_IDS)
                if translated_versions != expected_translations:
                    errors.append(
                        f"{path.relative_to(ROOT)}: expected {expected_translations} paired translations, got {translated_versions}"
                    )
                if locale in chinese_locales:
                    if text.count('class="poem-pair source-only"') != len(CI_IDS):
                        errors.append(
                            f"{path.relative_to(ROOT)}: Chinese ci page must keep every poem in source-only layout"
                        )
                elif text.count('class="poem-pair"') != len(CI_IDS):
                    errors.append(
                        f"{path.relative_to(ROOT)}: every translated ci poem must use paired source/translation layout"
                    )

            if name == "shi.html":
                if locale in chinese_locales:
                    if 'id="drafts" class="source-only"' not in text:
                        errors.append(
                            f"{path.relative_to(ROOT)}: Chinese poem page must retain source-only draft layout"
                        )
                    if 'class="draft-pair"' in text:
                        errors.append(
                            f"{path.relative_to(ROOT)}: Chinese poem page must not manufacture translation pairs"
                        )
                else:
                    expected_pairs = len(shi["drafts"])
                    pairs = text.count('class="draft-pair"')
                    sources = text.count('class="draft source"')
                    translations = text.count('class="draft translation"')
                    if (pairs, sources, translations) != (expected_pairs, expected_pairs, expected_pairs):
                        errors.append(
                            f"{path.relative_to(ROOT)}: expected {expected_pairs} source/translation draft pairs, "
                            f"got pairs={pairs} source={sources} translation={translations}"
                        )

            if name == "index.html":
                shi_href = "/shi.html" if locale == "en" else f"/{locale}/shi.html"
                if not re.search(
                    rf'<a\b[^>]*href="{re.escape(shi_href)}"[^>]*>\s*<span class="nav-no">05</span>',
                    text,
                ):
                    errors.append(
                        f"{path.relative_to(ROOT)}: home navigation is missing 05 poem-page link"
                    )
                shi_label = locale_data["common"]["nav"]["shi"]
                if shi_label not in text:
                    errors.append(f"{path.relative_to(ROOT)}: home navigation is missing localized poem label {shi_label!r}")
                essay_href = "/writing/trainspotting/" if locale == "en" else f"/{locale}/writing/trainspotting/"
                if text.count(f'href="{essay_href}"') < 2:
                    errors.append(
                        f"{path.relative_to(ROOT)}: Trainspotting links do not stay in the current locale"
                    )
            if name == "404.html":
                if locale_data["notfound"]["line"] != b2_quotes[locale]:
                    errors.append(
                        f"{locale} 404 quote no longer matches the established B2 · Tasuoxing translation"
                    )
                ci_href = "/ci.html" if locale == "en" else f"/{locale}/ci.html"
                if f'href="{ci_href}#b2"' not in text:
                    errors.append(f"{path.relative_to(ROOT)}: 404 source citation does not link to B2")
                for key in ("line", "description", "source", "home"):
                    if locale_data["notfound"][key] not in text:
                        errors.append(f"{path.relative_to(ROOT)}: missing localized notfound.{key}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("i18ncheck: locale schemas, literary line structure, generated pages and hreflang OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
