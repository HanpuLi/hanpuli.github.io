#!/usr/bin/env python3
"""Semantic and structural checks for the multilingual portfolio."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
LOCALES = ("en", "zh", "ja", "de", "fr")
CI_IDS = ("a1","b1","a2","b2","b3","b4","b5","a3","a4","a5","a6","a7","b6","a8","b7","a9","a10","w2","w3")


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


def main() -> int:
    errors = []
    en = load(CONTENT / "locales" / "en.json")
    sig = signature(en)

    for locale in LOCALES:
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

    ci = load(CONTENT / "ci-source.json")
    poems = {item["id"]: item for item in ci["poems"]}
    if tuple(poems) != CI_IDS:
        errors.append(f"ci-source ids/order changed: {tuple(poems)}")

    en_patterns = {
        pid: (len(nonblank_lines(poems[pid]["en"]["body"])), break_pattern(poems[pid]["en"]["body"]))
        for pid in CI_IDS
    }
    for locale in ("ja", "de", "fr"):
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

    shi = load(CONTENT / "shi-source.json")
    source_patterns = [
        [
            (len(nonblank_lines(part["body"])), break_pattern(part["body"]))
            for part in draft["parts"]
        ]
        for draft in shi["drafts"]
    ]
    for locale in ("en", "ja", "de", "fr"):
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

    for locale in LOCALES:
        folder = ROOT if locale == "en" else ROOT / locale
        for name in ("index.html", "ci.html", "shi.html", "404.html"):
            path = folder / name
            if not path.exists():
                errors.append(f"missing generated {path.relative_to(ROOT)}")
                continue
            text = path.read_text(encoding="utf-8")
            if "{{" in text or "}}" in text:
                errors.append(f"{path.relative_to(ROOT)}: unresolved template token")
            lang = load(CONTENT / "languages.json")
            expected = next(item["html_lang"] for item in lang if item["id"] == locale)
            if f'<html lang="{expected}">' not in text:
                errors.append(f"{path.relative_to(ROOT)}: wrong html lang")
            if name != "404.html":
                alternates = len(re.findall(r'<link rel="alternate" hreflang=', text))
                if alternates != 6:
                    errors.append(f"{path.relative_to(ROOT)}: expected 6 hreflang links, got {alternates}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("i18ncheck: locale schemas, literary line structure, generated pages and hreflang OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
