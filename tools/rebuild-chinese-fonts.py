#!/usr/bin/env python3
"""Build the shared Traditional/Simplified I.MingCP-derived webfont subsets.

Run after build_site.py using uv run --with fonttools --with brotli python
tools/rebuild-chinese-fonts.py. --check verifies coverage, licence metadata,
source/character hashes and the CSS ranges without changing files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from font_licensing import rename_ipa_subset

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'assets/fonts'
SOURCE = Path.home() / 'Library/Fonts/I.MingCP-8.10.ttf'
SOURCE_URL = 'https://raw.githubusercontent.com/ichitenfont/I.Ming/master/8.10/I.MingCP-8.10.ttf'
SOURCE_SHA256 = '1c411a2e97b65c26aaa01707bbe06919569fcd7683c8bb5db114a96264710458'
LICENCE_URL = 'https://raw.githubusercontent.com/ichitenfont/I.Ming/master/8.10/IPA_Font_License_Agreement_v1.0.md'
COMMON = set('李函璞留證证詞词繁简日')
PUNCTUATION = set('—–…“”‘’·，。、；：？！「」『』（）《》〈〉')
FACES = [('Hanpu Chinese Common', 'hanpu-chinese-common'),
         ('Hanpu Chinese', 'hanpu-chinese')]


def wanted(char):
    code = ord(char)
    return (char in PUNCTUATION or 0x2E80 <= code <= 0x303F
            or 0x3100 <= code <= 0x312F or 0x3400 <= code <= 0x9FFF
            or 0xF900 <= code <= 0xFAFF or 0xFF00 <= code <= 0xFFEF
            or 0x20000 <= code <= 0x323AF)


class BodyText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.body = False
        self.hidden = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == 'body':
            self.body = True
        if tag in ('script', 'style'):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag == 'body':
            self.body = False
        if tag in ('script', 'style'):
            self.hidden -= 1

    def handle_data(self, text):
        if self.body and not self.hidden:
            self.parts.append(text)


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from strings(child)


def collect():
    chars = set(COMMON | PUNCTUATION)
    # Only tracked public HTML: private worktrees and authoring templates must
    # not become accidental font inputs. JSON includes runtime/conditional copy.
    tracked = subprocess.check_output(['git', 'ls-files', '-z', '*.html'], cwd=ROOT).decode().split('\0')
    for name in tracked:
        if not name or name.startswith(('templates/', 'mail-assistant/')):
            continue
        parser = BodyText()
        parser.feed((ROOT / name).read_text())
        chars.update(c for c in ''.join(parser.parts) if wanted(c))
    for path in (ROOT / 'content').rglob('*.json'):
        for text in strings(json.loads(path.read_text())):
            chars.update(c for c in text if wanted(c))
    for name in ('i18n.js', 'shop-copy.js'):
        text = (ROOT / 'content/poetry-voucher-app' / name).read_text()
        chars.update(c for c in text if wanted(c))
    # The regional profile's existing glyph probe covers copy returned by its
    # endpoint. Keep that coverage without copying conditional text into JSON.
    profile = (ROOT / 'assets/profile-credit.js').read_text()
    for code in re.findall(r'\\u([0-9a-fA-F]{4})', profile):
        char = chr(int(code, 16))
        if wanted(char):
            chars.add(char)
    # Preserve separately maintained runtime profile glyphs already present in
    # the old CJK assets, without admitting Japanese kana into the Chinese face.
    for name in ('shippori-mincho-subset.woff2', 'iming-gap.woff2', 'hanpu-cjk-gap.woff2'):
        path = FONTS / name
        if path.exists():
            with TTFont(path) as font:
                chars.update(chr(c) for c in font.getBestCmap() if wanted(chr(c)))
    return ''.join(sorted(chars))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def ranges(text):
    groups = []
    for code in sorted(map(ord, text)):
        if groups and code == groups[-1][1] + 1:
            groups[-1][1] = code
        else:
            groups.append([code, code])
    return ', '.join(f'U+{a:04X}' if a == b else f'U+{a:04X}-{b:04X}' for a, b in groups)


def css_range(css, family):
    pattern = (r'(@font-face\s*\{(?=[^}]*font-family:\s*["\']'
               + re.escape(family) + r'["\'])[^}]*unicode-range:\s*)([^;]+)(;)')
    found = re.search(pattern, css, re.S)
    if not found:
        raise SystemExit(f'Missing CSS face: {family}')
    return pattern, found.group(2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = collect()
    if digest(SOURCE.read_bytes()) != SOURCE_SHA256:
        raise SystemExit('I.MingCP source hash differs from the verified 8.10 font')
    with TTFont(SOURCE) as original:
        missing = [c for c in text if ord(c) not in original.getBestCmap()]
    if missing:
        raise SystemExit('Missing original glyphs: ' + ''.join(missing))
    report = {'schema': 1, 'upstream_font': 'I.MingCP 8.10', 'source_url': SOURCE_URL,
              'source_sha256': SOURCE_SHA256, 'license': 'IPA Font License Agreement v1.0',
              'character_count': len(text), 'character_set_sha256': digest(text.encode()), 'faces': []}
    for index, (family, stem) in enumerate(FACES):
        face_text = ''.join(c for c in text if (c in COMMON) == (index == 0))
        target = FONTS / (stem + '.woff2')
        if not args.check:
            font = TTFont(SOURCE)
            options = subset.Options()
            options.hinting = False
            options.layout_features = ['*']
            tool = subset.Subsetter(options=options)
            tool.populate(text=face_text)
            tool.subset(font)
            rename_ipa_subset(font, TTFont(SOURCE), family, family.replace(' ', '') + '-Regular')
            font.flavor = 'woff2'
            font.save(target)
            (FONTS / (stem + '-characters.txt')).write_text(face_text)
        with TTFont(target) as font:
            assert all(ord(c) in font.getBestCmap() for c in face_text)
            assert font['name'].getDebugName(1) == family
            assert font['name'].getDebugName(13) and font['name'].getDebugName(14)
            assert all(t in font for t in ('vhea', 'vmtx'))
            if index == 1:
                assert 'vert' in {f.FeatureTag for f in font['GSUB'].table.FeatureList.FeatureRecord}
        range_text = ranges(face_text)
        for css_path in (ROOT / 'assets/site.css', ROOT / 'content/poetry-voucher-app/studio.css'):
            css = css_path.read_text()
            pattern, actual = css_range(css, family)
            if args.check:
                assert actual == range_text, f'{css_path}: stale {family} range'
            else:
                css = re.sub(pattern, lambda m: m.group(1) + range_text + m.group(3), css, flags=re.S)
                css_path.write_text(css)
        report['faces'].append({'family': family, 'file': target.name,
                                'character_count': len(face_text), 'bytes': target.stat().st_size,
                                'sha256': digest(target.read_bytes()), 'unicode_range': range_text})
    meta = FONTS / 'hanpu-chinese.meta.json'
    if args.check:
        assert json.loads(meta.read_text()) == report, 'Stale Chinese font metadata'
        assert (FONTS / 'IPA_Font_License_Agreement_v1.0.txt').exists()
    else:
        meta.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        license_path = FONTS / 'IPA_Font_License_Agreement_v1.0.txt'
        if not license_path.exists():
            data = urllib.request.urlopen(LICENCE_URL, timeout=30).read()
            assert b'Article 3 (Restriction)' in data
            license_path.write_bytes(data)
    print(json.dumps({k: v for k, v in report.items() if k != 'faces'}, ensure_ascii=False))
    for row in report['faces']:
        print(f"{row['family']}: {row['character_count']} characters, {row['bytes']} bytes")


if __name__ == '__main__':
    main()
