"""Poetry catalogue, work/sequence readers, and stable legacy route mappings."""
from __future__ import annotations
import html
import json
import re
from pathlib import Path
import poetry_model as model

ROOT = model.ROOT
UI = model.read(ROOT / 'content/poetry/ui.json')
E = html.escape


def routes(data):
    return sorted({'poetry/'} | {c['route'] for c in data['collections']} |
                  {w['route'].split('#')[0] for w in data['works']})


def href(route, locale):
    return model.local_path(route, locale)


def language_links(api, route, locale):
    rows = []
    for language in api.LANGUAGES:
        lid, name, lang = language['id'], language['label'], language['html_lang']
        if lid == locale:
            rows.append(f'<span class="current" lang="{lang}" aria-current="page" title="{E(name)}">'
                        f'<span class="language-short" aria-hidden="true">{E(language["short"])}</span>'
                        f'<span class="visually-hidden">{E(name)}</span></span>')
        else:
            rows.append(f'<a data-preserve-fragment href="{href(route,lid)}" hreflang="{lang}" lang="{lang}" '
                        f'aria-label="{E(name)}" title="{E(name)}">'
                        f'<span class="language-short" aria-hidden="true">{E(language["short"])}</span></a>')
    return '\n'.join(rows)


def page(api, locale, route, title, description, body, *, extra='', noindex=False, canonical=None):
    copy = api.load_json(api.CONTENT / 'locales' / f'{locale}.json')
    ui = UI[locale]
    canonical = canonical or route
    url = api.BASE_URL + href(canonical, locale)
    full_title = title + ' · ' + api.IDENTITY['primary_name']
    tab_title = full_title if len(full_title) <= 70 else title.split(' · ',1)[0] + ' · ' + api.IDENTITY['primary_name']
    variants = '\n'.join(f'<link rel="alternate" hreflang="{l["html_lang"]}" href="{api.BASE_URL}{href(canonical,l["id"])}">' for l in api.LANGUAGES)
    variants += f'\n<link rel="alternate" hreflang="x-default" href="{api.BASE_URL}{href(canonical,"en")}">'
    metadata = api.social_meta_html(locale_id=locale, title=full_title, description=description,
                                   url=url, image_url=api.BASE_URL+'/assets/social/site.png',
                                   image_alt=full_title, width=1200, height=630, image_type='image/png',
                                   og_type='website' if route=='poetry/' else 'article')
    structured = api.structured_data_html(locale_id=locale, page_kind='ci' if route=='poetry/' else 'poetry-work',
                                          title=full_title, description=description, url=url,
                                          image_url=api.BASE_URL+'/assets/social/site.png')
    robots = '<meta name="robots" content="noindex,follow">' if noindex else ''
    return f'''<!DOCTYPE html>
<html lang="{api.LANG_BY_ID[locale]['html_lang']}" translate="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="google" content="notranslate">
<title>{E(tab_title)}</title>
<meta name="description" content="{E(description,quote=True)}">
<link rel="canonical" href="{url}">
{variants}
{metadata}
{robots}
<meta name="theme-color" content="#f5f2eb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
{api.icon_links()}
{re.sub(r'href="(?:\.\./)*assets/', 'href="/assets/', api.font_preloads(locale,'ci'))}
<script src="/assets/accessibility.js"></script>
<script defer src="/assets/profile-credit.js"></script>
<script defer src="/assets/poetry-reader.js"></script>
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/poetry.css">
{structured}
</head>
<body class="literary-page poetry-library locale-{locale}">
<a class="skip-link" href="#poems">{E(copy['common']['skip_poems'])}</a>
<div class="wrap">
<header class="page-topbar">
<a class="page-wordmark" href="{api.page_path(locale,'index')}">{api.IDENTITY['primary_name']} <span lang="zh-Hant-HK">{api.IDENTITY['chinese_name']}</span></a>
<nav class="page-nav" aria-label="{E(copy['common']['site_nav_label'])}">{api.portfolio_nav_html(locale,copy,current='ci')}</nav>
<div class="page-utility"><nav class="page-languages" aria-label="{E(copy['common']['language_nav_label'])}">{language_links(api,canonical,locale)}</nav></div>
{api.reading_tools(copy)}
</header>
<main id="poems" tabindex="-1">
{body}
</main>
<footer class="page-footer">
<p><a href="{api.page_path(locale,'index')}">{api.IDENTITY['primary_name']}</a></p>
<p class="page-footer-context"><a href="{href('poetry/',locale)}">{E(ui['back'])}</a> · <a href="{api.page_path(locale,'about')}">{E(api.ABOUT_SITE[locale]['footer_link'])}</a></p>
</footer>
</div>
{extra}
</body>
</html>
'''


