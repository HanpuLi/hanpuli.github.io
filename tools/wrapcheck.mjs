#!/usr/bin/env node
// Audit computed wrapping on every published HTML page, including all locales.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const files=execFileSync('git',['ls-files','-z','*.html',':!:templates/**'])
  .toString().split('\0').filter(Boolean);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=createServer(async(req,res)=>{
 try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep))throw Error('outside repository');
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
  res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const engineName=process.env.WRAP_ENGINE==='webkit'?'webkit':'chromium';
const engine=engineName==='webkit'?webkit:chromium;
let browser;
const failures=[],counts={wrap:0,balance:0,preLine:0,other:0};
try{
 browser=await engine.launch();
 // Generated pages are complete without scripts. Disable redirects so the
 // audit inspects each published document rather than its destination.
 const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,javaScriptEnabled:false});
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const file of files){
  const response=await page.goto(`${base}/${file}`,{waitUntil:'load'});
  if(response.status()!==200){failures.push({file,status:response.status()});continue;}
  const result=await page.evaluate(()=>{
   const samples=[...document.querySelectorAll('main *, .page-footer *')]
    .filter(el=>[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim().length>=20));
   return samples.map(el=>({
    tag:el.tagName,className:typeof el.className==='string'?el.className:'',
    text:el.textContent.trim().slice(0,60),wrap:getComputedStyle(el).textWrap,
    whiteSpace:getComputedStyle(el).whiteSpace,
   }));
  });
  for(const item of result){
   if(item.wrap==='pretty')failures.push({file,...item});
   if(item.className==='body'&&item.whiteSpace!=='pre-line')failures.push({file,...item,reason:'poem line breaks lost'});
   else if(item.wrap==='wrap')counts.wrap++;
   else if(item.wrap==='balance')counts.balance++;
   else counts.other++;
   if(item.whiteSpace==='pre-line')counts.preLine++;
  }
 }
 if(failures.length)console.error(JSON.stringify(failures.slice(0,8),null,2));
 assert.equal(failures.length,0,`${engineName}: published-text wrapping regression`);
 console.log(`wrapcheck: ${engineName}, ${files.length} public pages, ${counts.wrap} naturally wrapped text nodes, ${counts.balance} balanced display text, ${counts.preLine} explicit-line text nodes; no pretty wrapping in published text`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
