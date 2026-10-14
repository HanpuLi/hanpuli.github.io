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
const inspect=async (frame, expected) => {
  return frame.locator('#kanbun-display').evaluate(el=>{
    const rect=el.getBoundingClientRect();
    // Title columns are checked for collisions with everything else, but
    // the authored-line, glyph and mark counts below belong to the body.
    const lines=[...el.querySelectorAll('p:not(.kanbun-title)')];
    const titles=[...el.querySelectorAll('p.kanbun-title')];
    const units=[...el.querySelectorAll('.unit')];
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
    for(const p of [...titles,...lines]){
      const b=p.getBoundingClientRect();
      if(b.left<-1 || b.right>innerWidth+1)errors.push('authored line clipped');
    }
    return {
      glyphs:chars.length,renderedHan:han(lines),titleHan:han(titles),
      returnMarks:lines.reduce((n,p)=>n+p.querySelectorAll('.kaeriten').length,0),
      titleReturnMarks:titles.reduce((n,p)=>n+p.querySelectorAll('.kaeriten').length,0),
      stanzaCount:el.querySelectorAll('[data-kanbun-stanza]').length,lineCount:lines.length,
      bands:[...new Set(lines.map(n=>Math.round(n.getBoundingClientRect().y)))].length,
      contentRight:rect.right,scroll:document.documentElement.scrollWidth-innerWidth,
      pageWidth:innerWidth, errors,
      linePositions:lines.map(l=>({left:Math.round(l.getBoundingClientRect().left),
          top:Math.round(l.getBoundingClientRect().top)})),
    };
  },expected);
};
try{
  for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch();
    try{
      for(const width of [320,390,1280]){
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
          const expectedLines=source.split('\n').filter(s=>s.trim()).length;
          assert.equal(geometry.stanzaCount,expectedStanzas,tid+': lost authored stanza');
          assert.equal(geometry.lineCount,expectedLines,tid+': lost authored line');
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
    +'Chromium and WebKit; hash, marks, stanza boundaries, line order, '
    +'glyph collision, internal/host overflow PASS');
}finally{await new Promise(done=>server.close(done));}