def dates(work, locale):
    ui = UI[locale]
    start, end = work['composed']['start'], work['composed']['end']
    def date_markup(value):
        return f'<time datetime="{value}">{E(value)}</time>' if len(value) > 4 else f'<span>{E(value)}</span>'
    value = date_markup(start) + (' / ' + date_markup(end) if end != start else '')
    return f'<p class="poetry-dates"><span>{E(ui["written"])}</span> {value}</p>'


def catalogue(api, data, locale):
    ui = UI[locale]
    rows, year_links, current_year = [], [], None
    for node in model.catalogue_nodes(data):
        year = node['composed']['start'][:4]
        if year != current_year:
            if current_year is not None:
                rows.append('</div></section>')
            rows.append(f'<section class="poetry-year" aria-labelledby="year-{year}"><h2 id="year-{year}">{year}</h2><div>')
            year_links.append(f'<a href="#year-{year}">{year}</a>')
            current_year = year
        if node['node_type'] == 'collection':
            title = node['titles'][locale]
            labels = [ui['collection'], ui['members'].format(count=len(node['members']))]
            first = next(w for w in data['works'] if w['id']==node['members'][0])
            editions = first['versions'][0]['parts'][0]['editions']
            excerpt = next(line for line in editions.get(locale, editions['zh'])['body'].splitlines() if line.strip())
            lang = api.LANG_BY_ID[locale]['html_lang'] if locale in editions else 'zh-Hant-HK'
        else:
            title = model.title(node, locale)
            labels = [ui[node['form']]]
            if len(node['versions']) > 1:
                labels.append(ui['version_count'].format(count=len(node['versions'])))
            if len(node['versions'][0]['parts']) > 1:
                labels.append(ui['part_count'].format(count=len(node['versions'][0]['parts'])))
            editions = node['versions'][0]['parts'][0]['editions']
            edition = editions.get(locale, editions['zh'])
            lines = [s for s in edition['body'].splitlines() if s.strip()]
            excerpt = lines[1] if node.get('layout')=='mirror' else lines[0]
            lang = api.LANG_BY_ID[locale]['html_lang'] if locale in editions else 'zh-Hant-HK'
        rows.append(f'<article class="poetry-index-entry" data-work="{node["id"]}">'
                    f'<p class="poetry-kind">{E(" · ".join(labels))}</p>'
                    f'<h3 lang="{lang}"><a href="{href(node["route"],locale)}">{E(title)}</a></h3>'
                    f'<p class="poetry-incipit" lang="{lang}">{E(excerpt)}</p></article>')
    if current_year is not None:
        rows.append('</div></section>')
    body = f'<header class="page-intro"><h1>{E(ui["heading"])}</h1><p class="sub">{E(ui["lede"])}</p>'
    body += f'<nav class="poetry-years" aria-label="{E(ui["contents"])}">'+''.join(year_links)+'</nav></header>'
    body += '\n'.join(rows)
    return page(api,locale,'poetry/',ui['heading'],ui['lede'],body)


def panel(part, locale, *, headings=True, level=2):
    editions = part['editions']
    source_locale = 'zh-hans' if locale=='zh-hans' else 'zh'
    source = editions[source_locale]
    paired = locale not in ('zh','zh-hans') and locale in editions
    html_parts=[]
    for lang, role in [(source_locale,'source')] + ([(locale,'translation')] if paired else []):
        edition=editions[lang]
        language={'zh':'zh-Hant-HK','zh-hans':'zh-Hans','en':'en-GB'}.get(lang,lang)
        heading=f'<h{level}>{E(edition["title"])}</h{level}>' if headings else ''
        html_parts.append(f'<section class="poem-version {role}" lang="{language}">{heading}<div class="body">{E(edition["body"])}</div></section>')
    return '<div class="poem-pair'+('' if paired else ' source-only')+'">'+''.join(html_parts)+'</div>'


