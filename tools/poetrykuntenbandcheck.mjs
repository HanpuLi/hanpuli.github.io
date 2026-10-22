#!/usr/bin/env node
// Band layout of every kanbun reader on every Japanese poetry page at
// seven widths (Chromium). Bands wrap only between columns; no band may
// hold a single column, at the end or in the middle (2026-10-22), and a
// two-stanza poem that cannot sit in one band splits at its stanza break
// (浣溪沙 at 390: 上片 one band, 下片 the next).
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

const root = process.cwd();
const data = JSON.parse(await readFile('content/poetry/kunten.json','utf8')).texts;
const library = JSON.parse(await readFile('content/poetry/library.json','utf8'));
const workById = new Map(library.works.map(work=>[work.id,work]));
const versionById = new Map(library.versions.map(version=>[version.id,version]));
const textById = new Map(library.texts.map(text=>[text.id,text]));
for (const tid of Object.keys(data)) {
  const work = workById.get(versionById.get(textById.get(tid)?.version)?.work);
  assert.ok(work?.route,'Annotated text must resolve to a canonical work: '+tid);
}
// Every generated Japanese page that carries a kanbun reader, including
// collection pages that repeat a poem (e.g. september-2026).
const routes = new Map();
for (const dir of (await readdir('ja/poetry',{withFileTypes:true})).filter(d=>d.isDirectory())) {
  const html = await readFile(path.join('ja/poetry',dir.name,'index.html'),'utf8').catch(()=>'');
  const tids = [...html.matchAll(/data-poetry-kanbun-viewer="([^"]+)"/g)].map(m=>m[1]);
  if (tids.length) routes.set('/ja/poetry/'+dir.name+'/',tids);
}
const covered = new Set([...routes.values()].flat());
assert.deepEqual([...covered].sort(),Object.keys(data).sort(),'every annotated text has a reader page');
const WIDTHS = [1280,1024,768,430,390,360,320];
// Pinned layouts: [tid, width, expected bands as body-column counts].
const PINNED = [['huanxisha-20261020-text',390,[3,3]]];
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
const layouts = {};
let frames=0, wrapped=0;
const browser=await chromium.launch();
try{
  for(const width of WIDTHS){
    const page=await browser.newPage({viewport:{width,height:900}});
    for(const [route,tids] of routes){
      await page.goto(base+route+'?layout=vertical&kunten=on',{waitUntil:'load'});
      for(const tid of tids){
        const stage=page.locator('[data-poetry-kanbun-viewer="'+tid+'"]');
        await stage.locator('iframe').waitFor({state:'visible',timeout:11000});
        await page.waitForFunction(id=>document.querySelector(
          '[data-poetry-kanbun-viewer="'+id+'"]')?.dataset.kanbunReady==='true',tid,{timeout:9000});
        const bands=await stage.locator('iframe').contentFrame().locator('#kanbun-display').evaluate(el=>
          [...el.querySelectorAll('.kanbun-band')].map(b=>({
            body:[...b.children].filter(c=>c.dataset.kanbunColumn==='body').length,
            stanzas:[...new Set([...b.children].filter(c=>c.dataset.kanbunColumn==='body').map(c=>c.dataset.kanbunStanza))]})));
        const where=tid+' at '+width+'px: '+JSON.stringify(bands.map(b=>b.body));
        assert.ok(bands.length>0,where+' has no band');
        if(bands.length>1){
          wrapped++;
          bands.forEach((b,i)=>assert.ok(b.body!==1,where+' band '+i+' holds a single column'));
        }
        layouts[route+' '+tid+'@'+width]=bands;
        frames++;
      }
    }
    await page.close();
  }
  for(const [tid,width,expected] of PINNED){
    const bands=Object.entries(layouts).find(([k])=>k.endsWith(' '+tid+'@'+width))[1];
    assert.deepEqual(bands.map(b=>b.body),expected,tid+' at '+width+'px bands');
    assert.deepEqual(bands.map(b=>b.stanzas),expected.map((_,i)=>[String(i)]),tid+' at '+width+'px: one stanza a band');
  }
  console.log('poetrykuntenbandcheck: '+frames+' kanbun readers on '+routes.size+' pages at '+WIDTHS.length+' widths ('
    +wrapped+' wrapped); no single-column band; 浣溪沙 390px splits at its stanza break PASS');
}finally{await browser.close();await new Promise(done=>server.close(done));}
