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


def trace_simple_returns(phrase: str, points: dict[int, str]) -> str:
    """Walk only ordinary レ / 二・一 / 三・二・一 marks.

    This traces the stated *glyph* order, not Japanese conjugations or
    lexical validity. Use it as independent evidence on selected tricky
    phrases; it must not be treated as a general kanbun philology oracle.
    """
    def one(index: int, limit: int) -> tuple[list[str], int]:
        mark = points.get(index)
        if mark == "レ":
            if index + 1 >= limit:
                raise ValueError("レ has no following glyph")
            inner, end = one(index + 1, limit)
            return inner + [phrase[index]], end
        if mark in ("二", "三"):
            stop = next((at for at in range(index + 1, limit)
                         if points.get(at) == "一"), None)
            if stop is None:
                raise ValueError("Nested return lacks closing 一")
            inner, end = whole(index + 1, stop + 1)
            if end != stop + 1:
                raise ValueError("Nested return consumed wrong glyph range")
            return inner + [phrase[index]], end
        return [phrase[index]], index + 1

    def whole(start: int, end: int) -> tuple[list[str], int]:
        order: list[str] = []
        at = start
        while at < end:
            segment, at = one(at, end)
            order.extend(segment)
        return order, at

    glyphs, cursor = whole(0, len(phrase))
    if cursor != len(phrase):
        raise ValueError("Unconsumed kanbun source")
    return "".join(glyphs)


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

    # Reconstruct glyph order independently for known nested clauses.
    # This test is intentionally narrower than a comprehensive Japanese
    # grammatical judgement and only certifies the recorded local order.
    for tid, phrase, reading_order in (
        ("jia-yi-a3-text", "未敢喚真真", "真真喚敢未"),
        ("jia-yi-a4-text", "逢人怕説西窗", "人逢西窗説怕"),
        ("jia-yi-a6-text", "似隔前生事", "前生事隔似"),
        ("jia-yi-b3-text", "恐花為我辭根", "花我為根辭恐"),
        ("jia-yi-b6-text", "失所憑", "憑所失"),
        ("jia-yi-b6-text", "非是無一字", "是一字無非"),
        ("manjianghong-2022-sewn-202610", "初景寒柯違業識", "初景寒柯業識違"),
        ("manjianghong-2022-echo-202610", "初景寒柯違業識", "初景寒柯業識違"),
    ):
        source = lib.edition(tid, "zh")["body"]
        pos = source.index(phrase)
        points = {mark["position"] - pos: mark["kaeriten"]
                  for mark in persisted[tid]["marks"]
                  if pos <= mark["position"] < pos + len(phrase)
                  and "kaeriten" in mark}
        actual = trace_simple_returns(phrase, points)
        if actual != reading_order:
            raise ValueError(f"Wrong glyph return order for {tid} {phrase}: {actual!r}")

    # The 読点 after 作 in 朝中措 does not terminate the syntactic return
    # to the two-character predicate's resulting silver-bell resonance.
    cross_tid = "chaozhongcuo-20181023-revised-202610"
    cross_phrase = "作，銀磬微鳴"
    cross_source = lib.edition(cross_tid, "zh")["body"]
    cross_start = cross_source.index(cross_phrase)
    cross_points = {
        mark["position"] - cross_start: mark["kaeriten"]
        for mark in persisted[cross_tid]["marks"]
        if cross_start <= mark["position"] < cross_start + len(cross_phrase)
        and "kaeriten" in mark
    }
    if trace_simple_returns(cross_phrase, cross_points).replace("，", "") != "銀磬微鳴作":
        raise ValueError("作 must follow 銀磬微鳴 across the caesura")

    # Compound predicates cannot be moved as two-character units by
    # a 二...一 on only their first or second glyph. Annotating the
    # Japanese order in 書き下し文 is preferable to displaying a false trace.
    for tid, phrase, editorial_gloss in (
        ("jia-yi-a7-text", "灌溉朝昏", "灌漑"),
        ("manjianghong-rereading-202610-text", "鎖盡諸門", "鎖し尽くす"),
        ("yingtianchang-20261008-text", "聽盡無聲", "聴き尽くす"),
        ("mantingfang-20191219-revised-202610", "驚散夢中弦", "夢中の弦を驚かし散ず"),
        ("jia-yi-b4-text", "認作、一諾窮年", "一諾年を窮むる"),
        ("linjiangxian-20260909-text", "垂到地", "地に垂れ到り"),
    ):
        source = lib.edition(tid, "zh")["body"]
        start = source.index(phrase)
        misleading = [mark for mark in persisted[tid]["marks"]
                      if start <= mark["position"] < start + len(phrase)
                      and "kaeriten" in mark]
        if misleading:
            raise ValueError("Spurious single-glyph return on compound: " + tid)
        if not any(editorial_gloss in note for note in persisted[tid].get("notes", [])):
            raise ValueError("Missing explanatory Japanese compound reading: " + tid)

    # The source character carries ここ as furigana; the Japanese body keeps the
    # reviewed 此こ writing (訓読審校 2026-10-14, #47) with the same reading.
    for tid, source_phrase, expected_text in (
        ("fengrusong-20181102-revised-202610", "至此", "此こに至り"),
        ("jia-yi-a10-text", "立此", "此こに立つ"),
    ):
        chinese = lib.edition(tid, "zh")["body"]
        char_index = chinese.index(source_phrase) + len(source_phrase) - 1
        char_mark = next((mark for mark in persisted[tid]["marks"]
                          if mark["position"] == char_index), None)
        if not char_mark or char_mark.get("furigana") != "ここ":
            raise ValueError("Missing verified ここ reading on 此: " + tid)
        if expected_text not in Kundoku(lib).texts[tid]["body"]:
            raise ValueError("Kundoku no longer reads 此 as ここ: " + tid)

    # An uncommon classical expression is retained rather than normalized
    # to casual modern prose, but its pronunciation must be available.
    sakashima_tid = "yingtianchang-20261008-text"
    sakashima_source = lib.edition(sakashima_tid, "zh")["body"]
    sakashima_pos = sakashima_source.index("杯倒置") + 1
    sakashima_mark = next((mark for mark in persisted[sakashima_tid]["marks"]
                           if mark["position"] == sakashima_pos), None)
    if not sakashima_mark or sakashima_mark.get("furigana") != "さか":
        raise ValueError("Missing さか reading in 倒しま")
    if "倒しまに置かれ" not in Kundoku(lib).texts[sakashima_tid]["body"]:
        raise ValueError("Kundoku no longer reads 倒置 as 倒しまに置かれ")

    Kunten(lib)  # valid marks/return levels and original hashes
    print("kanbun manuscript check:", len(entries), "annotated editorial editions, "
          "matching canonical Chinese originals and compiled output")


if __name__ == "__main__":
    main()
