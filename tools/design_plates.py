"""Measured specimen plates. All explanatory copy lives in content/design/."""
import html
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
ASSET='/assets/design/'
def e(x):return html.escape(str(x),quote=True)
def n(x):return f'{x:.2f}'.rstrip('0').rstrip('.')
def load(locale):return json.loads((ROOT/'content/design'/f'{locale}.json').read_text())
def measurement():return json.loads((ROOT/'assets/design/measurements.json').read_text())
def para(s,cls='plate-copy'):return f'<p class="{cls}">{e(s)}</p>'
def heading(s):return f'<h3>{e(s)}</h3>'
def image(name,alt,w,h,cls=''):
 return f'<a class="plate-image-link {cls}" aria-label="{e(alt)}" href="{ASSET}{name}"><img src="{ASSET}{name}" width="{int(w)}" height="{int(h)}" alt="{e(alt)}" loading="lazy" decoding="async"></a>'
def key(items):return '<ol class="plate-key">'+''.join(f'<li><span>{i:02}</span>{e(s)}</li>' for i,s in enumerate(items,1))+'</ol>'
def metric(label,value):return f'<div><dt>{e(label)}</dt><dd>{e(value)}</dd></div>'
def source(c,url):return f'<a class="plate-source" href="{e(url)}">{e(c["source"])}</a>'
def svg_start(w,h):return f'<svg aria-hidden="true" focusable="false" viewBox="0 0 {n(w)} {n(h)}" xmlns="http://www.w3.org/2000/svg">'
def site_view(v,c):
 w,h=v['width'],v['height']; lines=[];x=0
 for col in v['columns']:
  lines.append(f'<path class="plate-gridline" d="M {n(x)} 0 V {n(h)} M {n(x+col)} 0 V {n(h)}"/>');x+=col+v['gap']
 for i,b in enumerate(v['parts'],1):
  lines.append(f'<rect class="plate-outline" x="{n(b["x"]+.5)}" y="{n(b["y"])}" width="{n(b["w"]-1)}" height="{n(b["h"])}"/>')
  cy=max(11,b['y']-12);cx=b['x']+11
  lines.append(f'<circle class="plate-dot" cx="{n(cx)}" cy="{n(cy)}" r="10"/><text class="plate-number" x="{n(cx)}" y="{n(cy+3.5)}">{i}</text>')
 title=c['desktop'] if v['viewport']==1440 else c['mobile']
 return f'<div class="plate-view"><h4>{e(title)}</h4><div class="plate-overlay">{image(v["file"],title,w,h)}{svg_start(w,h)}'+''.join(lines)+'</svg></div>'+f'<a class="plate-source" href="{ASSET}{v["file"]}">{e(c["enlarge"])}</a></div>'
def site_html(locale):
 c=load(locale);s=measurement()['site'][locale];d=s['views']['1440'];m=s['views']['390'];out=[]
 out.append(f'<figure class="site-visual-grammar design-atlas" aria-labelledby="site-design-title"><figcaption id="site-design-title"><h2>{e(c["site_title"])}</h2></figcaption>{para(c["site_intro"])}')
 out.append('<section class="design-plate">'+heading(c['layout_title'])+para(c['layout_note']))
 out.append(site_view(d,c))
 out.append('<dl class="plate-metrics">'+metric(c['grid_label'],str(len(d['columns']))+' / '+n(min(d['columns']))+'–'+n(max(d['columns']))+' CSS px')+metric(c['gap_label'],n(d['gap'])+' CSS px')+metric(c['rule_label'],d['rule'])+metric(c['padding_label'],d['paddingTop'])+'</dl>')
 out.append('<div class="plate-responsive">'+site_view(m,c)+'<div>'+key(c['anchors'])+para(c['site_end'])+source(c,s['route']+'#work')+'</div></div></section>')
 out.append('<section class="design-plate">'+heading(c['type_title'])+para(c['type_intro'])+'<div class="plate-type-list">')
 for i,t in enumerate(s['type']):

  out.append(f'<div class="plate-type-row"><div class="plate-type-reading"><h4>{e(c["roles"][i])}</h4><p class="measured-type measured-{locale}-{i}">{e(t["text"])}</p></div><dl class="plate-type-metrics">'+metric(c['size'],n(t['size'])+' CSS px')+metric(c['leading'],n(t['leading'])+' CSS px')+metric(c['tracking'],t['tracking'])+metric(c['face'],' / '.join(f['family'] for f in t['fonts']))+'</dl></div>')
 out.append('</div></section></figure>');return ''.join(out)
def anatomy(v,c):
 h=v['height'];rh=v['receiptHeight'];ch=v['cutHeight'];ys=[150,v['headerY']+12,v['totalY']+24,rh-36,rh+ch/2,rh+ch+v['body']['y']+20]
 # All leaders remain outside the raster, so no glyph is covered.
 overlay=svg_start(440,h)
 for i,y in enumerate(ys,1):overlay+=f'<path class="plate-leader" d="M 382 {n(y)} H 411"/><circle class="plate-dot" cx="423" cy="{n(y)}" r="12"/><text class="plate-number" x="423" y="{n(y+4)}">{i}</text>'
 overlay+='</svg>'
 notes='<ol class="plate-callouts">'+''.join(f'<li><span class="plate-index">{i:02}</span><div><h4>{e(pair[0])}</h4>{para(pair[1])}</div></li>' for i,pair in enumerate(c['callouts'],1))+'</ol>'
 return f'<div class="plate-anatomy"><div class="plate-strip"><div class="plate-strip-art">{image("voucher-strip.png",c["specimen"],384,h)}{overlay}</div><a class="plate-source" href="{ASSET}voucher-strip.png">{e(c["enlarge"])}</a></div>{notes}</div>'