def voucher_link(w,v,p,locale):
    ui=UI[locale]
    route='/poetry-voucher/shop.html?lang='+{'zh':'zh-Hant','zh-hans':'zh-Hans'}.get(locale,locale)
    return f'<a class="poetry-voucher-link" href="{route}&amp;work={model.edition_id(w,v,p)}">{E(ui["voucher"])}</a>'


def date_label(version,locale):
    value = version['date_label']
    return value.translate(str.maketrans('訂縫寫補', '订缝写补')) if locale == 'zh-hans' else value


def render_work(w,locale,*,anchor=None,standalone=False):
    ui=UI[locale]
    rows=[]
    for v in w['versions']:
        label=v['label'].get(locale) or ui['revised'] if len(w['versions'])>1 else ''
        if len(w['versions'])>1:
            rows.append(f'<header class="poetry-version-head" id="{v["id"]}"><h2>{E(label)}</h2><p class="date" lang="{'zh-Hans' if locale == 'zh-hans' else 'zh-Hant-HK'}">{E(date_label(v,locale))}</p></header>')
        for p in v['parts']:
            ident=anchor or model.part_fragment(w,v,p)
            if len(w['versions']) > 1 and ident == v['id']:
                ident += '-text'
            member = w.get('member_label', {}).get('en') if locale not in ('zh','zh-hans','ja') else None
            member_html = f'<p class="poetry-kind">{E(member)}</p>' if member else ''
            rows.append(f'<article class="poem poetry-work-text" id="{ident}">'+member_html+panel(p,locale,headings=not(standalone and locale in ('zh','zh-hans') and len(w['versions'])==1 and len(v['parts'])==1),level=3 if len(w['versions'])>1 else 2)+
                        (f'<p class="date" lang="{'zh-Hans' if locale == 'zh-hans' else 'zh-Hant-HK'}">{E(date_label(v,locale))}</p>' if len(w['versions'])==1 else '')+
                        '<div class="poetry-part-actions">'+voucher_link(w,v,p,locale)+
                        f'<a class="poetry-permalink" href="{href(model.part_route(w,v,p),locale)}">{E(ui["permalink"])}</a></div></article>')
    return '\n'.join(rows)


def collection_page(api,data,c,locale):
    ui=UI[locale];works={w['id']:w for w in data['works']}
    title=c['titles'][locale]
    note=ui['cycle_note'].format(count=len(c['members'])) if c['kind']=='cycle' else ui['pair_note']
    toc=[];contents=[]
    for n,wid in enumerate(c['members']):
        w=works[wid]
        anchor=w['route'].split('#')[1] if '#' in w['route'] else w['id']
        label=w.get('member_label',{}).get('zh' if locale in ('zh','zh-hans','ja') else 'en') or model.title(w,locale)
        toc.append(f'<li><a href="#{anchor}" title="{E(model.title(w,locale),quote=True)}">{E(label)}</a></li>')
        contents.append(render_work(w,locale,anchor=anchor))
        navigation=[]
        for other, key in ((n-1,'previous'),(n+1,'next')):
            if 0<=other<len(c['members']):
                ow=works[c['members'][other]];oa=ow['route'].split('#')[1] if '#' in ow['route'] else ow['id']
                ol=ow.get('member_label',{}).get('zh' if locale in ('zh','zh-hans','ja') else 'en') or model.title(ow,locale)
                navigation.append(f'<a href="#{oa}">{E(ui[key])} · {E(ol)}</a>')
        contents.append(f'<nav class="poetry-neighbours" aria-label="{E(ui["sequence"] + " · " + label)}">'+''.join(navigation)+'</nav>')
    body=f'<header class="page-intro"><p class="poetry-breadcrumb"><a href="{href("poetry/",locale)}">{E(ui["back"])}</a></p><h1>{E(title)}</h1><p class="sub">{E(note)}</p>'+dates(c,locale)
    body+=f'<nav aria-label="{E(ui["contents"])}"><ol class="poetry-sequence-toc">'+''.join(toc)+'</ol></nav></header>'
    body+='\n'.join(contents)
    return page(api,locale,c['route'],title,note,body)


