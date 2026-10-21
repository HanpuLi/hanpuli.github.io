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
import tempfile
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from font_licensing import rename_ipa_subset, rename_ofl_subset

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
# Characters the site needs that I.MingCP 8.10 does not contain (first case:
# U+9E53 鹓, 2026-10-21) come from a second, pinned Ming/Song source. The
# derived face shares the CSS family "Hanpu Chinese" through its own
# @font-face rule and unicode-range, so no font stack changes. Noto Serif SC
# is already the site's pinned Simplified-Chinese source (rebuild-zh-hans-font.py);
# its wght 300 instance matches I.MingCP's stroke density on bird-radical
# characters (see CHINESE_FONT_LICENSES.txt).
GAP = {
    'family': 'Hanpu Chinese', 'name': 'Hanpu Chinese Gap', 'stem': 'hanpu-chinese-gap',
    'upstream_font': 'Noto Serif SC 2.003 (variable), wght 300 instance',
    'source_url': ('https://raw.githubusercontent.com/google/fonts/'
                   'f2bd09badbc763d8757951d52deec29da27e85fb/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf'),
    'source_sha256': '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9',
    'license': 'SIL Open Font License 1.1', 'wght': 300,
}


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
        # Rhyme marks repeat characters of the originals; their review notes are not published.
        if path.name == 'rhymes.json':
            continue
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


def css_range(css, family, stem):
    # Two @font-face rules share the family "Hanpu Chinese"; the font file
    # identifies which rule's range is meant.
    pattern = (r'(@font-face\s*\{(?=[^}]*font-family:\s*["\']'
               + re.escape(family) + r'["\'])(?=[^}]*fonts/' + re.escape(stem)
               + r'\.woff2)[^}]*unicode-range:\s*)([^;]+)(;)')
    found = re.findall(pattern, css, re.S)
    if len(found) != 1:
        raise SystemExit(f'Expected one CSS face for {family} ({stem}), found {len(found)}')
    return pattern, found[0][1]


def gap_source(directory):
    path = Path(directory) / 'gap-source.ttf'
    urllib.request.urlretrieve(GAP['source_url'], path)
    if digest(path.read_bytes()) != GAP['source_sha256']:
        raise SystemExit('Gap source hash differs from the pinned Noto Serif SC')
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = collect()
    if digest(SOURCE.read_bytes()) != SOURCE_SHA256:
        raise SystemExit('I.MingCP source hash differs from the verified 8.10 font')
    with TTFont(SOURCE) as original:
        missing = ''.join(c for c in text if ord(c) not in original.getBestCmap())
    report = {'schema': 1, 'upstream_font': 'I.MingCP 8.10', 'source_url': SOURCE_URL,
              'source_sha256': SOURCE_SHA256, 'license': 'IPA Font License Agreement v1.0',
              'character_count': len(text), 'character_set_sha256': digest(text.encode()), 'faces': []}
    for index, (family, stem) in enumerate(FACES):
        face_text = ''.join(c for c in text if (c in COMMON) == (index == 0) and c not in missing)
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
            pattern, actual = css_range(css, family, stem)
            if args.check:
                assert actual == range_text, f'{css_path}: stale {family} range'
            else:
                css = re.sub(pattern, lambda m: m.group(1) + range_text + m.group(3), css, count=1, flags=re.S)
                css_path.write_text(css)
        report['faces'].append({'family': family, 'file': target.name,
                                'character_count': len(face_text), 'bytes': target.stat().st_size,
                                'sha256': digest(target.read_bytes()), 'unicode_range': range_text})
    if missing:
        target = FONTS / (GAP['stem'] + '.woff2')
        if not args.check:
            with tempfile.TemporaryDirectory(prefix='hanpuli-chinese-gap-') as tmp:
                source = gap_source(tmp)
                original = TTFont(source)
                font = instancer.instantiateVariableFont(TTFont(source), {'wght': GAP['wght']})
                options = subset.Options()
                options.hinting = False
                options.layout_features = ['*']
                tool = subset.Subsetter(options=options)
                tool.populate(text=missing)
                tool.subset(font)
                if 'STAT' in font:  # a static instance; its axis records named dropped instances
                    del font['STAT']
                # Vertical text centres upright glyphs from ascent/descent, so the gap
                # glyph takes I.MingCP's metrics (scaled to its own em); with Noto's
                # it sat 0.05em off the column axis (page audit, 2026-10-21).
                with TTFont(SOURCE) as ming:
                    scale = font['head'].unitsPerEm / ming['head'].unitsPerEm
                    hhea, os2 = ming['hhea'], ming['OS/2']
                    font['hhea'].ascent = round(hhea.ascent * scale)
                    font['hhea'].descent = round(hhea.descent * scale)
                    font['hhea'].lineGap = round(hhea.lineGap * scale)
                    font['OS/2'].sTypoAscender = round(os2.sTypoAscender * scale)
                    font['OS/2'].sTypoDescender = round(os2.sTypoDescender * scale)
                    font['OS/2'].sTypoLineGap = round(os2.sTypoLineGap * scale)
                    font['OS/2'].usWinAscent = round(os2.usWinAscent * scale)
                    font['OS/2'].usWinDescent = round(os2.usWinDescent * scale)
                rename_ofl_subset(font, original, GAP['name'], GAP['name'].replace(' ', '') + '-Regular')
                font.flavor = 'woff2'
                font.save(target)
            (FONTS / (GAP['stem'] + '-characters.txt')).write_text(missing)
        with TTFont(target) as font:
            assert set(font.getBestCmap()) == {ord(c) for c in missing}, 'Gap face does not match missing glyphs'
            assert font['name'].getDebugName(1) == GAP['name']
            assert font['name'].getDebugName(13) and font['name'].getDebugName(14)
            assert all(t in font for t in ('vhea', 'vmtx'))
        range_text = ranges(missing)
        for css_path in (ROOT / 'assets/site.css', ROOT / 'content/poetry-voucher-app/studio.css'):
            css = css_path.read_text()
            pattern, actual = css_range(css, GAP['family'], GAP['stem'])
            if args.check:
                assert actual == range_text, f'{css_path}: stale {GAP["name"]} range'
            else:
                css = re.sub(pattern, lambda m: m.group(1) + range_text + m.group(3), css, count=1, flags=re.S)
                css_path.write_text(css)
        report['faces'].append({'family': GAP['family'], 'internal_name': GAP['name'], 'file': target.name,
                                'upstream_font': GAP['upstream_font'], 'source_url': GAP['source_url'],
                                'source_sha256': GAP['source_sha256'], 'license': GAP['license'],
                                'character_count': len(missing), 'bytes': target.stat().st_size,
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
