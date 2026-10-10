#!/usr/bin/env python3
"""Check work/version ownership, preserved text, canonical routes and migration links."""
from __future__ import annotations
import hashlib
import html
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from poetry_library import Library, LANGS, materialize, read
from poetry_kundoku import Kundoku

ROOT=Path(__file__).resolve().parents[1]


def main() -> None:
    library=Library(ROOT)
    kundoku=Kundoku(library)
    fixture=read(ROOT/'tools/fixtures/poetry-before-refactor.json')
    errors=[]
    for key,expected in fixture['body_sha256'].items():
        tid,locale=key.rsplit('/',1)
        edition=library.edition(tid,locale)
        if edition is None or hashlib.sha256(edition['body'].encode()).hexdigest()!=expected:
            errors.append('Migration altered an existing literary text: '+key)
    if materialize(check=True):
        errors.append('Generated compatibility/catalogue data differs from the library')
    ordered=['jia-yi-'+p for p in ['a1','b1','a2','b2','b3','b4','b5','a3','a4','a5','a6','a7','b6','a8','b7','a9','a10']]
    # This is the author's existing order, not a hard upper bound on future membership.
    current=library.collections['jia-yi']['members']
    if [wid for wid in current if wid in ordered] != ordered:
        errors.append('Existing A/B members or their authorial order were lost')
    if library.works['jia-yi-a10']['form']!='qu':
        errors.append('The cycle must preserve the qu form of A10')
    if library.works['queqiaoxian-20181222']['composed']['start']!='2018-12-22':
        errors.append('The confirmed Queqiaoxian date was lost')
    if len(library.works['roof-splits']['versions'])!=2 or any(len(library.versions[v]['parts'])!=2 for v in library.works['roof-splits']['versions']):
        errors.append('Roof is a two-part work in two retained drafts')
    if library.versions['manjianghong-2022-sewn-202610']['work']!=library.versions['manjianghong-2022-echo-202610']['work']:
        errors.append('Two rewritings of Manjianghong lost their common work')
    if library.versions['manjianghong-rereading-202610-text']['work']=='manjianghong-2022':
        errors.append('The independent later response was collapsed into a draft')
    # Edition order belongs to version metadata. The unnumbered Chinese title
    # must not silently acquire “I”/“一” in any translated literary title.
    for lid in ('en','ja','de','fr','ru'):
        first_title = library.edition('manjianghong-2022-sewn-202610', lid)['title']
        other_title = library.edition('manjianghong-2022-echo-202610', lid)['title']
        if re.search(r'(?:\s*[—–-]\s*(?:I|1)|\s*·\s*一)\s*$', first_title):
            errors.append(f'{lid} Manjianghong first rewriting: extraneous ordinal in title')
        if first_title == other_title:
            errors.append(f'{lid} Manjianghong rewritings: indistinguishable translated titles')
    routes_checked=0
    body_checks=0
    for locale in LANGS:
        for route in library.routes():
            path=ROOT/library.path(route,locale).strip('/')/'index.html'
            if not path.is_file():
                errors.append('Missing canonical reading route: '+str(path.relative_to(ROOT)));continue
            document=path.read_text(encoding='utf-8')
            canonical='https://hanpuli.github.io'+library.path(route,locale)
            if f'rel="canonical" href="{canonical}"' not in document:
                errors.append('Wrong canonical: '+str(path.relative_to(ROOT)))
            if len(re.findall(r'<link rel="alternate" hreflang=',document))!=len(LANGS)+1:
                errors.append('Incomplete language family: '+str(path.relative_to(ROOT)))
            if re.search(r'{{[A-Za-z0-9_.]+}}',document):
                errors.append('Unresolved template: '+str(path.relative_to(ROOT)))
            if route!='summer-2017':
                for tid,body in re.findall(r'<article\b[^>]*data-poetry-text="([^"]+)"[^>]*>(.*?)</article>',document,re.S):
                    actual=[html.unescape(s) for s in re.findall(r'<div class="body">(.*?)</div>',body,re.S)]
                    expected=[library.edition(tid,'zh-hans' if locale=='zh-hans' else 'zh')['body']]
                    if locale not in ('zh','zh-hans') and library.edition(tid,locale):
                        expected.append(library.edition(tid,locale)['body'])
                    classical=library.work_for_text(tid)['form'] in ('ci','shi','qu')
                    if locale=='ja' and classical:
                        expected.append(kundoku.body(tid))
                    reading=re.search(r'<details\b[^>]*data-poetry-kundoku="([^"]+)"',body)
                    if bool(reading)!=(locale=='ja' and classical) or (reading and reading[1]!=tid):
                        errors.append(f'Wrong kundoku ownership: {path.relative_to(ROOT)} / {tid}')
                    if actual!=expected:
                        errors.append(f'Wrong rendered text/translation: {path.relative_to(ROOT)} / {tid}')
                    body_checks+=len(expected)
            routes_checked+=1
        for page in ('ci','shi'):
            legacy=ROOT/(f'{page}.html' if locale=='en' else f'{locale}/{page}.html')
            document=legacy.read_text(encoding='utf-8')
            match=re.search(r'<script id="poetry-legacy-map" type="application/json">(.*?)</script>',document,re.S)
            targets=library.legacy_targets(page,locale)
            if not match or json.loads(match[1])!=targets:
                errors.append('Wrong legacy map: '+str(legacy.relative_to(ROOT)))
            if 'content="noindex,follow"' not in document:
                errors.append('Legacy index still competes with canonical works')
            for old,target in targets.items():
                if old and (f'id="{old}"' not in document or f'href="{target}"' not in document):
                    errors.append('No-script recovery missing: '+old)
        index=(ROOT/library.path('',locale).strip('/')/'index.html').read_text()
        for group in library.collections.values():
            if f'href="{library.path(group["route"],locale)}"' not in index:
                errors.append('Collection missing from catalogue: '+group['id'])
        for work in library.standalone():
            if f'href="{library.work_url(work["id"],locale)}"' not in index:
                errors.append('Independent/multipart work missing from catalogue: '+work['id'])
    catalogue=read(ROOT/'poetry-voucher/editions.json')
    generated=library.shop_catalogue()
    if catalogue!=generated:
        errors.append('Public shop catalogue is not the current library projection')
    for offer in catalogue['works']:
        if re.fullmatch(r'W\d+|D\d+\.\d+',offer['source_id']):
            errors.append('Counter escaped into current paper edition: '+offer['source_id'])
        if offer['id'].startswith(('ci-','shi-d')):
            errors.append('Legacy catalogue key is still a primary edition ID')
        url=urlsplit(offer['source_url'])
        path=ROOT/url.path.strip('/')/'index.html'
        if url.scheme!='https' or url.netloc!='hanpuli.github.io' or not path.is_file():
            errors.append('Broken current paper source URL: '+offer['source_url']);continue
        if url.fragment and f'id="{url.fragment}"' not in path.read_text():
            errors.append('Broken paper source fragment: '+offer['source_url'])
        if offer['shelf']=='jia-yi' and not offer['authorial_label']:
            errors.append('Narrator label missing from A/B edition')
    # Authored translations may be added without changing the pinned Chinese text.
    # Validate what each actual locale page renders rather than freezing absence.
    from summerpoemcheck import check as check_summer
    errors.extend(check_summer())
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'poetryarchitecturecheck: {routes_checked} canonical locale routes; {body_checks} rendered text checks; '
          f'{len(fixture["body_sha256"])} immutable body hashes; collection, version, alias and paper-link contracts OK')

if __name__=='__main__': main()
