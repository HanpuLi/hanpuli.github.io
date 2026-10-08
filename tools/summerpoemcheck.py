#!/usr/bin/env python3
"""Check the published R8 summer poem against its source and two-half formal design."""
from __future__ import annotations
import hashlib
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

def check():
    errors=[]
    try:
        data=json.loads(SOURCE.read_text(encoding="utf-8"))
        languages=json.loads((ROOT/"content/languages.json").read_text(encoding="utf-8"))
        assert set(data["locales"])=={l["id"] for l in languages}
        for script in ("zh","zh-hans"):
            original=data["texts"][script]
            assert hashlib.sha256(original.encode("utf-8")).hexdigest()==HASHES[script],("authored R8 changed",script)
            poem_parts(original)
        for lang in languages:
            lid=lang["id"]
            prefix="" if lid=="en" else f"{lid}/"
            path=ROOT/prefix/"poetry/summer-2017/index.html"
            src=path.read_text(encoding="utf-8")
            selection="zh-hans" if lid=="zh-hans" else "zh"
            text=data["texts"][selection]
            parser=VerseParser()
            parser.feed(src)
            assert parser.blocks==text.split("\n\n"),(lid,"verse source differs in HTML")
            assert src.count('class="summer-question"')==2,(lid,"the questions use different markup")
            assert 'class="visually-hidden"' in src,(lid,"missing semantic title")
            assert src.count('class="summer-half ')==2,(lid,"missing parallel halves")
            assert ('lang="zh-Hans"' if lid=="zh-hans" else 'lang="zh-Hant-HK"') in src
            assert re.search(r'<link rel="canonical" href="https://hanpuli.github.io/'+re.escape(prefix)+r'poetry/summer-2017/">',src)
            assert src.count('rel="alternate" hreflang=')>=7
            assert "2017" in src or "二〇一七" in src
            assert "2026" in src or "二〇二六" in src
            assert "夏天" in src or "夏天" in text
            shi=(ROOT/prefix/"shi.html").read_text(encoding="utf-8")
            assert f'href="/{prefix}poetry/summer-2017/"' in shi,(lid,"missing shi page entry")
            if lid not in ("zh","zh-hans"):
                assert data["locales"][lid]["original_notice"] in src,(lid,"language provenance missing")
    except Exception as exc:
        errors.append(f"summerpoemcheck: {type(exc).__name__}: {exc}")
    return errors

if __name__=="__main__":
    errors=check()
    if errors:
        print("\n".join(errors),file=sys.stderr)
        raise SystemExit(1)
    print("summerpoemcheck: R8 original unchanged; 2×25-line/187-character mirror; 7 routes with exact stanza text, language and entrypoints OK")
