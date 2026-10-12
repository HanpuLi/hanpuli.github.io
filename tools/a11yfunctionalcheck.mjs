#!/usr/bin/env node
// Regression coverage for text-only zoom and keyboard-operated reading tools.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {chromium} from '@playwright/test';

const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript',
  '.woff2':'font/woff2','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const paths=['/','/zh/','/zh-hans/','/ja/','/de/','/fr/','/ru/',
  '/poetry/','/poetry/jia-yi/','/zh/poetry/jia-yi/','/zh-hans/poetry/jia-yi/',
  '/ja/poetry/jia-yi/','/de/poetry/jia-yi/','/fr/poetry/jia-yi/',
  '/ru/poetry/jia-yi/','/poetry/roof-splits/',
  '/writing/trainspotting/','/about.html','/poetry-voucher/','/404.html'];
const modes=['default','dark','reading','text200','readingText200'];
const key='hanpuli.readingPreferences.v1';
const reading={large:true,spacing:true,measure:true,simple:true,contrast:true};
assert(!process.env.A11Y_MODE||modes.includes(process.env.A11Y_MODE),
  'Unknown A11Y_MODE');
assert(!process.env.A11Y_PATH||paths.includes(process.env.A11Y_PATH),
  'Unknown A11Y_PATH');
