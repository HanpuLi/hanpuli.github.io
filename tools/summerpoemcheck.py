#!/usr/bin/env python3
"""Check the published R8 summer poem against its source and two-half formal design."""
from __future__ import annotations
import hashlib
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/"content/summer-poem.json"
HASHES={
 "zh": "86170ec8992e5e47a8c91a138e74de39242a734cf02d52e690eadbd2397ea061",
 "zh-hans": "8098895ae032fa946f1ba63a941bc2ac2aaf7b0c7f6320b513e543ec0957b73c"
}
SHAPE=[[10],[10,6,6,6],[5,7,7,8],[7,8,7,8],[7,8,8,8],[8,6,7,11],[8,8,6,7]]
def count_cjk(line:str)->int:
    return sum(1 for c in line if ("\u3400"<=c<="\u9fff") or ("\uf900"<=c<="\ufaff"))
def poem_parts(text:str):
    blocks=text.split("\n\n")
    assert len(blocks)==18,"R8 should contain two 7-stanza halves and four coda stanzas"
    a=[blocks[0],*blocks[1:6],blocks[6]]
    b=[blocks[7],*blocks[8:13],blocks[13]]
    assert blocks[6]==blocks[13],"R8 refrains must be identical"
    for i,(top,bottom,desired) in enumerate(zip(a,b,SHAPE)):
        x=[[count_cjk(line) for line in p.splitlines()] for p in (top,bottom)]
        assert x[0]==x[1]==desired,(i,x,desired)
    assert sum(len(p.splitlines()) for p in a)==25
    assert sum(count_cjk(line) for part in a for line in part.splitlines())==187
    return blocks

class VerseParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.current=None
        self.chunks=[]
        self.blocks=[]
    def handle_starttag(self,tag,attrs):
        vals=dict(attrs)
        if tag=="p" and "class" in vals and any(v in vals["class"].split() for v in ("summer-question","summer-stanza","summer-coda-stanza")):
            if self.current is not None:raise AssertionError("verse paragraphs nested")
            self.current=vals["class"]
            self.chunks=[]
    def handle_data(self,data):
        if self.current is not None:self.chunks.append(data)
    def handle_endtag(self,tag):
        if tag=="p" and self.current is not None:
            self.blocks.append("".join(self.chunks))
            self.current=None
            self.chunks=[]

def validate_edition(text: str, original: str) -> list[str]:
    blocks = text.split("\n\n")
    shape = [len(block.splitlines()) for block in original.split("\n\n")]
    assert [len(block.splitlines()) for block in blocks] == shape, "translated stanza/line structure changed"
    assert blocks[6] == blocks[13], "translated refrain differs on repetition"
    assert len(blocks[-1].splitlines()) == 2, "final question must retain its two-line break"
    return blocks


def check():
    errors=[]
    try:
        data=json.loads(SOURCE.read_text(encoding="utf-8"))
        languages=json.loads((ROOT/"content/languages.json").read_text(encoding="utf-8"))
        locale_ids = {l["id"] for l in languages}
        assert set(data["locales"]) == locale_ids
        assert set(data["texts"]) == locale_ids, "a published locale has no literary text"
        from poetry_library import Library
        library = Library(ROOT)
        tid = "summer-2017-revised-20261008"
        for lid in locale_ids:
            edition = library.edition(tid, lid)
            assert edition is not None, (lid, "missing library edition")
            assert data["texts"][lid] == edition["body"], (lid, "projection differs from canonical edition")
            validate_edition(edition["body"], data["texts"]["zh"])
            assert edition["title"] == edition["body"].split("\n\n")[0], (lid, "question/title mismatch")
        for script in ("zh","zh-hans"):
            original=data["texts"][script]
            assert hashlib.sha256(original.encode("utf-8")).hexdigest()==HASHES[script],("authored R8 changed",script)
            poem_parts(original)
        for lang in languages:
            lid=lang["id"]
            prefix="" if lid=="en" else f"{lid}/"
            path=ROOT/prefix/"poetry/summer-2017/index.html"
            src=path.read_text(encoding="utf-8")
            text = data["texts"][lid]
            parser=VerseParser()
            parser.feed(src)
            assert parser.blocks==text.split("\n\n"),(lid,"verse source differs in HTML")
            assert src.count('class="summer-question"')==2,(lid,"the questions use different markup")
            assert 'class="visually-hidden"' in src,(lid,"missing semantic title")
            assert src.count('class="summer-half ')==2,(lid,"missing parallel halves")
            assert f'<article class="summer-reading" lang="{lang["html_lang"]}">' in src, (lid, "wrong body language")
            assert re.search(r'<link rel="canonical" href="https://hanpuli.github.io/'+re.escape(prefix)+r'poetry/summer-2017/">',src)
            assert src.count('rel="alternate" hreflang=')>=7
            assert "2017" in src or "二〇一七" in src
            assert "2026" in src or "二〇二六" in src
            assert html.escape(text.split("\n\n")[0]) in src, (lid, "target-language title missing")
            shi=(ROOT/prefix/"shi.html").read_text(encoding="utf-8")
            assert f'href="/{prefix}poetry/summer-2017/"' in shi,(lid,"missing shi page entry")
            if lid not in ("zh","zh-hans"):
                assert data["locales"][lid]["original_notice"] in html.unescape(src), (lid, "language provenance missing")
                assert '<a class="summer-original-link" href="/zh/poetry/summer-2017/">' in src, (lid, "original link missing")
                assert text != data["texts"]["zh"], (lid, "Chinese fallback mistaken for a translation")
    except Exception as exc:
        errors.append(f"summerpoemcheck: {type(exc).__name__}: {exc}")
    return errors

if __name__=="__main__":
    errors=check()
    if errors:
        print("\n".join(errors),file=sys.stderr)
        raise SystemExit(1)
    print("summerpoemcheck: R8 original unchanged; Chinese 2×25-line/187-character mirror; five translations; 7 exact locale bodies, refrains, final line breaks and original links OK")
