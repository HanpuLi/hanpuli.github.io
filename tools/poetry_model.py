"""Canonical works, versions, collections and their generated legacy projections.

The poetry registry is the authoring source. ci/shi JSON files are compatibility
exports, never competing catalogues. Voucher entries are edition-parts, not works.
"""
from __future__ import annotations
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content/poetry/works.json'
LANGUAGES = ('en', 'zh', 'zh-hans', 'ja', 'de', 'fr', 'ru')
PAIRED = ('en', 'zh-hans', 'ja', 'de', 'fr', 'ru')
BASE = 'https://hanpuli.github.io/'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def encode(obj, compact=False):
    return json.dumps(obj, ensure_ascii=False, indent=None if compact else 2,
                      separators=(',', ':') if compact else None) + '\n'


def load():
    data = read(SOURCE)
    validate(data)
    return data


def validate(data):
    if data.get('schema') != 1:
        raise ValueError('Unsupported poetry registry schema')
    works = {w['id']: w for w in data['works']}
    collections = {c['id']: c for c in data['collections']}
    if len(works) != len(data['works']) or len(collections) != len(data['collections']):
        raise ValueError('Duplicate work or collection identity')
    aliases = set()
    for w in works.values():
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', w['id']):
            raise ValueError('Invalid work identity: ' + w['id'])
        if not w['route'].startswith('poetry/') or '..' in w['route']:
            raise ValueError('Invalid poetry route')
        if w.get('voice') not in (None, 'jia', 'yi'):
            raise ValueError('Voice is a narrator, not a collection status')
        for value in w['composed'].values():
            if not re.fullmatch(r'\d{4}(?:-\d{2}){0,2}', value):
                raise ValueError('Dates must preserve their known precision')
        if not w['versions'] or len({v['id'] for v in w['versions']}) != len(w['versions']):
            raise ValueError('Empty or duplicate versions')
        for v in w['versions']:
            if not v['parts'] or len({p['id'] for p in v['parts']}) != len(v['parts']):
                raise ValueError('Empty or duplicate parts')
            for p in v['parts']:
                if not {'zh', 'zh-hans'} <= set(p['editions']):
                    raise ValueError('Original script editions missing')
                if set(p['editions']) - set(LANGUAGES):
                    raise ValueError('Unknown language edition')
                for e in p['editions'].values():
                    if not all(isinstance(e.get(k), str) and e[k].strip() for k in ('title', 'body')):
                        raise ValueError('Missing published title or text')
                for key in ('legacy_ci', 'legacy_voucher'):
                    if key in p:
                        alias = (key, p[key])
                        if alias in aliases:
                            raise ValueError('Legacy alias assigned twice: ' + str(alias))
                        aliases.add(alias)
        if w.get('responds_to') and w['responds_to'] not in works:
            raise ValueError('Broken response relation')
    for c in collections.values():
        if not c['members'] or len(set(c['members'])) != len(c['members']):
            raise ValueError('Empty or repeated collection member')
        if set(c['members']) - set(works):
            raise ValueError('Missing collection member')
        if set(c['titles']) != set(LANGUAGES):
            raise ValueError('Collection title languages incomplete')
    order = data['legacy_ci_order']
    if len(set(order)) != len(order) or set(order) != {a for kind, a in aliases if kind == 'legacy_ci'}:
        raise ValueError('Incomplete legacy CI export order')


def membership(data):
    return {wid: c for c in data['collections'] for wid in c['members']}


def title(work, locale):
    return work.get('titles', {}).get(locale) or work['versions'][0]['parts'][0]['editions'].get(
        locale, work['versions'][0]['parts'][0]['editions']['zh'])['title']


def local_path(route, locale):
    return '/' + ('' if locale == 'en' else locale + '/') + route


def edition_id(work, version, part):
    if len(work['versions']) == 1 and len(version['parts']) == 1:
        return work['id']
    return work['id'] + '--' + version['id'] + (('--' + part['id']) if len(version['parts']) > 1 else '')


