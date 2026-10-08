#!/usr/bin/env python3
"""Verify migrated literary bodies, memberships, editions and published readers.

The migration fixture records baseline body hashes independently of the builder.
Changing the renderer or its own data validation cannot make changed poems pass.
"""
from __future__ import annotations
import hashlib
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import poetry_model as model

ROOT = model.ROOT


class Reader(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.bodies = []
        self.ids = []
        self.links = []
        self.active = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])
        if tag == 'div' and 'body' in attrs.get('class', '').split():
            if self.active is not None:
                raise AssertionError('Nested poem body')
            self.active = []
        self.stack.append(tag)

    def handle_data(self, text):
        if self.active is not None:
            self.active.append(text)

    def handle_endtag(self, tag):
        if tag == 'div' and self.active is not None:
            self.bodies.append(''.join(self.active))
            self.active = None


def check_baseline(data):
    fixture = model.read(ROOT / 'tests/poetry-migration.json')
    actual = {}
    for work in data['works']:
        for version in work['versions']:
            for part in version['parts']:
                for locale, edition in part['editions'].items():
                    if 'legacy_ci' in part:
                        key = 'ci:' + part['legacy_ci'] + ':' + locale
                    elif part.get('legacy_voucher', '').startswith('shi-d'):
                        d, p = re.fullmatch(r'shi-d(\d+)-(\d+)', part['legacy_voucher']).groups()
                        key = f'shi:{d}:{p}:{locale}'
                    elif work['id'] == 'summer-2017':
                        key = 'summer:' + locale
                    else:
                        continue
                    if key in actual:
                        raise AssertionError('Same baseline text mapped twice: ' + key)
                    actual[key] = hashlib.sha256(edition['body'].encode()).hexdigest()
    # Freeze the baseline bodies, not the future size of the catalogue.
    # New authored works or translations may be added without editing this fixture.
    assert all(actual.get(key) == value for key, value in fixture['body_sha256'].items()), 'An existing original/translation body was altered, lost or reassigned'
    cycle = next(c for c in data['collections'] if c['id'] == 'jia-yi')
    assert cycle['members'] == fixture['jia_yi_members'], 'Author-ordered seventeen-member Jia/Yi sequence changed'
    assert len(cycle['members']) == 17 and cycle['members'][-1] == 'jia-yi-a10'
    w12 = next(w for w in data['works'] if w['id'] == 'queqiaoxian-20181222')
    assert w12['composed']['start'] == '2018-12-22'
    assert w12['route'] == 'poetry/queqiaoxian-20181222/'
    rewrites = next(w for w in data['works'] if w['id'] == 'manjianghong-2022')
    assert [v['id'] for v in rewrites['versions']] == ['sewn', 'echo']
    response = next(w for w in data['works'] if w['id'] == 'manjianghong-rereading-202610')
    assert response['responds_to'] == rewrites['id']
    roof = next(w for w in data['works'] if w['id'] == 'roof')
    assert [len(v['parts']) for v in roof['versions']] == [2, 2]
    assert all(w.get('voice') in ('jia', 'yi', None) for w in data['works'])
    return len(fixture['body_sha256'])


