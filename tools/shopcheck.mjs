#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile} from 'node:fs/promises';
const base=process.env.SHOP_BASE||'http://127.0.0.1:19851';
const server=process.env.SHOP_BASE?null:spawn('python3',['-m','http.server','19851','--bind','127.0.0.1'],{stdio:'ignore'});
for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const state=()=>page.evaluate(()=>window.poetryShop.snapshot());
const add=index=>page.locator('.product-card .add-button').nth(index).click();
const bag=()=>page.locator('#open-bag').click();
const close=id=>page.locator(`[data-close="${id}"]`).first().click();
try{
 await page.goto(base+'/poetry-voucher/shop.html?lang=en');await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);
 await page.screenshot({path:'/tmp/voucher-shop-desktop.png'});
 await add(0);await add(0);await add(1);assert.equal((await state()).bag.length,2);assert.equal((await state()).bag[0].quantity,2);
 await bag();await page.locator('.bag-line').first().getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#font').selectOption('site');await close('product-editor');await close('bag-dialog');
 await add(2);assert.equal((await state()).bag.length,3);assert.equal((await state()).bag[0].quantity,2);assert.equal((await state()).bag[0].font,'bitmap');
 await page.locator('.product-card').first().getByRole('button',{name:'Read & choose'}).click();await page.locator('#font').selectOption('site');await page.locator('#language').selectOption('en');await page.locator('#save-line').click();assert.equal((await state()).bag.length,4);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);assert.equal((await state()).bag.length,4);
 const before=await state();await page.locator('[data-locale="zh-Hans"]').click();assert.deepEqual((await state()).bag,before.bag);await page.locator('[data-locale="en"]').click();
 await bag();await page.locator('.bag-line input[type=number]').first().fill('3');await page.locator('.bag-line input[type=number]').first().press('Tab');assert.equal((await state()).bag[0].quantity,3);
 await page.screenshot({path:'/tmp/voucher-shop-bag.png'});
 await page.locator('#to-checkout').click();await page.locator('#place-order').evaluate(button=>{button.click();button.click();});await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,{},{timeout:30000});
 let order=(await state()).orders[0];assert.equal(order.units,6);assert.equal((await state()).bag.length,0);assert.equal(order.total,order.items.reduce((sum,x)=>sum+x.quantity*x.unitPrice,0));
 assert.equal(await page.locator('.voucher-proof').count(),6);assert.equal(await page.locator('.receipt-proof').count(),1);assert.equal(await page.locator('.completed-order').count(),1);
 const downloadPromise=page.waitForEvent('download');await page.locator('.order-record a').first().click();const download=await downloadPromise;const pdfBytes=await readFile(await download.path());const pdfText=pdfBytes.toString('latin1');assert.equal(pdfText.slice(0,8),'%PDF-1.4');assert(Number(pdfText.match(/\/Count (\d+)/)[1])>=7);assert(pdfBytes.length>10000);
 await page.screenshot({path:'/tmp/voucher-shop-order.png'});
 assert(new URL(page.url()).pathname.endsWith('/order.html'));assert.equal(await page.locator('#shop-front').isVisible(),false);
 const purchasedRef=order.ref;await page.reload();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);assert.equal((await state()).orders[0].ref,purchasedRef);
 await page.locator('#keep-shopping').click();await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);
 // Custom text is transient by default, then explicitly opt-in persistent.
 await page.locator('#custom-work').click();await page.locator('#title').fill('A long private poem');await page.locator('#poem').fill('詩'.repeat(1750));await page.locator('#size').selectOption('36');await page.locator('#save-line').click();
 assert.equal((await state()).bag.length,1);let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('poetry-voucher-bag-v1')));assert.equal(saved.lines.length,0);
 await bag();await page.locator('#save-custom').check();saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('poetry-voucher-bag-v1')));assert.equal(saved.lines.length,1);await close('bag-dialog');await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);assert.equal((await state()).bag.length,1);
 await bag();await page.locator('#save-custom').uncheck();await page.locator('#to-checkout').click();await page.locator('#place-order').click();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,{},{timeout:30000});assert.equal((await state()).orders[0].lines[0].title,'A long private poem');assert(await page.locator('.voucher-proof img').count()>1,'long poem paginates');
 // A separate purchase has its own URL; the previous order remains available in this tab.
 const firstUrl=page.url(),firstRef=(await state()).orders[0].ref;
 await page.locator('#keep-shopping').click();await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);
 await add(1);await bag();await page.locator('#to-checkout').click();await page.locator('#place-order').click();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,{},{timeout:30000});assert.notEqual((await state()).orders[0].ref,firstRef);
 await page.goto(firstUrl);await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);assert.equal((await state()).orders[0].ref,firstRef);const oldDownload=page.waitForEvent('download');await page.locator('.order-record a').first().click();assert((await readFile(await (await oldDownload).path())).length>1000);
 await page.locator('#keep-shopping').click();await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);
 // Corrupt local storage cannot manufacture prices or inject text into HTML.
 await page.evaluate(()=>localStorage.setItem('poetry-voucher-bag-v1',JSON.stringify({version:1,lines:[{workId:'missing',quantity:1,font:'bitmap',size:24,locale:'en'}]})));await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);assert.equal((await state()).bag.length,0);
 // Every UI locale at phone and desktop widths; axe on shop and modal surfaces.
 for(const lang of ['en','zh-Hant','zh-Hans','ja','de','fr','ru']){
  await page.locator(`[data-locale="${lang}"]`).click();
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${lang} ${width} overflow`);assert(await page.locator('.colophon-number').evaluate(n=>n.scrollWidth<=n.clientWidth),'58 mm must stay on one line');}
 }
 await page.locator('[data-locale="en"]').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/voucher-shop-mobile.png'});
 for(const surface of ['shop','editor','bag','checkout']){
  if(surface==='editor')await page.locator('.product-card .text-button').first().click();
  if(surface==='bag'){await close('product-editor');await add(0);await bag();}
  if(surface==='checkout')await page.locator('#to-checkout').click();
  const result=await new AxeBuilder({page}).analyze();assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],surface+' accessibility');
 }
 const stressContext=await browser.newContext();const stress=await stressContext.newPage();await stress.goto(base+'/poetry-voucher/shop.html?lang=en');await stress.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);
 for(let i=0;i<23;i++)await stress.locator('.product-card .add-button').nth(i).click();await stress.locator('.product-card .add-button').first().click();await stress.locator('.product-card .add-button').first().click();assert.equal((await stress.evaluate(()=>poetryShop.snapshot())).bag.reduce((n,l)=>n+l.quantity,0),24);
 await stress.locator('#open-bag').click();await stress.locator('#to-checkout').click();
 await stress.evaluate(()=>{const real=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...args){HTMLCanvasElement.prototype.toBlob=real;callback(null);};});await stress.locator('#place-order').click();await stress.waitForFunction(()=>!poetryShop.snapshot().busy);assert.equal((await stress.evaluate(()=>poetryShop.snapshot())).orders.length,0);assert.equal((await stress.evaluate(()=>poetryShop.snapshot())).bag.length,23);
 await stress.locator('#place-order').click();await stress.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,{},{timeout:60000});assert.equal(await stress.locator('.voucher-proof').count(),24);assert.equal(new Set(await stress.locator('.voucher-proof>.micro').allTextContents()).size,24);await stressContext.close();
 assert.deepEqual(errors,[]);console.log('shopcheck: cart snapshots, variants, edit cancellation, quantity, persistence, custom-text opt-in, locale stability, exactly-once checkout, PDF pages, separate order URLs, reload and previous-order recovery, corrupt storage, 28 viewports and 4 axe surfaces OK');
}finally{await browser.close();server?.kill('SIGTERM');}
