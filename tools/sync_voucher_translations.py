#!/usr/bin/env python3
"""Copy published literary translations into the offline voucher catalogue."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ("en", "ja", "de", "fr", "ru")
CATALOGUE = ROOT / "content/poetry-voucher-app/editions.json"


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def translations():
    ci_source = {poem["id"]: poem for poem in read("content/ci-source.json")["poems"]}
    ci_locales = {
        locale: read(f"content/ci-translations/{locale}.json")["poems"]
        for locale in LOCALES if locale != "en"
    }
    shi_source = read("content/shi-source.json")["drafts"]
    shi_locales = {
        locale: read(f"content/shi-translations/{locale}.json")["drafts"]
        for locale in LOCALES
    }
    shi_titles = {
        locale: read(f"content/locales/{locale}.json")["shi"]["heading"]
        for locale in LOCALES
    }
    catalogue = read("content/poetry-voucher-app/editions.json")
    for work in catalogue["works"]:
        if work["id"].startswith("ci-"):
            source = ci_source[work["id"][3:]]
            assert work["title"] == source["source_title"] and work["poem"] == source["source_body"]
            translated = {"en": source["en"], **{
                locale: ci_locales[locale][source["id"]] for locale in ci_locales
            }}
        else:
            draft = int(work["id"][5]) - 1
            part = int(work["id"][7]) - 1
            assert work["poem"] == shi_source[draft]["parts"][part]["body"]
            translated = {
                locale: {"title": shi_titles[locale], "body": shi_locales[locale][draft]["parts"][part]["body"]}
                for locale in LOCALES
            }
        assert translated["en"]["title"] == work["translation_title"]
        assert translated["en"]["body"] == work["translation"]
        assert all(value["title"] and value["body"] for value in translated.values())
        work["translations"] = translated
    return json.dumps(catalogue, ensure_ascii=False)


if __name__ == "__main__":
    expected = translations()
    if "--check" in sys.argv:
        if CATALOGUE.read_text(encoding="utf-8") != expected:
            sys.exit("Voucher translation catalogue is out of date; run tools/sync_voucher_translations.py")
    else:
        CATALOGUE.write_text(expected, encoding="utf-8")
