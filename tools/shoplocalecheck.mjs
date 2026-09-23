#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const copy=vm.runInNewContext(await readFile(new URL('../content/poetry-voucher-app/shop-copy.js',import.meta.url),'utf8')+';({SHOP_LANGS,SHOP_COPY})');
for(const [key,row] of Object.entries(copy.SHOP_COPY)){assert.equal(row.length,7,key);assert(row.every(value=>typeof value==='string'&&value.trim()),key);}
const html=await readFile(new URL('../templates/poetry-voucher-shop.html',import.meta.url),'utf8');
for(const match of html.matchAll(/data-shop(?:-placeholder)?="([^"]+)"/g))assert(copy.SHOP_COPY[match[1]],match[1]);
const base=process.env.SHOP_BASE||'http://127.0.0.1:19852';
const server=process.env.SHOP_BASE?null:spawn('python3',['-m','http.server','19852','--bind','127.0.0.1'],{stdio:'ignore'});
for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch(),errors=[];
try{
 for(const [index,lang] of copy.SHOP_LANGS.entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:lang==='zh-Hant'?'zh-TW':lang==='zh-Hans'?'zh-CN':lang});const page=await context.newPage();page.on('pageerror',e=>errors.push(lang+': '+e.message));
  await page.goto(base+'/poetry-voucher/shop.html?lang='+lang);await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);
  const expected=await page.evaluate(()=>{const w=works[0];return {title:w.translations?.[uiLocale]?.title||w.title,body:w.translations?.[uiLocale]?.body||w.poem};});
  await page.locator('.product-card .text-button').first().click();await page.locator('#shop-reading').evaluate(el=>el.open=true);assert.equal(await page.locator('#shop-reading-title').textContent(),expected.title);assert.equal(await page.locator('#shop-reading-text').textContent(),expected.body);
  await page.locator('#font').selectOption('site');await page.locator('#language').selectOption(lang==='zh-Hant'?'receipt':lang);await page.locator('#save-line').click();await page.locator('#open-bag').click();
  assert.equal(await page.locator('.bag-line h3').textContent(),expected.title);await page.locator('.bag-line input[type=number]').fill('2');await page.locator('.bag-line input[type=number]').press('Tab');
  await page.locator('#to-checkout').click();assert((await page.locator('#checkout-summary').textContent()).includes(expected.title));assert.equal(await page.locator('#place-order').textContent(),copy.SHOP_COPY.place[index]);
  const a11y=await new AxeBuilder({page}).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)})),[],lang+' checkout axe');
  await page.locator('#place-order').click();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,{},{timeout:30000});assert.equal(await page.locator('.order-record a').first().textContent(),copy.SHOP_COPY.orderPdf[index]);assert.equal(await page.locator('.voucher-proof figcaption').first().textContent(),expected.title);
  const snapshot=await page.evaluate(()=>poetryShop.snapshot().orders[0]),href=await page.locator('.order-record a').first().getAttribute('href');
  assert.equal(snapshot.lines[0].language,lang==='zh-Hant'?'receipt':lang);assert.equal(snapshot.units,2);
  const downloading=page.waitForEvent('download');await page.locator('.order-record a').first().click();const download=await downloading;const pdf=(await readFile(await download.path())).toString('latin1');assert(pdf.startsWith('%PDF-1.4'));assert(Number(pdf.match(/\/Count (\d+)/)[1])>=3);
  const nextIndex=(index+1)%7,next=copy.SHOP_LANGS[nextIndex];await page.locator(`[data-locale="${next}"]`).click();assert.deepEqual(await page.evaluate(()=>poetryShop.snapshot().orders[0]),snapshot);assert.equal(await page.locator('.order-record a').first().getAttribute('href'),href);assert.equal(await page.locator('.order-record a').first().textContent(),copy.SHOP_COPY.orderPdf[nextIndex]);
  await page.locator(`[data-locale="${lang}"]`).click();
  assert(new URL(page.url()).pathname.endsWith('/order.html'));assert.equal(await page.locator('#shop-front').isVisible(),false);
  const orderAudit=await new AxeBuilder({page}).analyze();assert.deepEqual(orderAudit.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)})),[],lang+' order axe');
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),lang+' completed order overflow '+width);}
  await page.reload();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);assert.equal((await page.evaluate(()=>poetryShop.snapshot().orders[0])).ref,snapshot.ref);
  await page.locator('#keep-shopping').click();await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);
  await page.locator('#custom-work').click();await page.locator('#save-line').click();assert.equal(await page.locator('#editor-status').textContent(),copy.SHOP_COPY.required[index]);await page.locator('[data-close="product-editor"]').click();
  console.log(lang+': full reading, paired selection, bag, checkout, real PDF download, order language switch and validation passed');await context.close();
 }
 const context=await browser.newContext({locale:'fr-FR'});const page=await context.newPage();await page.goto(base+'/poetry-voucher/shop.html');await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);assert.equal(await page.locator('html').getAttribute('data-ui-locale'),'fr');await context.close();
 assert.deepEqual(errors,[]);console.log('shoplocalecheck: all 7 complete purchase/download journeys, 14 checkout/order axe scans, 28 completed-order layouts, dictionary completeness and browser-language detection OK');
}finally{await browser.close();server?.kill('SIGTERM');}
