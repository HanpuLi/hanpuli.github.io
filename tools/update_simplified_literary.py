#!/usr/bin/env python3
"""Regenerate the Simplified-Chinese literary mirrors from canonical sources.

This is an authoring helper, not part of the zero-dependency site build.
Run it with:
    uv run --with opencc-python-reimplemented python tools/update_simplified_literary.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

try:
    from opencc import OpenCC
except ImportError as exc:  # pragma: no cover - authoring dependency
    raise SystemExit(
        "OpenCC is required. Run: "
        "uv run --with opencc-python-reimplemented "
        "python tools/update_simplified_literary.py"
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
CC = OpenCC("t2s")


def load(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def dump(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def convert_ci() -> None:
    source_path = CONTENT / "ci-source.json"
    source = load(source_path)
    output = {
        "title": CC.convert(source["title"]),
        "outside_dates": source.get("outside_dates", {}),
        "separate_groups": source.get("separate_groups", []),
        "poems": [],
        "source_sha256": sha256(source_path),
    }
    for poem in source["poems"]:
        output["poems"].append(
            {
                "id": poem["id"],
                "voice": poem["voice"],
                "source_title": CC.convert(poem["source_title"]),
                "source_body": CC.convert(poem["source_body"]),
                "date": CC.convert(poem["date"]) if poem.get("date") else None,
            }
        )
    dump(CONTENT / "ci-simplified.json", output)


def convert_shi() -> None:
    source_path = CONTENT / "shi-source.json"
    source = load(source_path)
    output = {
        "title": CC.convert(source["title"]),
        "drafts": [],
        "source_sha256": sha256(source_path),
    }
    for draft in source["drafts"]:
        output["drafts"].append(
            {
                "title": CC.convert(draft["title"]),
                "parts": [
                    {
                        "number": CC.convert(part["number"]),
                        "body": CC.convert(part["body"]),
                    }
                    for part in draft["parts"]
                ],
            }
        )
    dump(CONTENT / "shi-simplified.json", output)


def main() -> int:
    convert_ci()
    convert_shi()
    print("updated content/ci-simplified.json and content/shi-simplified.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
