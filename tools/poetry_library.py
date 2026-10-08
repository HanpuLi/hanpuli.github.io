"""Canonical poetry library: works, ordered collections, versions and text parts.

Legacy ci/shi files and the shop catalogue are generated projections, never input
for new publication decisions. Rendering, discovery and shop links share this model.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'content'
LANGS = ('en', 'zh', 'zh-hans', 'ja', 'de', 'fr', 'ru')
SHOP_LANGS = {'en':'en', 'zh':'zh-Hant', 'zh-hans':'zh-Hans', 'ja':'ja', 'de':'de', 'fr':'fr', 'ru':'ru'}


def read(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def encode(value: Any, compact: bool = False) -> str:
    return json.dumps(value, ensure_ascii=False, indent=None if compact else 2,
                      separators=(',', ':') if compact else None) + '\n'


class Library:
    def __init__(self, root: Path = ROOT):
        self.root = root
        self.content = root / 'content'
        path = self.content / 'poetry/library.json'
        self.data = read(path)
        self.simplified = read(self.content / 'poetry/simplified.json')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if self.simplified['source_sha256'] != digest:
            raise ValueError('Poetry script mirror is stale; run tools/update_simplified_literary.py')
        self.works = self._index('works')
        self.versions = self._index('versions')
        self.texts = self._index('texts')
        self.collections = self._index('collections')
        self.offers = self._index('offers')
        self.memberships = {}
        for collection in self.collections.values():
            for wid in collection['members']:
                if wid in self.memberships:
                    raise ValueError('Ambiguous primary collection for ' + wid)
                self.memberships[wid] = collection['id']
        self.validate()

    def _index(self, key: str) -> dict[str, Any]:
        values = self.data[key]
        result = {item['id']: item for item in values}
        if len(result) != len(values):
            raise ValueError('Duplicate poetry ' + key + ' ID')
        return result

    def validate(self) -> None:
        if self.data.get('schema') != 1:
            raise ValueError('Unsupported poetry schema')
        used_versions, used_texts = [], []
        for work in self.works.values():
            if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', work['id']):
                raise ValueError('Invalid work slug: ' + work['id'])
            if work['voice'] not in (None, 'jia', 'yi'):
                raise ValueError('Voice is a narrator, not collection membership')
            if not work['versions']:
                raise ValueError('Work without a published version: ' + work['id'])
            for vid in work['versions']:
                if self.versions[vid]['work'] != work['id']:
                    raise ValueError('Version belongs to another work: ' + vid)
                used_versions.append(vid)
            for related in work['related']:
                if related not in self.works or related == work['id']:
                    raise ValueError('Invalid related work: ' + related)
        for version in self.versions.values():
            if not version['parts']:
                raise ValueError('Version without text: ' + version['id'])
            for tid in version['parts']:
                if self.texts[tid]['version'] != version['id']:
                    raise ValueError('Text belongs to another version: ' + tid)
                used_texts.append(tid)
        if sorted(used_versions) != sorted(self.versions) or sorted(used_texts) != sorted(self.texts):
            raise ValueError('Orphaned or multiply-owned poetry text/version')
        for collection in self.collections.values():
            if len(collection['members']) != len(set(collection['members'])):
                raise ValueError('Duplicate collection member')
            if any(wid not in self.works for wid in collection['members']):
                raise ValueError('Unknown collection member')
        if set(self.simplified['texts']) != set(self.texts):
            raise ValueError('Simplified text parts differ from canonical library')
        for tid, text in self.texts.items():
            if 'zh' not in text['editions']:
                raise ValueError('Missing original: ' + tid)
            for locale, edition in text['editions'].items():
                if locale not in LANGS or not edition['title'].strip() or not edition['body'].strip():
                    raise ValueError('Invalid literary edition: ' + tid)
        for offer in self.offers.values():
            if offer['text'] not in self.texts:
                raise ValueError('Shop edition without text')
        for alias, tid in self.data['legacy']['catalogue'].items():
            if tid not in self.offers or alias not in self.offers[tid]['legacy_ids']:
                raise ValueError('Invalid shop alias: ' + alias)

    def edition(self, tid: str, locale: str) -> dict[str, str] | None:
        if locale == 'zh-hans':
            return self.simplified['texts'][tid]
        return self.texts[tid]['editions'].get(locale)

    def work_for_text(self, tid: str) -> dict[str, Any]:
        return self.works[self.versions[self.texts[tid]['version']]['work']]

    def first_text(self, wid: str) -> str:
        return self.versions[self.works[wid]['versions'][0]]['parts'][0]

    def title(self, wid: str, locale: str) -> str:
        if wid == 'roof-splits':
            return self.data['roof_title'][locale]
        tid = self.first_text(wid)
        return (self.edition(tid, locale) or self.edition(tid, 'zh'))['title']

    @staticmethod
    def path(route: str, locale: str = 'en') -> str:
        prefix = '/' if locale == 'en' else '/' + locale + '/'
        return prefix + 'poetry/' + (route.rstrip('/') + '/' if route else '')

    def work_url(self, wid: str, locale: str = 'en') -> str:
        work = self.works[wid]
        return self.path(work['route'], locale) + ('#' + work['fragment'] if work['fragment'] else '')

    def text_url(self, tid: str, locale: str = 'en') -> str:
        text = self.texts[tid]
        version = self.versions[text['version']]
        work = self.works[version['work']]
        fragment = version['fragment']
        if text['part'] is not None:
            fragment += '-part-' + text['part']
        return self.path(work['route'], locale) + ('#' + fragment if fragment else '')

    def standalone(self) -> list[dict[str, Any]]:
        return sorted((w for w in self.works.values() if w['id'] not in self.memberships),
                      key=lambda w:(w['composed']['start'], w['id']))

    def routes(self) -> list[str]:
        return list(dict.fromkeys(['', 'chronology'] + [c['route'] for c in self.collections.values()]
                                 + [w['route'] for w in self.works.values()]))

    def legacy_targets(self, page: str, locale: str) -> dict[str, str]:
        if page == 'ci':
            result = {key:self.text_url(tid,locale) for key,tid in self.data['legacy']['ci'].items()}
            result.update({'':self.path('',locale), 'poems':self.path('',locale),
                           'ci-cycle-heading':self.path('jia-yi',locale),
                           'ci-separate-heading':self.path('september-2026',locale),
                           'ci-revisions-2026-10-heading':self.path('chronology',locale),
                           'ci-response-2026-10-heading':self.work_url('manjianghong-rereading-202610',locale)})
            return result
        return {'':self.path('roof-splits',locale), 'drafts':self.path('roof-splits',locale),
                'draft-1':self.path('roof-splits',locale)+'#draft-1',
                'draft-2':self.path('roof-splits',locale)+'#draft-2',
                'summer-2017':self.path('summer-2017',locale)}

    def shop_catalogue(self) -> dict[str, Any]:
        # Artwork encoding tables are a renderer asset, not a second literary source.
        data = read(self.content / 'poetry/voucher-encoding.json')
        data['version'] = 2
        data['aliases'] = copy.deepcopy(self.data['legacy']['catalogue'])
        data['works'] = []
        groups = list(self.collections.values())
        ordered = [wid for group in groups for wid in group['members']]
        ordered += [w['id'] for w in self.standalone()]
        for wid in ordered:
            work = self.works[wid]
            for vid in work['versions']:
                version = self.versions[vid]
                for tid in version['parts']:
                    if tid not in self.offers:
                        continue
                    offer, text = self.offers[tid], self.texts[tid]
                    original = text['editions']['zh']
                    cid = self.memberships.get(wid)
                    shelf = cid or ('roof-splits' if wid=='roof-splits' else 'individual')
                    shelf_labels = self.collections[cid]['title'] if cid else (
                        self.data['roof_title'] if wid=='roof-splits' else
                        dict(zip(LANGS, ['Individual poems','單篇','单篇','単篇','Einzelgedichte','Poèmes individuels','Отдельные стихи'])))
                    labels = {}
                    for locale in LANGS:
                        label = version['label'][locale]
                        if text['part']:
                            label += ' · ' + text['part']
                        if not label:
                            label = work['composed']['start'].replace('-', '.')
                        labels[SHOP_LANGS[locale]] = label
                    translations = {'en':self.edition(tid,'en'), 'zh-Hans':self.edition(tid,'zh-hans')}
                    translations.update({l:self.edition(tid,l) for l in ('ja','de','fr','ru')})
                    if any(value is None for value in translations.values()):
                        raise ValueError('Offered edition has unpublished translation: ' + tid)
                    data['works'].append({
                        'id':offer['id'], 'work_id':wid, 'version_id':vid, 'part_id':text['part'],
                        'source_id':offer['receipt_code'], 'authorial_label':work['authorial_label'],
                        'title':original['title'], 'poem':original['body'], 'author':'李函璞 / Hanpu Li',
                        'collection':shelf_labels['zh'], 'shelf':shelf,
                        'shelf_labels':{SHOP_LANGS[l]:shelf_labels[l] for l in LANGS},
                        'edition':text['source_date'] or version['date'], 'edition_labels':labels,
                        'kind':'POEM', 'form':work['form'],
                        'source_url':'https://hanpuli.github.io' + self.text_url(tid),
                        'legacy_ids':offer['legacy_ids'], 'translations':translations,
                    })
        return data

    def legacy_projections(self) -> dict[Path, Any]:
        """Publish read-only compatibility JSON for existing downstream links."""
        ci = {'generated_from':'poetry/library.json', 'title':'詩歌', 'cycle_date':'2026-06-09',
              'outside_dates':{}, 'poems':[]}
        simple = {'generated_from':'poetry/library.json', 'title':'诗歌','outside_dates':{},'poems':[]}
        translations = {l:{'language':l, 'poems':{}} for l in ('ja','de','fr','ru')}
        for old in self.data['legacy']['ci_order']:
            tid = self.data['legacy']['ci'][old]
            text, work = self.texts[tid], self.work_for_text(tid)
            date = text['source_date']
            if old == 'a10': date = '二〇二六年七月一日'
            ci['poems'].append({'id':old,'work_id':work['id'],'voice':work['voice'],
                               'source_title':text['editions']['zh']['title'],
                               'source_body':text['editions']['zh']['body'], 'date':date,
                               'en':text['editions']['en']})
            se = self.edition(tid,'zh-hans')
            simple['poems'].append({'id':old,'source_title':se['title'],'source_body':se['body'],
                                    'date':date.translate(str.maketrans('訂寫縫補','订写缝补')) if date else None})
            for l in translations: translations[l]['poems'][old] = text['editions'][l]
        simple['source_sha256'] = hashlib.sha256(encode(ci).encode()).hexdigest()
        files = {self.content/'ci-source.json':ci, self.content/'ci-simplified.json':simple}
        files.update({self.content/f'ci-translations/{l}.json':value for l,value in translations.items()})
        for locale in LANGS:
            roof = {'title':self.data['roof_title'][locale], 'drafts':[]}
            for vid in self.works['roof-splits']['versions']:
                version = self.versions[vid]
                # Version labels and their dates stay attached to the two-part work.
                zh_date = self.texts[version['parts'][0]]['source_date']
                title = zh_date if locale=='zh' else zh_date.replace('二〇二五','二〇二五') if locale=='zh-hans' else version['label'][locale]+' · '+version['date']
                roof['drafts'].append({'title':title, 'parts':[{'number':('一' if self.texts[t]['part']=='1' else '二') if locale in ('zh','zh-hans') else self.texts[t]['part'], 'body':self.edition(t,locale)['body']} for t in version['parts']]})
            if locale=='zh': files[self.content/'shi-source.json'] = roof
            elif locale=='zh-hans': files[self.content/'shi-simplified.json'] = roof
            else: files[self.content/f'shi-translations/{locale}.json'] = {'language':locale,**roof}
        sc = files[self.content/'shi-simplified.json']
        sc['source_sha256'] = hashlib.sha256(encode(files[self.content/'shi-source.json']).encode()).hexdigest()
        summer = self.texts['summer-2017-revised-20261008']
        files[self.content/'summer-poem.json'] = {'id':'summer-2017',**self.data['summer_metadata'],
          'texts':{'zh':summer['editions']['zh']['body'], 'zh-hans':self.edition(summer['id'],'zh-hans')['body']}}
        files[self.content/'poetry-voucher-app/editions.json'] = self.shop_catalogue()
        return files


def materialize(*, check: bool = False, root: Path = ROOT) -> list[Path]:
    library = Library(root)
    changed = []
    for path, value in library.legacy_projections().items():
        body = encode(value, compact=path.name=='editions.json')
        if not path.exists() or path.read_text(encoding='utf-8') != body:
            changed.append(path)
            if not check:
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_text(body,encoding='utf-8')
    return changed
