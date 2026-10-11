#!/usr/bin/env node
// Regression coverage for text-only zoom and keyboard-operated reading tools.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import AxeBuilder from '@axe-core/playwright';
import {chromium} from '@playwright/test';

const port=19482, origin='http://127.0.0.1:'+port;
const paths=['/','/zh/','/zh-hans/','/ja/','/de/','/fr/','/ru/',
  '/poetry/','/poetry/jia-yi/','/poetry/roof-splits/',
  '/writing/trainspotting/','/about.html','/poetry-voucher/','/404.html'];
const modes=['default','dark','reading','text200','readingText200'];
const key='hanpuli.readingPreferences.v1';
const reading={large:true,spacing:true,measure:true,simple:true,contrast:true};
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try {
  let ready=false;
  for(let i=0;i<50;i++){
    try{if((await fetch(origin)).ok){ready=true;break;}}catch{}
    await sleep(100);
  }
  assert(ready,'Test HTTP server unavailable');
  browser=await chromium.launch({headless:true});
  let scanned=0;
  for(const mode of modes.filter(x=>!process.env.A11Y_MODE||process.env.A11Y_MODE===x)){
    const context=await browser.newContext({viewport:{width:320,height:844},
      colorScheme:mode==='dark'?'dark':'light',reducedMotion:'reduce'});
    if(mode==='reading'||mode==='readingText200'){
      await context.addInitScript(({key,reading})=>localStorage.setItem(key,JSON.stringify(reading)),{key,reading});
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
      if(mode.includes('200'))assert.equal(geometry.font,'32px',`${mode} ${path}: text zoom`);
      if(mode.startsWith('reading'))assert(geometry.contrast,`${mode} ${path}: settings not applied`);
      const result=await new AxeBuilder({page})
        .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']).analyze();
      assert.equal(result.violations.length,0,
        `${mode} ${path}: ${result.violations.map(v=>v.id+' ('+v.nodes.length+')').join(', ')}`);
      scanned++;
    }
    await context.close();
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
  await context.close();
  console.log(`a11yfunctionalcheck: ${scanned} axe and reflow cases, keyboard and persistence passed`);
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