def part_fragment(work, version, part):
    if '#' in work['route']:
        return work['route'].split('#', 1)[1]
    if len(work['versions']) == 1 and len(version['parts']) == 1:
        return 'text'
    return version['id'] + ('-' + part['id'] if len(version['parts']) > 1 else '')


def part_route(work, version, part):
    if '#' in work['route']:
        return work['route']
    if len(work['versions']) == 1 and len(version['parts']) == 1:
        return work['route']
    return work['route'] + '#' + part_fragment(work, version, part)


def catalogue_nodes(data):
    members = set(membership(data))
    nodes = [{**c, 'node_type': 'collection'} for c in data['collections']]
    nodes += [{**w, 'node_type': 'work'} for w in data['works'] if w['id'] not in members]
    return sorted(nodes, key=lambda x: (x['composed']['start'], x['id']))


def ordered_works(data):
    works = {w['id']: w for w in data['works']}
    result = []
    for node in catalogue_nodes(data):
        result += [works[w] for w in node['members']] if node['node_type'] == 'collection' else [works[node['id']]]
    return result


def ci_source(data):
    by_id = {}
    for w in data['works']:
        for v in w['versions']:
            for p in v['parts']:
                if 'legacy_ci' not in p:
                    continue
                e = p['editions']
                by_id[p['legacy_ci']] = {
                    'id': p['legacy_ci'], 'voice': w['voice'] or 'separate',
                    'source_title': e['zh']['title'], 'source_body': e['zh']['body'],
                    'date': v['date_label'], 'en': e['en'],
                }
    individual = [p['legacy_ci'] for w in ordered_works(data) if not w['voice']
                  for v in w['versions'] for p in v['parts'] if 'legacy_ci' in p]
    return {'title': '甲乙', 'cycle_date': '2026-06-09', 'outside_dates': {},
            'poems': [by_id[k] for k in data['legacy_ci_order']],
            'separate_groups': [{'id': 'individual', 'period': '2018–2026',
                                 'poem_ids': individual, 'copy_key': 'separate'}],
            'reading_order': ['individual', 'cycle']}


def ci_simple(data, ci):
    lookup = {p['legacy_ci']: p['editions']['zh-hans'] for w in data['works']
              for v in w['versions'] for p in v['parts'] if 'legacy_ci' in p}
    out = {k: ci[k] for k in ('title', 'outside_dates', 'separate_groups', 'reading_order')}
    out['poems'] = [{k: v for k, v in p.items() if k != 'en'} for p in ci['poems']]
    for p in out['poems']:
        p['source_title'], p['source_body'] = lookup[p['id']]['title'], lookup[p['id']]['body']
        if p['date']:
            p['date'] = p['date'].translate(str.maketrans('訂縫寫補', '订缝写补'))
    out['source_sha256'] = hashlib.sha256(encode(ci).encode()).hexdigest()
    return out


def shi_source(data, locale='zh'):
    roof = next(w for w in data['works'] if w['id'] == 'roof')
    out = {'title': roof['titles'][locale], 'drafts': []}
    for v in roof['versions']:
        out['drafts'].append({'title': v['date_label'] if locale in ('zh', 'zh-hans') else
                             v['label'][locale] + ' · ' + v['date'],
                             'parts': [{'number': p['number'], 'body': p['editions'][locale]['body']}
                                       for p in v['parts']]})
    return out


def summer_source(data):
    w = next(w for w in data['works'] if w['id'] == 'summer-2017')
    return {'id': w['id'], **w['summer_metadata'],
            'texts': {l: e['body'] for l, e in w['versions'][0]['parts'][0]['editions'].items()}}