def work_page(api,data,w,locale):
    ui=UI[locale];title=model.title(w,locale);member=model.membership(data).get(w['id'])
    breadcrumbs=f'<a href="{href("poetry/",locale)}">{E(ui["back"])}</a>'
    if member:
        breadcrumbs+=f'<a href="{href(member["route"],locale)}">{E(member["titles"][locale])} · {E(ui["read_collection"])}</a>'
    body=f'<header class="page-intro"><nav class="poetry-breadcrumb" aria-label="{E(ui["contents"])}">{breadcrumbs}</nav><p class="poetry-kind">{E(ui[w["form"]])}</p><h1>{E(title)}</h1>'+dates(w,locale)
    if len(w['versions'])>1:
        body+=f'<nav class="poetry-versions" aria-label="{E(ui["versions"])}">'+''.join(f'<a href="#{v["id"]}">{E(v["label"].get(locale,v["date"]))}</a>' for v in w['versions'])+'</nav>'
    body+='</header>'+render_work(w,locale,standalone=True)
    related=[x for x in data['works'] if x.get('responds_to')==w['id'] or x['id']==w.get('responds_to')]
    if related:
        body+=f'<aside class="poetry-related" aria-labelledby="poetry-related-heading"><h2 id="poetry-related-heading">{E(ui["related"])}</h2>'+''.join(f'<p><a href="{href(x["route"],locale)}">{E(model.title(x,locale))}</a></p>' for x in related)+'</aside>'
    return page(api,locale,w['route'],title,title+' · '+ui[w['form']],body)


def alias_map(data):
    ci={};shi={'drafts':'poetry/roof/'}
    for w in data['works']:
        for v in w['versions']:
            for p in v['parts']:
                if 'legacy_ci' in p:ci[p['legacy_ci']]=model.part_route(w,v,p)
    ci.update({'poems':'poetry/','ci-cycle-heading':'poetry/jia-yi/',
               'ci-revisions-2026-10-heading':'poetry/#year-2018',
               'ci-separate-heading':'poetry/lamplight-20260909/',
               'ci-response-2026-10-heading':'poetry/manjianghong-rereading-202610/'})
    return {'ci':ci,'shi':shi}


def legacy_page(api,data,locale,kind):
    ui=UI[locale];route='ci.html' if kind=='ci' else 'shi.html'
    target='poetry/' if kind=='ci' else 'poetry/roof/'
    map_=alias_map(data)[kind]
    works={p.get('legacy_ci'):w for w in data['works'] for v in w['versions'] for p in v['parts'] if 'legacy_ci' in p}
    links=[]
    for key,dest in map_.items():
        if key == 'poems':
            continue
        label=model.title(works[key],locale) if key in works else ui['back']
        links.append(f'<li id="{key}"><a href="{href(dest,locale)}">{E(label)}</a></li>')
    body=f'<header class="page-intro"><h1>{E(ui["heading"])}</h1><p>{E(ui["legacy_note"])}</p></header><ul class="poetry-legacy-links">'+''.join(links)+'</ul>'
    script=f'<script defer src="/assets/poetry-aliases.js" data-locale="{locale}" data-kind="{kind}"></script>'
    return page(api,locale,route,ui['heading'],ui['legacy_note'],body,extra=script,noindex=True,canonical=target)


def build(api,*,check=False):
    data=model.load();rendered={}
    for lid in model.LANGUAGES:
        rendered[href('poetry/',lid).lstrip('/')+'index.html']=catalogue(api,data,lid)
        for c in data['collections']:
            rendered[href(c['route'],lid).lstrip('/')+'index.html']=collection_page(api,data,c,lid)
        for w in data['works']:
            if '#' in w['route'] or w.get('layout')=='mirror':continue
            rendered[href(w['route'],lid).lstrip('/')+'index.html']=work_page(api,data,w,lid)
    maps=json.dumps(alias_map(data),ensure_ascii=False,separators=(',',':'))
    rendered['assets/poetry-aliases.js']="'use strict';\n(()=>{const script=document.currentScript;const maps="+maps+";const locale=script.dataset.locale;const kind=script.dataset.kind;const hash=decodeURIComponent(location.hash.slice(1));const target=maps[kind][hash]||(!hash?(kind==='ci'?'poetry/':'poetry/roof/'):null);if(target)location.replace('/'+(locale==='en'?'':locale+'/')+target);})();\n"
    changed=[]
    for name,text in rendered.items():
        path=ROOT/name
        if path.exists() and path.read_text(encoding='utf-8')==text:continue
        changed.append(path)
        if not check:
            path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text,encoding='utf-8')
    return changed