def check():
    data = model.load()
    bodies = check_baseline(data)
    stale = model.synchronize(check=True)
    assert not stale, 'Stale registry projections: ' + ', '.join(str(x.relative_to(ROOT)) for x in stale)
    ui = model.read(ROOT / 'content/poetry/ui.json')
    assert set(ui) == set(model.LANGUAGES)
    assert all(set(copy) == set(ui['en']) for copy in ui.values())
    public = model.read(ROOT / 'poetry-voucher/editions.json')
    source = model.read(ROOT / 'content/poetry-voucher-app/editions.json')
    assert public == source, 'Public voucher bundle is stale'
    assert len({x['id'] for x in public['works']}) == len(public['works'])
    assert all(x['work_id'] in {w['id'] for w in data['works']} for x in public['works'])
    assert public['aliases']['ci-w12'] == 'queqiaoxian-20181222'
    assert not any(re.fullmatch(r'(?:W\d+|D\d+\.\d+)', x['source_id']) for x in public['works']), 'Legacy admission codes still displayed on new editions'
    summer = next(x for x in public['works'] if x['work_id'] == 'summer-2017')
    summer_work = next(w for w in data['works'] if w['id'] == 'summer-2017')
    available = set(summer_work['versions'][0]['parts'][0]['editions']) - {'zh'}
    assert set(summer['translations']) == {('zh-Hans' if l == 'zh-hans' else l) for l in available}, 'Unpublished summer translation was invented'
    for x in public['works']:
        assert x['identity_schema'] == 2
        w = next(w for w in data['works'] if w['id'] == x['work_id'])
        assert x['work_titles'] == {l: model.title(w,l) for l in model.LANGUAGES}
        for old in x['legacy_ids']:
            assert public['aliases'][old] == x['id']
        parsed = urlsplit(x['source_url'])
        assert parsed.netloc == 'hanpuli.github.io' and parsed.path.startswith('/poetry/')
        target = ROOT / parsed.path.lstrip('/') / 'index.html'
        assert target.is_file(), 'Voucher links to missing work: ' + x['id']
        if parsed.fragment:
            assert unquote(parsed.fragment) in Reader(target.read_text()).ids
    docs = {}
    paths = {'poetry/'} | {c['route'] for c in data['collections']} | {w['route'].split('#')[0] for w in data['works']}
    for locale in model.LANGUAGES:
        for route in paths:
            path = ROOT / model.local_path(route, locale).lstrip('/') / 'index.html'
            raw = path.read_text(encoding='utf-8')
            reader = Reader(raw)
            assert len(reader.ids) == len(set(reader.ids)), 'Repeated anchor: ' + str(path)
            assert 'content="noindex' not in raw
            assert raw.count('rel="alternate" hreflang=') == 8, str(path)
            canonical = 'https://hanpuli.github.io' + model.local_path(route, locale)
            assert f'<link rel="canonical" href="{canonical}">' in raw
            assert model.local_path('poetry/', locale) in reader.links or route == 'poetry/'
            assert not any(re.search(r'\b(?:W\d+|ci-w\d+)\b', html.unescape(re.sub('<[^>]*>', '', raw))) for _ in [0]), str(path)
            docs[(locale, route)] = reader
        index = docs[(locale, 'poetry/')]
        for node in model.catalogue_nodes(data):
            assert model.local_path(node['route'], locale) in index.links, (locale, node['id'])
        for w in data['works']:
            if w.get('layout') == 'mirror':
                continue  # Independently checked by summerpoemcheck.py.
            reader = docs[(locale, w['route'].split('#')[0])]
            for v in w['versions']:
                for p in v['parts']:
                    needed = ['zh-hans' if locale == 'zh-hans' else 'zh']
                    if locale not in ('zh','zh-hans') and locale in p['editions']:
                        needed.append(locale)
                    for l in needed:
                        assert p['editions'][l]['body'] in reader.bodies, (locale, w['id'], v['id'], p['id'], l)
                    assert model.part_fragment(w,v,p) in reader.ids
                    shop = '/poetry-voucher/shop.html?lang=' + {'zh':'zh-Hant','zh-hans':'zh-Hans'}.get(locale,locale) + '&work=' + model.edition_id(w,v,p)
                    assert shop in reader.links
        for c in data['collections']:
            reader = docs[(locale,c['route'])]
            for wid in c['members']:
                work = next(w for w in data['works'] if w['id']==wid)
                anchor = work['route'].split('#')[1] if '#' in work['route'] else work['id']
                assert '#' + anchor in reader.links and anchor in reader.ids
        prefix = '' if locale=='en' else locale+'/'
        legacy = Reader((ROOT / prefix / 'ci.html').read_text())
        assert set(data['legacy_ci_order']) <= set(legacy.ids)
        for old in data['legacy_ci_order']:
            part = next((w,v,p) for w in data['works'] for v in w['versions'] for p in v['parts'] if p.get('legacy_ci')==old)
            assert model.local_path(model.part_route(*part),locale) in legacy.links
    print(f'poetryregistrycheck: {bodies} unchanged baseline bodies; {len(data["works"])} works, seventeen Jia/Yi members; {len(public["works"])} edition-parts; {len(docs)} canonical readers and legacy links OK')


if __name__ == '__main__':
    check()
