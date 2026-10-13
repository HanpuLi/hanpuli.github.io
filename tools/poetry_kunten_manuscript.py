"""Human-authored kanbun transcription compiler for the poetry edition.

Annotation syntax: (furigana), {okurigana}, [kaeriten],
‹saidoku-furigana›«saidoku-okurigana». The Chinese characters, original
punctuation, and line/stanza breaks must be byte-for-byte identical to
the authoritative zh source after stripping annotations. Never infer
readings or return marks from a Japanese translation.
"""
from __future__ import annotations
import hashlib
import json
import re
from pathlib import Path

from poetry_library import Library, read
from poetry_kunten import Kunten
from poetry_kundoku import Kundoku

OPEN = {"(": (")", "furigana"), "{": ("}", "okurigana"),
        "[": ("]", "kaeriten"), "‹": ("›", "saidoku_furigana"),
        "«": ("»", "saidoku_okurigana")}


def compile_manuscript(source: str, manuscript: str) -> list[dict]:
    marks = {}
    chars = []
    index = -1
    cursor = 0
    while cursor < len(manuscript):
        ch = manuscript[cursor]
        if ch in OPEN:
            closer, key = OPEN[ch]
            end = manuscript.find(closer, cursor + 1)
            if end < cursor + 2 or index < 0:
                raise ValueError(f"Invalid editorial mark at {cursor}: {ch!r}")
            mark = marks.setdefault(index, {"position": index, "char": source[index]})
            if key in mark:
                raise ValueError(f"Duplicate {key} at source character {index}")
            mark[key] = manuscript[cursor + 1:end]
            cursor = end + 1
        else:
            index += 1
            if index >= len(source) or source[index] != ch:
                before = source[index] if index < len(source) else "(end)"
                raise ValueError(f"Source mismatch at {index}: expected {before!r}, got {ch!r}, "
                                 f"context {manuscript[max(0,cursor-22):cursor+22]!r}")
            chars.append(ch)
            cursor += 1
    if "".join(chars) != source:
        raise ValueError("Source text omitted or added characters")
    return list(marks.values())


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    lib = Library(root)
    entries = read(root / "content/poetry/kunten-manuscripts.json")["texts"]
    persisted = read(root / "content/poetry/kunten.json")["texts"]
    if set(entries) != set(persisted):
        raise ValueError("Manuscript/compiled annotation coverage differs")
    if set(entries) != set(Kundoku(lib).texts):
        raise ValueError("Not all classical texts have editorial manuscript marks")
    for tid, entry in entries.items():
        source = lib.edition(tid, "zh")["body"]
        expected = {
            "source_body_sha256": hashlib.sha256(source.encode("utf8")).hexdigest(),
            "status": "pilot-reviewed", "marks": compile_manuscript(source, entry["annotated"]),
        }
        if "notes" in persisted[tid]:
            expected["notes"] = entry.get("notes", [])
        elif entry.get("notes"):
            raise ValueError("Missing compiled notes: " + tid)
        # Editing the manuscript without regenerating the compiled edition
        # must block the site build / release.
        if persisted[tid] != expected:
            raise ValueError("Stale or different compiled annotations: " + tid)
    # The author's explicit modern/semantic exceptions must never acquire
    # plausible-looking historical 返り点 merely to fill the annotation grid.
    for tid, phrase, note_keyword in (
        ("jia-yi-a10-text", "認不真，卻認真", "現代中国語"),
        ("queqiaoxian-20181222-revised-202610", "未消尺素", "手紙を必要としない"),
    ):
        source = lib.edition(tid, "zh")["body"]
        start = source.index(phrase)
        protected = set(range(start, start + len(phrase)))
        if any(mark["position"] in protected for mark in persisted[tid]["marks"]):
            raise ValueError("Protected authorial idiom was assigned kanbun marks: " + tid)
        if not any(note_keyword in note for note in persisted[tid].get("notes", [])):
            raise ValueError("Missing authorial explanation for exceptional phrase: " + tid)
    # Nested 返り点 is a *sequence*, not merely balanced counts. Keep
    # explicit source-character assertions for difficult editorial clauses;
    # a successful HTML render cannot establish the correct Japanese order.
    for tid, phrase, required in (
        ("jia-yi-a6-text", "似隔前生事", {0: "三", 1: "二", 4: "一"}),
        ("jia-yi-b3-text", "恐花為我辭根",
         {0: "三", 2: "レ", 4: "二", 5: "一"}),
    ):
        source = lib.edition(tid, "zh")["body"]
        start = source.index(phrase)
        actual = {
            mark["position"] - start: mark["kaeriten"]
            for mark in persisted[tid]["marks"]
            if start <= mark["position"] < start + len(phrase)
            and "kaeriten" in mark
        }
        if actual != required:
            raise ValueError("Unexpected nested return order for " + tid)
    # レ only returns over one immediately following character. Enforce
    # full spans for recurring two-character objects.
    for tid,phrase in (
        ("manjianghong-2022-sewn-202610","縫新隙"),
        ("manjianghong-2022-sewn-202610","須揀擇"),
        ("manjianghong-2022-sewn-202610","看收場"),
        ("mantingfang-20191219-revised-202610","過眉山"),
    ):
        source = lib.edition(tid,"zh")["body"]
        start = source.index(phrase)
        actual = {
            mark["position"] - start: mark["kaeriten"]
            for mark in persisted[tid]["marks"]
            if start <= mark["position"] < start+len(phrase) and "kaeriten" in mark
        }
        if actual != {0:"二",2:"一"}:
            raise ValueError("Multicharacter object requires a full 二/一 return: "+tid+" "+phrase)
    for tid, char, note_key in (
        ("jia-yi-a6-text", "把", "把構文"),
        ("jia-yi-b3-text", "不是", "不是構文"),
    ):
        source = lib.edition(tid, "zh")["body"]
        start = source.index(char)
        phrase_positions = set(range(start, start + len(char)))
        if any(mark["position"] in phrase_positions and
               "kaeriten" in mark for mark in persisted[tid]["marks"]):
            raise ValueError("Unsupported classical points on modern Chinese clause: " + tid)
        if not any(note_key in note for note in persisted[tid].get("notes", [])):
            raise ValueError("Missing explanation for modern Chinese structure: " + tid)
    tid = "jia-yi-a6-text"
    source = lib.edition(tid, "zh")["body"]
    root_position = source.index("痴根") + 1
    root = next((mark for mark in persisted[tid]["marks"]
                 if mark["position"] == root_position), {})
    if root.get("okurigana") != "ヲ":
        raise ValueError("痴根 / 草 boundary must not be collapsed into 痴根草")

    special = "linjiangxianyin-20191028-revised-202610"
    source = lib.edition(special, "zh")["body"]
    position = source.index("礄")
    mark = next((m for m in persisted[special]["marks"] if m["position"] == position), None)
    if not mark or mark.get("furigana") != "いし" or not any(
        "辞書" in note for note in persisted[special].get("notes", [])
    ):
        raise ValueError("Contextual reading of 礄 lacks editorial boundary")
    # 「蘸得毫端黑」: 得 is a result complement, not an independent
    # Japanese テ syllable. The Japanese 書き下し already reads 蘸して
    # 毫端黒く; inserting 得テ duplicates the connector.
    result_tid = "zhegutian-20260909-text"
    result_source = lib.edition(result_tid, "zh")["body"]
    result_position = result_source.index("蘸得") + 1
    result_mark = next((mark for mark in persisted[result_tid]["marks"]
                        if mark["position"] == result_position), {})
    if any(field in result_mark for field in ("okurigana", "furigana")):
        raise ValueError("Spurious independent kana on 蘸得 result complement")
    if not any("結果補語" in note for note in persisted[result_tid].get("notes", [])):
        raise ValueError("Missing explanation of 蘸得 result complement")

    Kunten(lib)  # valid marks/return levels and original hashes
    print("kanbun manuscript check:", len(entries), "annotated editorial editions, "
          "matching canonical Chinese originals and compiled output")


if __name__ == "__main__":
    main()
