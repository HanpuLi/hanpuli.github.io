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
 await page.locator('.product-card').first().getByRole('button',{name:'Read & choose'}).click();await page.locator('#font').selectOption('site');await page.locator('#original-script').selectOption('zh-Hans');await page.locator('#translation-options input[value="en"]').check();await page.locator('#translation-options input[value="ja"]').check();await page.locator('#save-line').click();assert.equal((await state()).bag.length,4);
 const selected=(await state()).bag.at(-1);assert.equal(selected.locale,'zh-Hans');assert.deepEqual(selected.translations,['en','ja']);assert.equal((await page.evaluate(line=>poetryShop.quote(line),selected)).items.filter(item=>item.id==='translation').length,2);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);assert.equal((await state()).bag.length,4);
 const before=await state();await page.locator('[data-locale="zh-Hans"]').click();assert.deepEqual((await state()).bag,before.bag);await page.locator('[data-locale="en"]').click();
 await bag();await page.locator('.bag-line input[type=number]').first().fill('3');await page.locator('.bag-line input[type=number]').first().press('Tab');assert.equal((await state()).bag[0].quantity,3);
 await page.screenshot({path:'/tmp/voucher-shop-bag.png'});
 await page.locator('#to-checkout').click();await page.locator('#place-order').evaluate(button=>{button.click();button.click();});await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,{},{timeout:30000});
 let order=(await state()).orders[0];assert.equal(order.units,6);assert.equal((await state()).bag.length,0);assert.equal(order.total,order.items.reduce((sum,x)=>sum+x.quantity*x.unitPrice,0));
 assert.equal(await page.locator('.order-strip-proof').count(),1);assert.equal(await page.locator('.voucher-proof').count(),0);assert.equal(await page.locator('.receipt-proof').count(),0);assert.equal(await page.locator('.completed-order').count(),1);
 const downloadPromise=page.waitForEvent('download');await page.locator('.order-record a').first().click();const download=await downloadPromise;const pdfBytes=await readFile(await download.path());const pdfText=pdfBytes.toString('latin1');assert.equal(pdfText.slice(0,8),'%PDF-1.4');assert(Number(pdfText.match(/\/Count (\d+)/)[1])>=7);assert(pdfBytes.length>10000);
 await page.screenshot({path:'/tmp/voucher-shop-order.png'});
 assert(new URL(page.url()).pathname.endsWith('/order.html'));assert.equal(await page.locator('#shop-front').isVisible(),false);
 const purchasedRef=order.ref;await page.reload();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);assert.equal((await state()).orders[0].ref,purchasedRef);
 await page.locator('#keep-shopping').click();await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);
 // Long authored work still exercises multipage output without reopening a custom editor.
 await page.goto(base+'/poetry-voucher/shop.html?lang=en&work=ci-b6');await page.waitForFunction(()=>document.querySelector('#product-editor').open);
 await page.locator('#size').selectOption('36');for(const lang of ['en','ja','de','fr','ru'])await page.locator(`#translation-options input[value="${lang}"]`).check();await page.locator('#save-line').click();
 await bag();await page.locator('#to-checkout').click();await page.locator('#place-order').click();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,{},{timeout:30000});assert.equal((await state()).orders[0].lines[0].workId,'ci-b6');assert(await page.locator('.order-strip-proof img').count()>2,'long authored edition remains one continuous output with separator');
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
 const multiContext=await browser.newContext(),multi=await multiContext.newPage();await multi.goto(base+'/poetry-voucher/shop.html?lang=en');await multi.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);
 await multi.locator('.product-card .text-button').first().click();const traditionalPrice=await multi.locator('#editor-price').textContent();await multi.locator('#original-script').selectOption('zh-Hans');assert.equal(await multi.locator('#editor-price').textContent(),traditionalPrice);assert.equal(await multi.locator('#poem').inputValue(),await multi.evaluate(()=>works[0].translations['zh-Hans'].body));for(const locale of ['en','ja','de','fr','ru'])await multi.locator(`#translation-options input[value="${locale}"]`).check();
 await multi.locator('#save-line').click();const multiLine=(await multi.evaluate(()=>poetryShop.snapshot())).bag[0];assert.equal(multiLine.locale,'zh-Hans');assert.equal(multiLine.translations.length,5);
 await multi.locator('#open-bag').click();await multi.locator('.bag-line').getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await multi.locator('#original-script').inputValue(),'zh-Hans');assert.equal(await multi.locator('#poem').inputValue(),await multi.evaluate(()=>works[0].translations['zh-Hans'].body));await multi.locator('#save-line').click();await multi.locator('#to-checkout').click();await multi.locator('#place-order').click();await multi.waitForFunction(()=>poetryShop.snapshot().orders.length===1,{},{timeout:30000});
 const multiOrder=(await multi.evaluate(()=>poetryShop.snapshot())).orders[0];assert.equal(multiOrder.lines[0].items.filter(item=>item.id==='translation').length,5);assert.equal(await multi.locator('.order-reading .verse').count(),6);assert(await multi.locator('.order-strip-proof img').count()>=3);await multiContext.close();
 const stressContext=await browser.newContext();const stress=await stressContext.newPage();await stress.goto(base+'/poetry-voucher/shop.html?lang=en');await stress.waitForFunction(()=>document.querySelectorAll('.product-card').length===23);
 for(let i=0;i<23;i++)await stress.locator('.product-card .add-button').nth(i).click();await stress.locator('.product-card .add-button').first().click();await stress.locator('.product-card .add-button').first().click();assert.equal((await stress.evaluate(()=>poetryShop.snapshot())).bag.reduce((n,l)=>n+l.quantity,0),24);
 await stress.locator('#open-bag').click();await stress.locator('#to-checkout').click();
 await stress.evaluate(()=>{const real=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...args){HTMLCanvasElement.prototype.toBlob=real;callback(null);};});await stress.locator('#place-order').click();await stress.waitForFunction(()=>!poetryShop.snapshot().busy);assert.equal((await stress.evaluate(()=>poetryShop.snapshot())).orders.length,0);assert.equal((await stress.evaluate(()=>poetryShop.snapshot())).bag.length,23);
 await stress.locator('#place-order').click();await stress.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,{},{timeout:60000});assert.equal(await stress.locator('.order-strip-proof').count(),1);assert.equal(await stress.locator('.voucher-proof').count(),0);await stressContext.close();
 assert.deepEqual(errors,[]);console.log('shopcheck: cart snapshots, variants, edit cancellation, quantity, persistence, author-only long editions, locale stability, exactly-once checkout, PDF pages, separate order URLs, reload and previous-order recovery, corrupt storage, 28 viewports and 4 axe surfaces OK');
}finally{await browser.close();server?.kill('SIGTERM');}
