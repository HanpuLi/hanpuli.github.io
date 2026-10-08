#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const source=JSON.parse(await readFile('content/summer-poem.json','utf8'));
const languages=JSON.parse(await readFile('content/languages.json','utf8'));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{
  try {
    let url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(url.endsWith('/'))url+='index.html';
    const file=path.resolve(root,'.'+url);
    if(!file.startsWith(root+path.sep))throw Error('outside test root');
    const bytes=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({reducedMotion:'reduce'});
const page=await context.newPage();
const screenshotDir=process.env.SUMMER_SCREENSHOTS;
if(screenshotDir)await mkdir(screenshotDir,{recursive:true});
let layouts=0,readers=0;
const route=id=>(id==='en'?'/':'/'+id+'/')+'poetry/summer-2017/';
try {
  for(const {id,html_lang} of languages){
    await page.goto(base+route(id));
    const article=page.locator('.summer-reading');
    assert.equal(await article.getAttribute('lang'),html_lang,id+' body language');
    const actual=await article.locator('.summer-question,.summer-stanza,.summer-coda-stanza').allTextContents();
    assert.deepEqual(actual,source.texts[id].split('\n\n'),id+' must render the whole target edition');
    assert.equal(await page.locator('h1').textContent(),actual[0]);
    assert.equal(actual[6],actual[13]);assert.equal(actual.at(-1).split('\n').length,2);
    assert.equal(await article.locator('.summer-half').count(),2);
    if(!['zh','zh-hans'].includes(id)){
      assert.notEqual(source.texts[id],source.texts.zh,'Chinese is not a translation');
      assert.equal(await page.locator('.summer-original-link').getAttribute('href'),route('zh'));
    }
    for(const other of languages.filter(l=>l.id!==id)){
      assert.equal(await page.locator('.page-languages a[hreflang="'+other.html_lang+'"]').getAttribute('href'),route(other.id));
    }
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});await page.evaluate(()=>document.fonts.ready);
      assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)),id+' overflow at '+width);
      const sizes=await article.locator('.summer-question').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).fontSize));
      assert.equal(sizes[0],sizes[1],id+' unequal question type scale');layouts++;
    }
    readers++;
    if(screenshotDir&&['en','ja','fr','ru'].includes(id)){
      await page.setViewportSize({width:390,height:1000});await page.evaluate(()=>document.fonts.ready);
      await page.screenshot({path:path.join(screenshotDir,id+'-phone.png')});
      await page.setViewportSize({width:1440,height:1050});
      await page.screenshot({path:path.join(screenshotDir,id+'-desktop.png')});
    }
  }
  await page.goto(base+route('en'));await page.locator('.summer-original-link').click();
  await page.waitForURL(base+route('zh'));
  assert.equal(await page.locator('.summer-reading .summer-question').first().textContent(),source.texts.zh.split('\n\n')[0]);
  // The reading edition is static HTML, not a script-injected translation.
  const nojs=await browser.newContext({javaScriptEnabled:false});
  try {
    const reader=await nojs.newPage();
    for(const {id} of languages){
      await reader.goto(base+route(id));
      assert.deepEqual(await reader.locator('.summer-reading p').allTextContents(),source.texts[id].split('\n\n'));
    }
  } finally {await nojs.close();}
  console.log(JSON.stringify({readers,layouts,noJavaScriptReaders:languages.length,translatedBodies:5,originalScripts:2,matchedRefrains:7,finalBreaks:7,sourceAndLanguageLinks:'passed'}));
} finally {await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
