#!/usr/bin/env python3
"""Build tiny deterministic webfont subsets for symbols missing from the Latin faces."""
from __future__ import annotations
import hashlib, tempfile, urllib.request
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT=Path(__file__).resolve().parents[1]
FONTS=ROOT/'assets/fonts'
COMMIT='23e54b51ddffbc7713c583748e3bd86f62b1fa4a'
SPECS=[
 ('site-serif-symbols.woff2',f'https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf','ef9512f92f6d579e5dc75af59a5a4b1b8b47d2eda89e00b954d44520e5369027'),
 ('site-mono-symbols.woff2',f'https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl/cousine/Cousine-Regular.ttf','1da22250675fc4c42fcf3a9736c44bc0570516105331443b663fd5cfbd1412fe'),
]
TEXT='Δ≈'
for name,url,expected in SPECS:
    with tempfile.TemporaryDirectory() as td:
        source=Path(td)/'source.ttf'
        urllib.request.urlretrieve(url,source)
        got=hashlib.sha256(source.read_bytes()).hexdigest()
        if got!=expected: raise SystemExit(f'{name}: source hash mismatch {got}')
        font=TTFont(source)
        options=subset.Options(); options.flavor='woff2'; options.hinting=False
        sub=subset.Subsetter(options=options); sub.populate(text=TEXT); sub.subset(font)
        out=FONTS/name; font.save(out)
        check=TTFont(out).getBestCmap()
        missing=[c for c in TEXT if ord(c) not in check]
        if missing: raise SystemExit(f'{name}: missing {missing}')
        print(name,hashlib.sha256(out.read_bytes()).hexdigest(),out.stat().st_size)