const server=createServer(async(req,res)=>{
  try {
    let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.endsWith('/'))pathname+='index.html';
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep))throw Error('Path outside test repository');
    const content=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
});
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try {
  browser=await chromium.launch({headless:true});
  let scanned=0, axeScanned=0;
  for(const mode of modes.filter(x=>!process.env.A11Y_MODE||process.env.A11Y_MODE===x)){
    const context=await browser.newContext({viewport:{width:320,height:844},
      colorScheme:mode==='dark'?'dark':'light',reducedMotion:'reduce'});
    if(mode==='reading'||mode==='readingText200'){
      await context.addInitScript(({key,reading})=>localStorage.setItem(key,JSON.stringify(reading)),{key,reading});
    }
    if(mode.includes('200')){
      // Apply text zoom on every document, including a late navigation. The
      // one-off post-load style assignment remains as a layout stress trigger.
      await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
        document.documentElement.style.fontSize='200%';
      },{once:true}));
    }
    const page=await context.newPage();
    for(const path of paths.filter(x=>!process.env.A11Y_PATH||process.env.A11Y_PATH===x)){
      await page.goto(origin+path,{waitUntil:'load'});
      if(mode==='text200'||mode==='readingText200'){
        await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
      }
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(80);
      const geometry=await page.evaluate(()=>({
        overflow:document.documentElement.scrollWidth-innerWidth,
        font:getComputedStyle(document.documentElement).fontSize,
        inlineFont:document.documentElement.style.fontSize,
        pathname:location.pathname,
        contrast:document.documentElement.hasAttribute('data-reading-contrast')
      }));
      if(geometry.overflow>1){
        const offenders=await page.evaluate(()=>({
          overflow:document.documentElement.scrollWidth-innerWidth,
          wider:[...document.querySelectorAll('body *')].filter(e=>getComputedStyle(e).display!=='none'&&e.scrollWidth>e.clientWidth+8&&e.clientWidth>0).slice(0,16).map(e=>({element:e.tagName.toLowerCase(),cls:String(e.className).slice(0,54),width:e.clientWidth,scroll:e.scrollWidth,left:Math.round(e.getBoundingClientRect().left)})),
          outside:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+2&&getComputedStyle(e).display!=='none'}).sort((a,b)=>b.getBoundingClientRect().right-a.getBoundingClientRect().right).slice(0,14).map(e=>({element:e.tagName.toLowerCase(),cls:String(e.className).slice(0,50),right:Math.round(e.getBoundingClientRect().right),text:(e.textContent||'').trim().slice(0,28)}))
        }));
        console.error('REFLOW_FAILURE',mode,path,JSON.stringify(offenders));
      }
      assert(geometry.overflow<=1,`${mode} ${path}: overflow ${geometry.overflow}px`);
      // Page-level overflow and axe do not detect overlapping non-interactive
      // text. The project ordinal must remain separate from its content when
      // the narrow grid is compressed by enlarged text.
      const overlappingProjects=await page.evaluate(()=>{
        const overlap=(a,b)=>{
          const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
          return Math.min(x.right,y.right)-Math.max(x.left,y.left)>1 &&
            Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1;
        };
        return [...document.querySelectorAll('.site-home .project')].filter(project=>{
          const index=project.querySelector('.project-index');
          const content=project.querySelector('.project-main');
          return index && content && overlap(index,content);
        }).map(project=>project.querySelector('.project-index').textContent.trim());
      });
      assert.deepEqual(overlappingProjects,[],
        `${mode} ${path}: project numbers overlap content: ${overlappingProjects.join(', ')}`);
      // The vertical poem title and verse must never cover one another or
      // escape the reading column. A document can have no page overflow while
      // a compressed flex row still overlaps non-interactive text.
      const poetryFaults=await page.evaluate(()=>{
        const faults=[];
        for(const composition of document.querySelectorAll('.poetry-composition[data-flow-active]')){
          const source=composition.closest('.poem-version.source');
          const heading=composition.querySelector('h2');
          const body=composition.querySelector('.body');
          if(!source||!heading||!body)continue;
          const frame=source.getBoundingClientRect(),h=heading.getBoundingClientRect(),b=body.getBoundingClientRect();
          const overlap=Math.min(h.right,b.right)-Math.max(h.left,b.left)>1 &&
            Math.min(h.bottom,b.bottom)-Math.max(h.top,b.top)>1;
          if(overlap||[h,b].some(r=>r.left<frame.left-1||r.right>frame.right+1)){
            faults.push({title:heading.textContent.slice(0,36),overlap});
          }
        }
        return faults;
      });
      assert.deepEqual(poetryFaults,[],`${mode} ${path}: poem title or verse clipped/overlapped`);
      if(mode.includes('200'))assert.equal(geometry.font,'32px',
        `${mode} ${path}: text zoom; observed ${JSON.stringify(geometry)}`);
      if(mode.startsWith('reading'))assert(geometry.contrast,`${mode} ${path}: settings not applied`);
      // Seven fully rendered A/B catalogues are expensive to audit five times
      // each. Inspect their geometry in every mode, and run axe in the default
      // and highest-stress variants; other page types get axe in every mode.
      const axeRequired=!path.endsWith('/poetry/jia-yi/') ||
        mode==='default' || mode==='readingText200';
      if(axeRequired){
        const result=await new AxeBuilder({page})
          .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']).analyze();
        assert.equal(result.violations.length,0,
          `${mode} ${path}: ${result.violations.map(v=>v.id+' ('+v.nodes.length+')').join(', ')}`);
        axeScanned++;
      }
      scanned++;
    }
    await context.close();
    console.log(`a11yfunctionalcheck: ${mode} complete (${scanned} reflow, ${axeScanned} axe so far)`);
  }
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.goto(origin,{waitUntil:'load'});
  const disclosure=page.locator('.reading-tools details');
  const summary=disclosure.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  assert(await disclosure.evaluate(e=>e.open),'Enter opens the disclosure');
  await page.locator('[data-reading-pref="sans"]').check();
  await page.locator('[data-reading-pref="dyslexia"]').check();
  assert.equal(await page.locator('[data-reading-pref="sans"]').isChecked(),false,'Font controls exclusive');
  await page.locator('[data-reading-pref="large"]').check();
  await page.locator('[data-reading-pref="contrast"]').check();
  await page.keyboard.press('Escape');
  assert.equal(await disclosure.evaluate(e=>e.open),false,'Escape closes disclosure');
  assert(await summary.evaluate(e=>e===document.activeElement),'Escape returns focus');
  await page.goto(origin+'/zh-hans/',{waitUntil:'load'});
  assert(await page.locator('html').getAttribute('data-reading-contrast')!==null,'Cross-language setting');
  assert(await page.locator('html').getAttribute('data-reading-dyslexia')!==null,'Font setting persists');
  await page.locator('.reading-tools summary').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-reading-reset]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.reading-tools details').evaluate(e=>e.open),false,
    'Disclosure closes when keyboard focus leaves');
  await page.locator('.reading-tools summary').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-reading-reset]').click();
  assert.equal(await page.locator('html').getAttribute('data-reading-contrast'),null,'Reset updates page');
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null,'Reset clears saved settings');

  // The open controls must remain usable at enlarged text sizes too, not just
  // the closed trigger (the main page geometry sweep sees a closed panel).
  await page.locator('.reading-tools details').evaluate(e=>{e.open=false;});
  await page.setViewportSize({width:320,height:844});
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await page.locator('.reading-tools summary').click();
  const panelBounds=await page.locator('.reading-panel').boundingBox();
  assert(panelBounds && panelBounds.x>=-1 && panelBounds.x+panelBounds.width<=321,
    'Expanded reading controls must fit within the zoomed phone viewport');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
    'Expanded reading controls must not cause horizontal scrolling');
  await context.close();
  console.log(`a11yfunctionalcheck: ${scanned} reflow cases and ${axeScanned} axe scans, keyboard and persistence passed`);
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
