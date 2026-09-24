#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
const htmlFiles=spawnSync('git',['ls-files','*.html'],{encoding:'utf8'}).stdout.trim().split('\n').filter(Boolean).filter(f=>!f.startsWith('templates/'));
const routes=htmlFiles.map(f=>f.endsWith('/index.html')?'/'+f.slice(0,-10):'/'+f).map(r=>r==='//'?'/':r);
const server=createServer(async(req,res)=>{
  try{
    let u=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(u.endsWith('/'))u+='index.html';
    const file=path.resolve(root,'.'+u);
    if(!file.startsWith(root+path.sep))throw Error('path');
    const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900}});
const unexpected=[], missing=[], summary=new Map();
const requiredFaces=[
 ['EB Garamond','About'],['Courier Prime','metadata'],['Cousine RU','Русский'],
 ['Shippori Common','繁日'],['Shippori Mincho','網站日本語'],['IMing Gap','喻'],
 ['Noto Serif SC Site','网站'],['Noto Serif SC Locale','简'],
 ['Site Serif Symbols','≈'],['Site Mono Symbols','Δ']
];
try{
 const probe=await context.newPage();await probe.goto(base+'/about.html');
 const faceResults=await probe.evaluate(async checks=>{const out=[];for(const [family,text] of checks){const faces=await document.fonts.load('16px "'+family+'"',text);out.push({family,text,count:faces.length,ready:document.fonts.check('16px "'+family+'"',text)});}return out;},requiredFaces);
 assert(faceResults.every(x=>x.count>0&&x.ready),'required webfont face failed to load: '+JSON.stringify(faceResults));
 await probe.close();
 for(const route of routes){
  const page=await context.newPage();
  const bad=[];
  page.on('response',r=>{if(r.status()>=400)bad.push([r.status(),r.url()]);});
  await page.goto(base+route,{waitUntil:'load'});
  await page.evaluate(async()=>{const style=document.createElement('style');style.textContent='*{content-visibility:visible !important}';document.head.append(style);await document.fonts.ready;});
  assert.deepEqual(bad,[],route+': missing resources');
  const targets=await page.evaluate(()=>{
    let i=0; const out=[];
    for(const el of document.querySelectorAll('body *')){
      if(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','PATH'].includes(el.tagName))continue;
      const text=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').replace(/\s+/g,' ').trim();
      if(!text||el.closest('.visually-hidden'))continue;
      const cs=getComputedStyle(el),r=el.getBoundingClientRect();
      if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0||r.width===0||r.height===0)continue;
      const id='fa-'+(++i);el.dataset.fontAudit=id;
      out.push({id,text:text.slice(0,180),family:cs.fontFamily,insideReading:!!el.closest('.reading-tools')});
    }
    return out;
  });
  const client=await context.newCDPSession(page);await client.send('DOM.enable');await client.send('CSS.enable');
  const doc=(await client.send('DOM.getDocument',{depth:-1,pierce:true})).root.nodeId;
  for(const t of targets){
    const result=await client.send('DOM.querySelector',{nodeId:doc,selector:'[data-font-audit="'+t.id+'"]'});
    if(!result.nodeId)continue;
    const {fonts}=await client.send('CSS.getPlatformFontsForNode',{nodeId:result.nodeId});
    if(!fonts.length){if(!t.insideReading)missing.push({route,...t});continue;}
    for(const f of fonts){
      const key=f.familyName+'|'+f.isCustomFont;
      summary.set(key,(summary.get(key)||0)+f.glyphCount);
      if(!f.isCustomFont && !t.insideReading && !/^system-ui|^-apple-system/.test(t.family)){
        unexpected.push({route,text:t.text,family:t.family,painted:f.familyName,glyphs:f.glyphCount});
      }
    }
  }
  await client.detach(); await page.close();
 }
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
console.log('fontcheck families:',JSON.stringify([...summary.entries()].sort((a,b)=>b[1]-a[1])));
if(missing.length)console.log('fontcheck: CDP returned no paint data for '+missing.length+' offscreen/direct-text probes; fallback assertions use only observed paint data.');
if(unexpected.length)console.error('Unexpected system fallback:',JSON.stringify(unexpected.slice(0,80),null,2));
assert.deepEqual(unexpected,[],'unexpected non-webfont fallback outside accessibility reading controls');
console.log('fontcheck: '+routes.length+' HTML documents; visible direct text uses only declared webfonts outside the intentional system-sans reading panel.');
