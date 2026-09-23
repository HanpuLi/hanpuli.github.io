"""Generate the private-circulation request, status and reader shells."""
from __future__ import annotations
import html, json
from pathlib import Path
API_ORIGIN="https://node.tail95239f.ts.net:10000"
PAGES=("request","status","read")
def path_for(lid,page):
    base="" if lid=="en" else f"/{lid}"
    suffix="" if page=="request" else f"{page}/"
    return f"{base}/writing/first-love/{suffix}"
def _langs(languages,lid,page):
    out=[]
    for lang in languages:
        target=path_for(lang["id"],page); label=html.escape(lang["short"]); title=html.escape(lang["label"],quote=True)
        if lang["id"]==lid: out.append(f'<span class="current" aria-current="page" title="{title}">{label}</span>')
        else: out.append(f'<a href="{target}" data-preserve-fragment title="{title}" hreflang="{html.escape(lang["html_lang"],quote=True)}">{label}</a>')
    return " ".join(out)
def _head(site,lid,lang,page,copy):
    url=site+path_for(lid,page); robots='<meta name="robots" content="noindex,noarchive,nosnippet">\n' if page!="request" else ""
    hrefs="\n".join(f'<link rel="alternate" hreflang="{html.escape(x["html_lang"],quote=True)}" href="{site+path_for(x["id"],page)}">' for x in lang["_all"])
    return f'''<!doctype html><html lang="{html.escape(lang["html_lang"],quote=True)}" translate="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="google" content="notranslate">{robots}<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src {API_ORIGIN}; frame-src blob:; object-src blob:; img-src 'self' data:; base-uri 'none'; form-action 'self'"><title>{html.escape(copy["title"] if page=="request" else copy["statusTitle"] if page=="status" else copy["readerTitle"])} · Hanpu Li</title><meta name="description" content="{html.escape(copy["description"],quote=True)}"><link rel="canonical" href="{url}">{hrefs}<link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/first-love-access.css"><script src="/assets/accessibility.js"></script><script src="/assets/first-love-access.js" defer></script></head>'''
def render(site,languages,lid,page,copy):
    lang=next(x for x in languages if x["id"]==lid).copy(); lang["_all"]=languages
    home="/" if lid=="en" else f"/{lid}/"; request_path=path_for(lid,"request"); status_path=path_for(lid,"status"); reader_path=path_for(lid,"read")
    common=f'''<body class="first-love-page locale-{lid}"><a class="skip-link" href="#main">Skip to content</a><div class="wrap"><header class="page-topbar"><a class="page-wordmark" href="{home}">Hanpu Li <span lang="zh-Hant-HK">李函璞</span></a><nav class="page-nav" aria-label="Site"><a href="{home}#writing">01 writing</a></nav><div class="page-utility"><nav class="page-languages" aria-label="Languages">{_langs(languages,lid,page)}</nav></div></header>'''
    data=f'data-first-love-access data-page="{page}" data-error="{html.escape(copy["error"],quote=True)}" data-missing="{html.escape(copy["missing"],quote=True)}" data-pending="{html.escape(copy["pending"],quote=True)}" data-active="{html.escape(copy["active"],quote=True)}" data-declined="{html.escape(copy["declined"],quote=True)}" data-revoked="{html.escape(copy["revoked"],quote=True)}" data-expired="{html.escape(copy["expired"],quote=True)}" data-unavailable="{html.escape(copy["unavailable"],quote=True)}" data-status-path="{status_path}" data-reader-path="{reader_path}"'
    hero=f'''<main id="main" tabindex="-1" {data}><header class="first-love-hero"><div><p class="first-love-eyebrow">{html.escape(copy["eyebrow"])}</p><h1>{html.escape(copy["title"])}</h1></div><div class="first-love-copy"><p>{html.escape(copy["description"])}</p></div></header>'''
    if page=="request":
        body=f'''<section class="access-panel" aria-labelledby="request-heading"><h2 id="request-heading">{html.escape(copy["request"])}</h2><p>{html.escape(copy["intro"])}</p><form class="access-form"><label>{html.escape(copy["name"])}<input name="name" autocomplete="name" required maxlength="160"></label><label>{html.escape(copy["email"])}<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>{html.escape(copy["affiliation"])}<input name="affiliation" autocomplete="organization" maxlength="240"></label><label>{html.escape(copy["reason"])}<textarea name="reason" maxlength="1000"></textarea></label><label class="access-honeypot" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off"></label><button type="submit">{html.escape(copy["submit"])}</button></form><p class="access-result" data-result role="status" aria-live="polite"></p><div class="access-success" data-success hidden><h3>{html.escape(copy["sent"])}</h3><p>{html.escape(copy["save"])}</p><p class="first-love-meta">ID <span data-request-id></span></p><input class="private-url" data-private-url readonly aria-label="{html.escape(copy["statusTitle"],quote=True)}"><div class="access-actions"><button class="access-action" type="button" data-copy>{html.escape(copy["copy"])}</button><a class="access-action" data-open-status>{html.escape(copy["open"])}</a></div></div><p class="access-privacy">{html.escape(copy["privacy"])}</p></section>'''
    elif page=="status":
        body=f'''<section class="access-panel"><h1>{html.escape(copy["statusTitle"])}</h1><p class="status-state" data-state aria-live="polite"></p><p class="version-meta" data-version></p><div class="access-actions"><a class="access-action" data-read hidden>{html.escape(copy["read"])}</a><a class="access-action" href="{request_path}">{html.escape(copy["back"])}</a></div></section>'''
    else:
        body=f'''<section class="access-panel"><h1>{html.escape(copy["readerTitle"])}</h1><p class="reader-notice">{html.escape(copy["notice"])}</p><p class="version-meta" data-version></p><p class="status-state" data-state aria-live="polite">{html.escape(copy["loading"])}</p><div class="access-actions"><a class="access-action" data-open-pdf hidden>{html.escape(copy["openPdf"])}</a><a class="access-action" href="{request_path}">{html.escape(copy["back"])}</a></div><iframe class="reader-frame" data-pdf hidden title="{html.escape(copy["readerTitle"],quote=True)}"></iframe></section>'''
    foot='''</main><footer class="page-footer"><p><a href="/">Hanpu Li</a></p></footer></div></body></html>'''
    return _head(site,lid,lang,page,copy)+common+hero+body+foot
def build(root:Path,check=False):
    languages=json.loads((root/"content/languages.json").read_text()); copy=json.loads((root/"content/first-love-access.json").read_text()); changed=[]
    for lang in languages:
        lid=lang["id"]
        for page in PAGES:
            target=root/path_for(lid,page).lstrip("/")/"index.html"; rendered=render("https://hanpuli.github.io",languages,lid,page,copy[lid])
            if not rendered.endswith("\n"): rendered+="\n"
            old=target.read_text() if target.exists() else None
            if old!=rendered:
                changed.append(target)
                if not check: target.parent.mkdir(parents=True,exist_ok=True); target.write_text(rendered)
    return changed