def voucher(data, base):
    result = {k: v for k, v in base.items() if k not in ('works', 'aliases', 'shelves')}
    result['version'] = 2
    result['works'] = []
    result['aliases'] = {}
    memberships = membership(data)
    for w in ordered_works(data):
        c = memberships.get(w['id'])
        for version in w['versions']:
            for part in version['parts']:
                e = part['editions']
                ident = edition_id(w, version, part)
                translated = {('zh-Hans' if l == 'zh-hans' else l): e[l] for l in PAIRED if l in e}
                receipt_label = w.get('member_label', {}).get('en')
                if not receipt_label:
                    receipt_label = {'roof': 'Roof', 'summer-2017': 'Summer',
                                     'manjianghong-rereading-202610': 'Manjianghong rereading'}.get(
                                         w['id'], w['id'].split('-')[0].capitalize())
                    if len(w['versions']) > 1:
                        receipt_label += ' / ' + version['id'].replace('draft-', '')
                    if len(version['parts']) > 1:
                        receipt_label += ' / ' + str(version['parts'].index(part) + 1)
                shelf = c['id'] if c else ('roof' if w['id'] == 'roof' else w['form'])
                row = {'id': ident, 'work_id': w['id'], 'version_id': version['id'],
                       'part_id': part['id'], 'identity_schema': 2,
                       'source_id': receipt_label, 'title': e['zh']['title'], 'poem': e['zh']['body'],
                       'author': '李函璞 / Hanpu Li', 'collection': c['titles']['zh'] if c else '詩歌',
                       'edition': version['date_label'], 'version_label': version['label'],
                       'composed': w['composed']['start'], 'form': w['form'],
                       'kind': 'CI' if 'legacy_ci' in part else 'POEM',
                       'source_url': BASE + part_route(w, version, part),
                       'shelf': shelf, 'translations': translated,
                       'legacy_ids': [part['legacy_voucher']] if 'legacy_voucher' in part else []}
                result['works'].append(row)
                for alias in row['legacy_ids']:
                    result['aliases'][alias] = ident
    return result


def projections(data):
    ci = ci_source(data)
    shi = shi_source(data)
    shis = shi_source(data, 'zh-hans')
    shis['source_sha256'] = hashlib.sha256(encode(shi).encode()).hexdigest()
    outputs = {'content/ci-source.json': encode(ci), 'content/ci-simplified.json': encode(ci_simple(data, ci)),
               'content/shi-source.json': encode(shi), 'content/shi-simplified.json': encode(shis),
               'content/summer-poem.json': encode(summer_source(data))}
    for lang in ('ja', 'de', 'fr', 'ru'):
        outputs[f'content/ci-translations/{lang}.json'] = encode({
            'language': lang, 'poems': {p['legacy_ci']: p['editions'][lang] for w in data['works']
                                       for v in w['versions'] for p in v['parts'] if 'legacy_ci' in p}})
    roof = next(w for w in data['works'] if w['id'] == 'roof')
    for lang in ('en', 'ja', 'de', 'fr', 'ru'):
        translated = {**roof['translation_metadata'][lang], 'drafts': []}
        for version in roof['versions']:
            translated['drafts'].append({**version['export_metadata'][lang],
                'parts': [{'number': p['number'], 'body': p['editions'][lang]['body']} for p in version['parts']]})
        outputs[f'content/shi-translations/{lang}.json'] = encode(translated)
    base = read(ROOT / 'content/poetry-voucher-app/catalogue-encoding.json')
    outputs['content/poetry-voucher-app/editions.json'] = encode(voucher(data, base), compact=True)
    return outputs


def synchronize(*, check=False):
    data = load()
    changed = []
    for name, text in projections(data).items():
        path = ROOT / name
        if path.exists() and path.read_text(encoding='utf-8') == text:
            continue
        changed.append(path)
        if not check:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding='utf-8')
    return changed


if __name__ == '__main__':
    import sys
    check = '--check' in sys.argv
    changed = synchronize(check=check)
    for path in changed:
        print(path.relative_to(ROOT))
    raise SystemExit(1 if check and changed else 0)