def widths(v,c):
 p=v['paper'];paper=p['paperMm']*p['dotsPerMm'];img=p['printableDots'];margin=p['pdfSideMarginDots'];rows=[(c['paper'],0,paper),(c['image'],margin,img),(c['receipt_width'],margin+p['receiptInsetDots'],v['receipt']['lineChars']*p['receiptCellDots']),(c['poem_width'],margin+p['bodyInsetDots'],p['bodyWidthDots'])]
 out='<div class="plate-widths">'
 for label,start,width in rows:
  svg=svg_start(paper+16,42)+f'<rect class="paper-outline" x="8" y="5" width="{paper}" height="32"/><rect class="image-outline" x="{margin+8}" y="5" width="{img}" height="32"/><path class="plate-leader" d="M {start+8} 21 H {start+width+8} M {start+8} 12 V 30 M {start+width+8} 12 V 30"/></svg>'
  out+=f'<div class="plate-width-row"><h4>{e(label)}</h4>{svg}<p>{n(width/p["dotsPerMm"])} mm <span>/ {width} dots</span></p></div>'
 return out+'</div>'
def glyph(v):
 rows=v['glyph'].split(' ');out=svg_start(132,180)
 for y,row in enumerate(rows):
  for x,b in enumerate(row):out+=f'<rect x="{x*24+6}" y="{y*24+6}" width="24" height="24" fill="{"#171714" if b=="1" else "#fff"}" stroke="#c7c4b8" stroke-width="1"/>'
 return out+'</svg>'
def voucher_html(locale):
 c=load(locale);v=measurement()['voucher']
 first=f'<figure class="pv-structure-diagram design-atlas" aria-labelledby="pv-diagram-title"><figcaption id="pv-diagram-title"><h2>{e(c["pv_title"])}</h2></figcaption>{para(c["pv_intro"])}<section class="design-plate">{heading(c["anatomy_title"])}{para(c["anatomy_note"])}{anatomy(v,c)}</section><section class="design-plate">{heading(c["geometry_title"])}{para(c["geometry_intro"])}{widths(v,c)}{para(c["dots_note"],"plate-footnote")}</section></figure>'
 second=f'<figure class="pv-aesthetic-diagram design-atlas" aria-labelledby="pv-aesthetic-title"><figcaption id="pv-aesthetic-title"><h2>{e(c["columns_title"])}</h2></figcaption>{para(c["columns_intro"])}'
 second+='<div class="plate-till-grid">'+column_ruler()+image('receipt-columns.png',c['columns_intro'],384,120,'pixel-proof')+'<div class="plate-cell-ruler" aria-hidden="true">'+''.join(f'<span>{i}</span>' for i in range(1,31))+'</div></div>'
 second+='<dl class="plate-metrics">'+''.join(metric(label,str(width)+' × 12 = '+str(width*12)+' dots') for label,width in zip([f'{i:02} / '+label for i,label in enumerate(c['columns'],1)],[3,11,6,6]))+'</dl>'
 second+='<div class="plate-glyph-detail"><div class="plate-glyph" role="img" aria-label="'+e(c['glyph_note'])+'">'+glyph(v)+'</div><div>'+para(c['glyph_note'])+image('receipt-total.png',c['callouts'][2][1],384,48,'pixel-proof')+'</div></div>'
 second+='<section class="design-plate">'+heading(c['font_title'])+para(c['font_intro'])+'<div class="plate-font-pair">'
 for title,file in [(c['base'],'poem-bitmap.png'),(c['upgrade'],'poem-site.png')]:second+='<div><h4>'+e(title)+'</h4>'+image(file,title+' · '+v['order']['lines'][0]['poem'].split('\n')[0],384,96,'pixel-proof')+'</div>'
 second+='</div>'+para(c['font_note'])+para(c['detail_note'],'plate-footnote')+source(c,'/ci.html#b3')+'</section></figure>'
 return first+second

def specimen_css():
 out=['/* Generated from measured browser styles by tools/build_site.py. */']
 for locale,s in measurement()['site'].items():
  for i,t in enumerate(s['type']):
   out.append(f'.design-atlas .measured-{locale}-{i}'+'{'+f'font-family:{t["family"]};font-size:{t["size"]}px;line-height:{t["leading"]}px;letter-spacing:{t["tracking"]};font-weight:{t["weight"]};text-transform:{t["transform"]}'+'}')
 return '\n'.join(out)+'\n'

def column_ruler():
 out=svg_start(384,30)
 for i,(x,w) in enumerate([(12,36),(60,132),(204,72),(288,72)],1):
  out+=f'<path class="plate-leader" d="M {x} 28 V 20 H {x+w} V 28"/><text class="plate-field-number" x="{x+w/2}" y="12">{i:02}</text>'
 return out+'</svg>'
