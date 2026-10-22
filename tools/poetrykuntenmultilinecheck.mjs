#!/usr/bin/env node
// Automated cross-browser geometry and authorial-text checks for every
// manuscript which has manually authored, source-hash-pinned kanbun marks.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {chromium, webkit} from 'playwright';

const root = process.cwd();
const data = JSON.parse(await readFile('content/poetry/kunten.json','utf8')).texts;
const library = JSON.parse(await readFile('content/poetry/library.json','utf8'));
const workById = new Map(library.works.map(work=>[work.id,work]));
const versionById = new Map(library.versions.map(version=>[version.id,version]));
const textById = new Map(library.texts.map(text=>[text.id,text]));
const routes = Object.fromEntries(Object.keys(data).map(tid=>{
  const text = textById.get(tid);
  const version = versionById.get(text?.version);
  const work = workById.get(version?.work);
  assert.ok(work?.route,'Annotated text must resolve to a canonical work: '+tid);
  return [tid,'/ja/poetry/'+work.route+'/'];
}));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript',
  '.woff2':'font/woff2','.png':'image/png','.json':'application/json'};
const server=createServer(async(req,res)=>{
  try{
    let url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(url.endsWith('/'))url+='index.html';
    const file=path.resolve(root,'.'+url);
    if(!file.startsWith(root+path.sep))throw Error('Path escape');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
let verified=0, wrapped=0,stanzasVerified=0;
const COLUMN=12, INDENT=2;
const inspect=async (frame, expected) => {
  return frame.locator('#kanbun-display').evaluate((el,{COLUMN,INDENT})=>{
    const rect=el.getBoundingClientRect();
    // 漢文 textbook layout: .kanbun-column elements, one 句 each. Title and
    // preface columns are checked for collisions with everything else;
    // glyph and mark counts below belong to the body columns.
    const columns=[...el.querySelectorAll('.kanbun-column')];
    const lines=columns.filter(c=>c.dataset.kanbunColumn==='body');
    const titles=columns.filter(c=>c.classList.contains('kanbun-title'));
    const prefaces=columns.filter(c=>c.dataset.kanbunColumn==='preface');
    const chars=[...el.querySelectorAll('.kanji')];
    const han=nodes=>nodes.flatMap(p=>[...p.querySelectorAll('.kanji')]).map(n=>n.textContent)
      .filter(value=>/\p{Script=Han}/u.test(value)).join('');
    const notes=[...el.querySelectorAll('.furigana,.okurigana,.kaeriten,.saidoku')];
    const intersection=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*
      Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    const errors=[];
    for(const mark of notes){
      const m=mark.getBoundingClientRect();
      if(m.right>innerWidth+1 || m.left < -1)errors.push('marker clipped '+mark.textContent);
      for(const c of chars)if(intersection(m,c.getBoundingClientRect())>1)
        errors.push('marker overlaps kanji '+mark.textContent+' '+c.textContent);
    }
    for(let i=0;i<notes.length;i++)for(let j=i+1;j<notes.length;j++)
      if(intersection(notes[i].getBoundingClientRect(),notes[j].getBoundingClientRect())>1)
        errors.push('two markers collide '+notes[i].textContent+' '+notes[j].textContent);
    for(let i=0;i<chars.length;i++)for(let j=i+1;j<chars.length;j++)
      if(intersection(chars[i].getBoundingClientRect(),chars[j].getBoundingClientRect())>1)
        errors.push('two characters collide '+chars[i].textContent+' '+chars[j].textContent);
    for(const p of columns){
      const b=p.getBoundingClientRect();
      if(b.left<-1 || b.right>innerWidth+1)errors.push('column clipped');
    }
    // 行款: cells of the column, each one .unit, 空一格 or 低二格 cell.
    const cells=c=>[...c.children];
    const kinds=c=>cells(c).map(n=>n.classList.contains('unit')?'u':
      n.classList.contains('kanbun-space')?'s':n.classList.contains('kanbun-indent')?'i':'?');
    const em=parseFloat(getComputedStyle(el).fontSize);
    const box=n=>n.getBoundingClientRect();
    // One 句 a column, never wrapped: every character of a column on one
    // vertical axis, each column starting at its band's top.
    for(const c of columns){
      const xs=[...c.querySelectorAll(':scope > .unit > .kanji')].map(k=>Math.round(box(k).left));
      if(new Set(xs).size>1)errors.push('column wrapped: '+c.textContent);
    }
    const bands=[...el.querySelectorAll('.kanbun-band')];
    for(const b of bands){
      const tops=[...b.children].map(c=>Math.round(box(c).top));
      if(new Set(tops).size>1)errors.push('band columns do not all start at the top');
    }
    // No band holds a single body column once the body wraps (2026-10-22).
    if(bands.length>1)bands.forEach((b,i)=>{
      if([...b.children].filter(c=>c.dataset.kanbunColumn==='body').length===1)
        errors.push((i===bands.length-1?'last ':'')+'band '+i+' holds a single column');
    });
    // A preface is set 低二格 and broken after clauses, short clauses
    // joining the column before so no column holds only one or two.
    prefaces.forEach((c,i)=>{
      const k=kinds(c);
      if(k.slice(0,INDENT).join('')!=='i'.repeat(INDENT) || k.slice(INDENT).some(x=>x!=='u'))
        errors.push('preface column '+i+' is not set 低二格');
      const first=box(c.querySelector('.unit')).top-box(c).top;
      if(first<INDENT*1.2*em)errors.push('preface column '+i+' starts only '+first+'px low');
      const alone=prefaces.filter(p=>p.dataset.kanbunPart===c.dataset.kanbunPart).length===1;
      if(!alone && k.length-INDENT<=2)errors.push('preface column '+i+' is an orphan');
    });
    titles.filter(c=>!prefaces.includes(c)).forEach((c,i)=>{
      const k=kinds(c);
      if(k.length>COLUMN+1 || k.some(x=>x!=='u'))errors.push('title column '+i+' holds '+k.join(''));
    });
    // Title and preface form the head block; the body block begins in a
    // fresh column.
    const head=el.querySelector(':scope > .kanbun-head');
    if(titles.some(c=>c.parentElement!==head) || lines.some(c=>!c.parentElement.matches('.kanbun-text > .kanbun-band')))
      errors.push('title/body blocks');
    const firstBody=columns.indexOf(lines[0]);
    if(columns.slice(0,firstBody).some(c=>!titles.includes(c)) ||
       columns.slice(firstBody).some(c=>titles.includes(c)))errors.push('title/body column order');
    const starts=[...el.querySelectorAll('[data-kanbun-stanza-start]')];
    // 上下片: a blank column between stanzas, or the stanza opens a band.
    const gapColumns=[...el.querySelectorAll('.kanbun-column[data-kanbun-column="gap"]')];
    for(const g of gapColumns){
      if(g.querySelector('*'))errors.push('blank stanza column is not blank');
      if(!g.previousElementSibling||!g.nextElementSibling)errors.push('blank column at a band edge');
      if(Math.abs(box(g).width-box(lines[0]).width)>1)errors.push('blank column of another width');
    }
    lines.forEach((c,i)=>{
      const prev=lines[i-1];
      if(!prev||prev.dataset.kanbunStanza===c.dataset.kanbunStanza)return;
      const before=c.previousElementSibling;
      if(before ? before.dataset.kanbunColumn!=='gap' : false)errors.push('stanza joined without a blank column');
    });
    // Body bands share one right edge and never start under the title:
    // either all lie left of the title block, or all below it.
    const bandRight=bands.map(b=>Math.max(...[...b.children].map(c=>box(c).right)));
    if(Math.max(...bandRight)-Math.min(...bandRight)>1.5)errors.push('body bands not on one right edge');
    // A band break reads as a new half-leaf: at least 1.5em clear.
    const lowest=b=>Math.max(...[...b.querySelectorAll('.kanbun-column > *')].map(n=>box(n).bottom));
    const highest=b=>Math.min(...[...b.children].map(c=>box(c).top));
    for(let i=1;i<bands.length;i++)
      if(highest(bands[i])-lowest(bands[i-1])<1.5*em)errors.push('band '+i+' not clearly separated');
    if(head){
      const h=box(head);
      const headBottom=Math.max(...[...head.querySelectorAll('.kanbun-column > *')].map(n=>box(n).bottom));
      const beside=Math.max(...bandRight)<=h.left+1;
      const below=bands.every(b=>highest(b)>=headBottom+1.5*em);
      if(!beside && !below)errors.push('body band under the title column');
      if(beside && bands.length && Math.abs(highest(bands[0])-h.top)>1.5)errors.push('body beside title not top-aligned');
    }
    return {
      glyphs:chars.length,renderedHan:han(lines),titleHan:han(titles),
      returnMarks:lines.reduce((n,p)=>n+p.querySelectorAll('.kaeriten').length,0),
      titleReturnMarks:titles.reduce((n,p)=>n+p.querySelectorAll('.kaeriten').length,0),
      stanzaStarts:starts.length,columnCount:lines.length,
      bands:bands.length,
      clauses:lines.map(c=>han([c])),
      contentRight:rect.right,scroll:document.documentElement.scrollWidth-innerWidth,
      pageWidth:innerWidth, errors,
    };
  },{COLUMN,INDENT});
};
try{
  for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch();
    try{
      for(const width of [320,390,768,1280]){
        const page=await browser.newPage({viewport:{width,height:870}});
        const exceptions=[];
        page.on('pageerror',e=>exceptions.push(e.message));
        let currentRoute='';
        for(const [tid,entry] of Object.entries(data)){
          if(routes[tid] !== currentRoute){
            currentRoute=routes[tid];
            await page.goto(base+currentRoute+'?layout=vertical&kunten=on',{waitUntil:'load'});
          }
          const article=page.locator('[data-poetry-text="'+tid+'"]');
          const stage=article.locator('[data-poetry-kanbun-viewer="'+tid+'"]');
          await stage.locator('iframe').waitFor({state:'visible',timeout:11000});
          await stage.locator('[data-kanbun-copy]').waitFor({state:'visible'});
          // Request is explicit: no assumption that iframe visibility implies
          // its layout is stable or that source-hash handshake has completed.
          await page.waitForFunction(id=>document.querySelector(
            '[data-poetry-kanbun-viewer="'+id+'"]')?.dataset.kanbunReady==='true',tid,{timeout:9000});
          await page.evaluate(async()=>{await document.fonts.ready;
            await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)))});
          await page.waitForTimeout(150);
          const source=await article.locator('.source .body').textContent();
          const digest=createHash('sha256').update(source).digest('hex');
          assert.equal(digest,entry.source_body_sha256,'Wrong source attached to '+tid);
          const frames=stage.locator('iframe').contentFrame();
          const geometry=await inspect(frames,entry);
          const expectedHan=[...source].filter(c=>/\p{Script=Han}/u.test(c)).join('');
          // The upstream converter treats some non-CJK punctuation
          // (notably ？) as a kanji cell. Match the entire sequence of
          // actual Han glyphs rather than equating .kanji box count with
          // Unicode Script=Han character count.
          assert.equal(geometry.renderedHan,expectedHan,
            tid+': altered original Han glyph sequence');
          assert.equal(geometry.returnMarks,entry.marks.filter(m=>m.kaeriten).length);
          const sourceTitle=await article.locator('.source h2').getAttribute('data-poetry-title');
          assert.equal(geometry.titleHan,[...sourceTitle].filter(c=>/\p{Script=Han}/u.test(c)).join(''),
            tid+': title not typeset in full');
          assert.equal(geometry.titleReturnMarks,entry.title.flat().filter(m=>m.kaeriten).length,
            tid+': title return marks');
          const expectedStanzas=source.split('\n\n').filter(s=>s.trim()).length;
          assert.equal(geometry.stanzaStarts,expectedStanzas-1,tid+': lost stanza boundary');
          // Independently from the source: one column per 句, broken after
          // each clause-ending mark.
          const expectedClauses=source.split(/[，。、！？；：]/u)
            .map(c=>[...c].filter(x=>/\p{Script=Han}/u.test(x)).join('')).filter(Boolean);
          assert.deepEqual(geometry.clauses,expectedClauses,tid+': not one 句 per column');
          assert.ok(geometry.scroll<=1,
            engineName+' '+width+' '+tid+': clipped inside reader '+JSON.stringify(geometry));
          assert.deepEqual(geometry.errors,[],
            engineName+' '+width+' '+tid+': rendered glyph overlap');
          const host=await stage.evaluate(el=>({
            pageOverflow:document.documentElement.scrollWidth-innerWidth,
            width:el.querySelector('iframe').getBoundingClientRect().width,
            available:el.closest('.source').getBoundingClientRect().width,
            on:!el.hidden,hasMarks:el.dataset.kanbunReady==='true',
          }));
          assert.ok(host.pageOverflow<=1,engineName+' '+width+' '+tid+': host overflow');
          assert.ok(host.width>0&&host.width<host.available,
            engineName+' '+width+' '+tid+': iframe not within its column');
          assert.ok(host.on&&host.hasMarks);
          assert.deepEqual(exceptions,[],engineName+': page errors');
          if(geometry.bands>1)wrapped++;
          if(expectedStanzas>1)stanzasVerified++;
          verified++;
        }
        await page.close();
      }
    }finally{await browser.close();}
  }
  console.log('poetrykuntenmultilinecheck: '+verified+' document/viewport pairs; '
    +wrapped+' wrapped samples, '+stanzasVerified+' multi-stanza samples; '
    +'Chromium and WebKit; hash, marks, one 句 per column, 低二格 preface, title block, blank stanza column, bands between columns only, '
    +'glyph collision, right-aligned bands, internal/host overflow PASS');
}finally{await new Promise(done=>server.close(done));}
