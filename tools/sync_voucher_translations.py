#!/usr/bin/env python3
"""Refresh the studio's paired texts from the published literary sources."""

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
CATALOGUE = CONTENT / "poetry-voucher-app" / "editions.json"
PAIRED_LOCALES = ("en", "zh-Hans", "ja", "de", "fr", "ru")


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def paired_texts(work, ci, ci_simple, ci_translations, shi_simple, shi_translations, headings):
    if work["kind"] == "CI":
        key = work["id"].removeprefix("ci-")
        source = ci[key]
        simple = ci_simple[key]
        result = {
            "en": source["en"],
            "zh-Hans": {"title": simple["source_title"], "body": simple["source_body"]},
        }
        result.update({locale: ci_translations[locale][key] for locale in ("ja", "de", "fr", "ru")})
        return result

    if work["kind"] != "POEM":
        raise ValueError(f"Unknown catalogue kind: {work['kind']}")
    draft, part = (int(value) - 1 for value in work["id"].removeprefix("shi-d").split("-"))
    result = {}
    for locale in PAIRED_LOCALES:
        translated = shi_simple if locale == "zh-Hans" else shi_translations[locale]
        result[locale] = {
            "title": headings[locale],
            "body": translated["drafts"][draft]["parts"][part]["body"],
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the catalogue is stale")
    args = parser.parse_args()

    catalogue = read(CATALOGUE)
    ci_source = read(CONTENT / "ci-source.json")
    ci = {poem["id"]: poem for poem in ci_source["poems"]}
    ci_simple = {poem["id"]: poem for poem in read(CONTENT / "ci-simplified.json")["poems"]}
    ci_translations = {
        locale: read(CONTENT / "ci-translations" / f"{locale}.json")["poems"]
        for locale in ("ja", "de", "fr", "ru")
    }
    shi_simple = read(CONTENT / "shi-simplified.json")
    shi_translations = {
        locale: read(CONTENT / "shi-translations" / f"{locale}.json")
        for locale in ("en", "ja", "de", "fr", "ru")
    }
    headings = {
        locale: read(CONTENT / "locales" / f"{locale.lower()}.json")["shi"]["heading"]
        for locale in PAIRED_LOCALES
    }
    shi_source = read(CONTENT / "shi-source.json")
    expected_ids = {f"ci-{key}" for key in ci} | {
        f"shi-d{draft_number}-{part_number}"
        for draft_number, draft in enumerate(shi_source["drafts"], 1)
        for part_number, _ in enumerate(draft["parts"], 1)
    }
    actual_ids = [work["id"] for work in catalogue["works"]]
    if set(actual_ids) != expected_ids or len(actual_ids) != len(expected_ids):
        raise ValueError("Voucher catalogue must contain every published work exactly once")
    for work in catalogue["works"]:
        # Literary collection metadata remains intact; shop shelves exclude appendices.
        key = work["id"].removeprefix("ci-")
        work["shelf"] = (
            shi_source["title"] if work["kind"] == "POEM" else
            "詞" if ci[key]["voice"] == "separate" or key in ci_source["outside_dates"] else
            ci_source["title"]
        )
        work.pop("translation", None)
        work.pop("translation_title", None)
        work["translations"] = paired_texts(
            work, ci, ci_simple, ci_translations, shi_simple, shi_translations, headings
        )
        if set(work["translations"]) != set(PAIRED_LOCALES):
            raise ValueError(f"Incomplete paired languages for {work['id']}")
    rendered = json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.check:
        if CATALOGUE.read_text(encoding="utf-8") != rendered:
            parser.error("voucher catalogue is stale; run tools/sync_voucher_translations.py")
    else:
        CATALOGUE.write_text(rendered, encoding="utf-8")
    print(f"voucher catalogue: {len(catalogue['works'])} works, {len(PAIRED_LOCALES)} paired languages")


if __name__ == "__main__":
    main()
