"""Static catalogue, chronology, collection readers and independent work pages."""
from __future__ import annotations

import html
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from poetry_library import Library, LANGS, SHOP_LANGS, read


def esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def date_span(value: str) -> str:
    label = value.replace('-', '.')
    return f'<time datetime="{esc(value)}">{label}</time>' if len(value) >= 7 else esc(label)


def date_range(dates: dict[str, str]) -> str:
    start, end = dates['start'], dates['end']
    return date_span(start) + (' – ' + date_span(end) if start != end else '')


class Pages:
    def __init__(self, base: Any):
        self.base = base
        self.lib = Library(base.ROOT)
        self.ui = read(base.CONTENT / 'poetry/ui.json')
        self.template = (base.TEMPLATES / 'poetry.html').read_text(encoding='utf-8')

    def languages(self, route: str, locale: str) -> str:
        result = []
        for language in self.base.LANGUAGES:
            lid, label, full, tag = language['id'], language['short'], language['label'], language['html_lang']
            inside = f'<span class="language-short" aria-hidden="true">{esc(label)}</span>'
            if lid == locale:
                result.append(f'<span class="current" lang="{esc(tag)}" aria-current="page" title="{esc(full)}">{inside}<span class="visually-hidden">{esc(full)}</span></span>')
            else:
                result.append(f'<a data-poetry-language href="{self.lib.path(route,lid)}" hreflang="{tag}" lang="{tag}" aria-label="{esc(full)}" title="{esc(full)}">{inside}</a>')
        return '\n'.join(result)

    def alternates(self, route: str) -> str:
        links = [f'<link rel="alternate" hreflang="{l["html_lang"]}" href="{self.base.BASE_URL}{self.lib.path(route,l["id"])}">' for l in self.base.LANGUAGES]
        links.append(f'<link rel="alternate" hreflang="x-default" href="{self.base.BASE_URL}{self.lib.path(route)}">')
        return '\n'.join(links)

    def shell(self, *, route: str, locale: str, copy: dict[str, Any], heading: str,
              content: str, intro: str = '', switcher: str = '', breadcrumbs: str = '',
              extra_head: str = '', page_class: str = 'poetry-reader', canonical: str | None = None) -> str:
        b, ui = self.base, self.ui[locale]
        title = heading + ' · ' + b.IDENTITY['primary_name']
        if len(title)>70:
            short=re.split(r'\s+·\s+',heading,maxsplit=1)[0]
            year=re.search(r'20\d{2}',route)
            title=short+(' · '+year[0] if year else '')+' · '+b.IDENTITY['primary_name']
        canonical = canonical or b.BASE_URL + self.lib.path(route,locale)
        description = ui['intro'] if not route or route=='chronology' else heading + ' · Hanpu Li'
        image = b.BASE_URL + '/assets/social/ci.png'
        metadata = b.structured_data_html(locale_id=locale,page_kind='ci',title=title,
                    description=description,url=canonical,image_url=image)
        social = b.social_meta_html(locale_id=locale,title=title,description=description,url=canonical,
                    image_url=image,image_alt=title,width=1200,height=630,image_type='image/png',og_type='article')
        values = {
            'HTML_LANG':b.LANG_BY_ID[locale]['html_lang'], 'LOCALE':locale,
            'POETRY_TITLE':esc(title), 'POETRY_DESCRIPTION':esc(description),
            'POETRY_CANONICAL':esc(canonical), 'POETRY_ALTERNATES':self.alternates(route),
            'SOCIAL_META':social, 'STRUCTURED_DATA':metadata, 'ICON_LINKS':b.icon_links(),
            'FONT_PRELOADS':b.font_preloads(locale,'ci').replace('href="assets/','href="/assets/').replace('href="../assets/','href="/assets/'),
            'POETRY_EXTRA_HEAD':extra_head, 'POETRY_PAGE_CLASS':page_class,
            'HOME_HREF':b.page_path(locale,'index'), 'PRIMARY_NAME':esc(b.IDENTITY['primary_name']),
            'CHINESE_NAME':esc(b.IDENTITY['chinese_name']),
            'PORTFOLIO_NAV':b.portfolio_nav_html(locale,copy,current='ci',home_page=False),
            'LANG_SWITCHER':self.languages(route,locale), 'READING_TOOLS':b.reading_tools(copy),
            'POETRY_BREADCRUMBS':breadcrumbs, 'POETRY_HEADING':esc(heading),
            'POETRY_INTRO':intro, 'POETRY_SWITCHER':switcher, 'POETRY_CONTENT':content,
            'POETRY_INDEX':self.lib.path('',locale), 'POETRY_BACK':esc(ui['back']),
            'ABOUT_HREF':b.page_path(locale,'about'), 'ABOUT_LINK_LABEL':esc(b.ABOUT_SITE[locale]['footer_link']),
        }
        return b.render_template(self.template,copy,values)

    def view_switch(self, locale: str, chronology: bool = False) -> str:
        ui = self.ui[locale]
        return '<nav class="poetry-view-nav" aria-label="'+esc(ui['heading'])+'">' + ''.join(
            f'<a href="{self.lib.path(route,locale)}"'+(' aria-current="page"' if selected else '')+f'>{esc(ui[key])}</a>'
            for route,key,selected in [('', 'by_work',not chronology),('chronology','by_date',chronology)]) + '</nav>'

    def breadcrumbs(self, locale: str, wid: str | None = None) -> str:
        ui = self.ui[locale]
        links = [f'<a href="{self.lib.path("",locale)}">{esc(ui["heading"])}</a>']
        if wid and wid in self.lib.memberships:
            group = self.lib.collections[self.lib.memberships[wid]]
            links.append(f'<a href="{self.lib.path(group["route"],locale)}">{esc(group["title"][locale])}</a>')
        return '<nav class="poetry-breadcrumbs" aria-label="'+esc(ui['back'])+'">'+'<span aria-hidden="true"> / </span>'.join(links)+'</nav>'

    def excerpt(self, wid: str, locale: str) -> str:
        tid = self.lib.first_text(wid)
        edition = self.lib.edition(tid,locale) or self.lib.edition(tid,'zh')
        lines=edition['body'].splitlines()
        if lines and lines[0]==edition['title']:
            lines=[line for line in lines[1:] if line.strip()]
        text = '\n'.join(lines[:2])
        if len(text)>210: text = text[:207].rstrip()+'…'
        tag = self.base.LANG_BY_ID[locale]['html_lang'] if self.lib.edition(tid,locale) else 'zh-Hant-HK'
        return f'<p class="poetry-excerpt" lang="{tag}">{esc(text)}</p>'

    def work_entry(self, work: dict[str, Any], locale: str) -> str:
        ui, wid = self.ui[locale], work['id']
        versions = len(work['versions'])
        badge = esc(ui[work['form']]) + (' · '+str(versions)+' '+esc(ui['versions']) if versions>1 else '')
        return (f'<li class="poetry-catalogue-entry"><div class="poetry-entry-meta">{date_range(work["composed"])}<span>{badge}</span></div>'
                f'<h3><a href="{self.lib.work_url(wid,locale)}">{esc(self.lib.title(wid,locale))}</a></h3>'
                + self.excerpt(wid,locale) + '</li>')

    def index(self, locale: str, copy: dict[str, Any]) -> str:
        ui = self.ui[locale]
        groups = ['<section class="poetry-index-section" aria-labelledby="poetry-collections"><h2 id="poetry-collections">'+esc(ui['collections'])+'</h2><ol class="poetry-collection-list">']
        for collection in self.lib.collections.values():
            count = ui['count'].replace('{n}',str(len(collection['members'])))
            groups.append(f'<li><div class="poetry-entry-meta">{date_range(collection["dates"])}<span>{esc(count)}</span></div><h3><a href="{self.lib.path(collection["route"],locale)}">{esc(collection["title"][locale])}</a></h3>'+self.excerpt(collection['members'][0],locale)+'</li>')
        roof = self.lib.works['roof-splits']
        groups.append(f'<li><div class="poetry-entry-meta">{date_range(roof["composed"])}<span>{esc(ui["parts_versions"])}</span></div><h3><a href="{self.lib.work_url(roof["id"],locale)}">{esc(self.lib.title(roof["id"],locale))}</a></h3>'+self.excerpt(roof['id'],locale)+'</li>')
        groups.append('</ol></section>')
        groups.append('<section class="poetry-index-section" aria-labelledby="poetry-individual"><h2 id="poetry-individual">'+esc(ui['individual'])+'</h2><ol class="poetry-catalogue">')
        groups.extend(self.work_entry(w,locale) for w in self.lib.standalone() if w['id']!='roof-splits')
        groups.append('</ol></section>')
        return self.shell(route='',locale=locale,copy=copy,heading=ui['heading'],intro='<p>'+esc(ui['intro'])+'</p>',content='\n'.join(groups),switcher=self.view_switch(locale),page_class='poetry-index')

    def chronology(self, locale: str, copy: dict[str, Any]) -> str:
        ui = self.ui[locale]
        entries = [(c['dates']['start'],c['dates'],c['title'][locale],self.lib.path(c['route'],locale), ui['count'].replace('{n}',str(len(c['members'])))) for c in self.lib.collections.values()]
        entries += [(w['composed']['start'],w['composed'],self.lib.title(w['id'],locale),self.lib.work_url(w['id'],locale),ui['parts_versions'] if w['id']=='roof-splits' else ui[w['form']]) for w in self.lib.standalone()]
        rows = ['<ol class="poetry-timeline">']
        for _,dates,title,url,label in sorted(entries,key=lambda x:(x[0],x[2])):
            rows.append('<li><div class="poetry-entry-meta">'+date_range(dates)+f'<span>{esc(label)}</span></div><h2><a href="{url}">{esc(title)}</a></h2></li>')
        rows.append('</ol>')
        return self.shell(route='chronology',locale=locale,copy=copy,heading=ui['by_date'],content='\n'.join(rows),intro='<p>'+esc(ui['original_date'])+'</p>',switcher=self.view_switch(locale,True),page_class='poetry-index')

    def metadata(self, work: dict[str, Any], version: dict[str, Any], locale: str) -> str:
        ui = self.ui[locale]
        date_label='collection_date' if work['composed'].get('basis')=='collection-date' else 'original_date'
        value = esc(ui[date_label])+' '+date_range(work['composed'])
        if version['kind'] in ('revision','draft') and version['date']!=work['composed']['start']:
            value += ' <span aria-hidden="true">·</span> '+esc(ui['revision_date'])+' '+date_span(version['date'])
        return '<p class="poetry-dates">'+value+'</p>'

    def sequence_nav(self, wid: str, locale: str) -> str:
        lib, ui = self.lib, self.ui[locale]
        cid = lib.memberships.get(wid)
        ids = lib.collections[cid]['members'] if cid else [w['id'] for w in lib.standalone()]
        index = ids.index(wid)
        links = []
        for i,kind in ((index-1,'previous'),(index+1,'next')):
            if 0<=i<len(ids):
                target = ids[i]
                label = lib.works[target]['authorial_label'] or lib.title(target,locale)
                if locale in ('zh','zh-hans','ja') and lib.works[target]['authorial_label']:
                    code=lib.works[target]['authorial_label'];label=('甲' if code[0]=='A' else '乙')+dict(zip(range(1,11),'一二三四五六七八九十'))[int(code[1:])]
                links.append(f'<a class="poetry-{kind}" href="{lib.work_url(target,locale)}"><span>{esc(ui[kind])}</span> {esc(label)}</a>')
        if cid:
            group = lib.collections[cid]
            links.insert(1,f'<a href="{lib.path(group["route"],locale)}#contents">{esc(ui["contents"])}</a>')
        nav_label=ui['by_work']+' · '+(lib.works[wid]['authorial_label'] or lib.title(wid,locale))
        return '<nav class="poetry-sequence-nav" aria-label="'+esc(nav_label)+'">'+''.join(links)+'</nav>'

    def text_html(self, tid: str, locale: str, *, single: bool = False) -> str:
        lib, ui = self.lib, self.ui[locale]
        text, work = lib.texts[tid], lib.work_for_text(tid)
        version = lib.versions[text['version']]
        original_locale = 'zh-hans' if locale=='zh-hans' else 'zh'
        original = lib.edition(tid,original_locale)
        translation = lib.edition(tid,locale) if locale not in ('zh','zh-hans') else None
        fragment = lib.text_url(tid,locale).partition('#')[2] or work['id']
        tag = 'zh-Hans' if locale=='zh-hans' else 'zh-Hant-HK'
        pair = 'poem-pair' + ('' if translation else ' source-only')
        rows = [f'<article class="poem reader-poem" id="{esc(fragment)}" data-poetry-text="{esc(tid)}">',self.metadata(work,version,locale),f'<div class="{pair}">',f'<section class="poem-version source" lang="{tag}">']
        title_class = ' class="visually-hidden"' if single and not translation else ''
        rows.append(f'<h2{title_class}>{esc(original["title"])}</h2><div class="body">{esc(original["body"])}</div></section>')
        if translation:
            code = work['authorial_label']
            title = (code+' · ' if code else '') + translation['title']
            rows.append(f'<section class="poem-version translation" lang="{self.base.LANG_BY_ID[locale]["html_lang"]}"><h2>{esc(title)}</h2><div class="body">{esc(translation["body"])}</div></section>')
        rows.append('</div>')
        if tid in lib.offers:
            href='/poetry-voucher/shop.html?'+urlencode({'lang':SHOP_LANGS[locale],'work':tid})
            rows.append(f'<p class="poetry-paper-link"><a href="{esc(href)}">{esc(ui["voucher"])}</a></p>')
        rows.append('</article>')
        return '\n'.join(rows)

    def work_contents(self, wid: str, locale: str, *, sequence: bool = False) -> str:
        lib, ui = self.lib,self.ui[locale]
        work = lib.works[wid]
        rows=[]
        if len(work['versions'])>1:
            rows.append('<nav class="poetry-version-nav" aria-label="'+esc(ui['versions'])+'">')
            for vid in work['versions']:
                v=lib.versions[vid]
                rows.append(f'<a href="#{esc(v["fragment"])}">{esc(v["label"][locale])}</a>')
            rows.append('</nav>')
        for vid in work['versions']:
            version=lib.versions[vid]
            if len(version['parts'])>1:
                rows.append(f'<section class="poetry-version" id="{esc(version["fragment"])}"><h2>{esc(version["label"][locale])} · {date_span(version["date"])}</h2>')
            elif len(work['versions'])>1:
                rows.append('<p class="poetry-version-label">'+esc(version['label'][locale])+'</p>')
            rows.extend(self.text_html(t,locale,single=not sequence and len(version['parts'])==1 and len(work['versions'])==1) for t in version['parts'])
            if len(version['parts'])>1: rows.append('</section>')
        if work['related']:
            rows.append('<aside class="poetry-related" aria-labelledby="related-'+esc(wid)+'"><h2 id="related-'+esc(wid)+'">'+esc(ui['related'])+'</h2><ul>'+''.join(f'<li><a href="{lib.work_url(r,locale)}">{esc(lib.title(r,locale))}</a></li>' for r in work['related'])+'</ul></aside>')
        rows.append(self.sequence_nav(wid,locale))
        return '\n'.join(rows)

    def work_page(self, wid: str, locale: str, copy: dict[str, Any]) -> str:
        work, ui = self.lib.works[wid],self.ui[locale]
        intro = '<p>'+esc(ui[work['form']])+'</p>'
        return self.shell(route=work['route'],locale=locale,copy=copy,heading=self.lib.title(wid,locale),content=self.work_contents(wid,locale),intro=intro,breadcrumbs=self.breadcrumbs(locale,wid))

    def collection_page(self, cid: str, locale: str, copy: dict[str, Any]) -> str:
        group, ui = self.lib.collections[cid],self.ui[locale]
        rows=['<nav id="contents" class="poetry-member-nav" aria-label="'+esc(ui['contents'])+'"><ol>']
        for wid in group['members']:
            title=self.lib.title(wid,locale)
            label=self.lib.works[wid]['authorial_label']
            if label and locale in ('zh','zh-hans','ja'):
                label=('甲' if label[0]=='A' else '乙')+dict(zip(range(1,11),'一二三四五六七八九十'))[int(label[1:])]
            rows.append(f'<li><a href="{self.lib.work_url(wid,locale)}" title="{esc(title)}">{esc(label or title)}</a></li>')
        rows.append('</ol></nav>')
        rows.extend(self.work_contents(wid,locale,sequence=True) for wid in group['members'])
        intro='<p>'+esc(ui['jia_note'] if cid=='jia-yi' else ui['september_note'])+'</p><p>'+esc(ui['count'].replace('{n}',str(len(group['members']))))+' · '+date_range(group['dates'])+'</p>'
        return self.shell(route=group['route'],locale=locale,copy=copy,heading=group['title'][locale],intro=intro,content='\n'.join(rows),breadcrumbs=self.breadcrumbs(locale))

    def legacy(self, page: str, locale: str, copy: dict[str, Any]) -> str:
        targets=self.lib.legacy_targets(page,locale)
        default=targets['']
        rows=['<p>'+esc(self.ui[locale]['legacy'])+'</p><ul class="poetry-legacy-links">']
        for old,url in targets.items():
            if not old: continue
            if page=='ci' and old in self.lib.data['legacy']['ci']:
                tid=self.lib.data['legacy']['ci'][old]
                label=(self.lib.edition(tid,locale) or self.lib.edition(tid,'zh'))['title']
            elif old == 'voucher-heading':
                label = 'Poetry Voucher'
            elif page == 'shi' and old in ('summer-2017', 'summer-archive-link-title'):
                label = self.lib.title('summer-2017', locale)
            elif page == 'shi':
                label = self.lib.title('roof-splits', locale)
            else: label=self.ui[locale]['heading']
            rows.append(f'<li id="{esc(old)}"><a href="{url}">{esc(label)}</a></li>')
        rows.append('</ul>')
        payload=json.dumps(targets,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
        rows.append('<script id="poetry-legacy-map" type="application/json">'+payload+'</script>')
        return self.shell(route='' if page=='ci' else 'roof-splits',locale=locale,copy=copy,heading=self.ui[locale]['heading'],content='\n'.join(rows),extra_head='<meta name="robots" content="noindex,follow">',canonical=self.base.BASE_URL+default,page_class='poetry-legacy')

    def build(self, locales: dict[str,Any], *, check: bool = False) -> list[Path]:
        changed=[]
        collection_routes={c['route']:c['id'] for c in self.lib.collections.values()}
        for locale,copy in locales.items():
            for route in self.lib.routes():
                if route=='summer-2017': continue  # Keeps the existing author-approved mirrored layout.
                if route=='': rendered=self.index(locale,copy)
                elif route=='chronology': rendered=self.chronology(locale,copy)
                elif route in collection_routes: rendered=self.collection_page(collection_routes[route],locale,copy)
                else:
                    work=next(w for w in self.lib.works.values() if w['route']==route)
                    rendered=self.work_page(work['id'],locale,copy)
                path=self.base.ROOT/self.lib.path(route,locale).strip('/')/'index.html'
                if not rendered.endswith('\n'): rendered+='\n'
                if not path.exists() or path.read_text(encoding='utf-8')!=rendered:
                    changed.append(path)
                    if not check:
                        path.parent.mkdir(parents=True,exist_ok=True)
                        path.write_text(rendered,encoding='utf-8')
        return changed
