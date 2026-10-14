#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const catalogue=JSON.parse(await readFile(new URL('../content/poetry-voucher-app/editions.json',import.meta.url),'utf8')).works;
const port=19851,base=process.env.SHOP_BASE||`http://127.0.0.1:${port}`;
const server=process.env.SHOP_BASE?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
for(let i=0;i<55;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,120));}
const browser=await chromium.launch(),errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
const state=(p=page)=>p.evaluate(()=>window.poetryShop.snapshot());
const add=async(id,{script=null,translations=null,font=null,size=null}={})=>{
 await page.goto(base+`/poetry-voucher/edition.html?lang=en&work=${encodeURIComponent(id)}`);
 await page.locator('#voucher-hero-image').waitFor({state:'visible',timeout:30000});
 if(script)await page.locator('#original-script').selectOption(script);
 if(translations!==null)for(const language of ['en','ja','de','fr','ru']){
  const input=page.locator(`#translation-options input[value=${language}]`);
  if(translations.includes(language))await input.check();else await input.uncheck();
 }
 if(font||size){await page.locator('.advanced-type summary').click();if(font)await page.locator('#font').selectOption(font);if(size)await page.locator('#size').selectOption(String(size));}
 await page.locator('#save-line').click();await page.waitForURL(/\/poetry-voucher\/shop\.html\?/,{timeout:30000});
 assert(await page.locator('#bag-dialog').isVisible());
 await page.locator('[data-close="bag-dialog"]').first().click();
};
const issue=async(p=page)=>{
 if(!(await p.locator('#bag-dialog').isVisible()))await p.locator('#open-bag').click();
 await p.locator('#to-checkout').click();
 await p.locator('#place-order').evaluate(button=>{button.click();button.click();});
 await p.waitForURL(/\/poetry-voucher\/order\.html\?/,{timeout:60000});
 await p.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,null,{timeout:60000});
};
try{
 await page.goto(base+'/poetry-voucher/shop.html?lang=en');
 await page.waitForFunction(n=>document.querySelectorAll('.product-card').length===n,catalogue.length);
 assert.equal(await page.locator('.collection-tile').count(),4);
 await add(catalogue[0].id);await add(catalogue[0].id);await add(catalogue[1].id);
 let bag=(await state()).bag;assert.equal(bag.length,2);assert.equal(bag[0].quantity,2);
 await page.locator('#open-bag').click();await page.locator('.bag-line').first().getByRole('button',{name:'Edit'}).click();
 await page.waitForURL(/\/poetry-voucher\/edition\.html\?/);
 await page.locator('.advanced-type summary').click();await page.locator('#font').selectOption('site');
 await page.locator('#edition-back').click();await page.waitForURL(/\/poetry-voucher\/shop\.html\?/);
 assert(await page.locator('#bag-dialog').isVisible());
 await page.locator('[data-close="bag-dialog"]').first().click();
 bag=(await state()).bag;assert.equal(bag[0].font,'bitmap');
 await add(catalogue[2].id);
 await add(catalogue[0].id,{script:'zh-Hans',font:'site',translations:['en','ja']});
 bag=(await state()).bag;assert.equal(bag.length,4);
 const variant=bag.find(item=>item.locale==='zh-Hans');assert.deepEqual(variant.translations,['en','ja']);assert.equal(variant.font,'site');
 const quote=await page.evaluate(line=>window.poetryShop.quote(line),variant);
 assert.equal(quote.items.filter(item=>item.id==='translation').length,2);
 await page.reload();await page.waitForFunction(()=>!!window.poetryShop);
 assert.equal((await state()).bag.length,4,'validated selections survive navigation');
 const before=(await state()).bag;
 await page.locator('[data-locale="zh-Hans"]').click();assert.deepEqual((await state()).bag,before);
 await page.locator('[data-locale="en"]').click();
 await page.locator('#open-bag').click();
 await page.locator('.bag-line input[type=number]').first().fill('3');
 await page.locator('.bag-line input[type=number]').first().press('Tab');
 assert.equal((await state()).bag[0].quantity,3);
 await issue(page);
 const first=(await state()).orders[0];assert.equal(first.units,6);assert.equal(first.total,first.items.reduce((s,item)=>s+item.quantity*item.unitPrice,0));
 assert.equal((await state()).bag.length,0);assert.equal(await page.locator('.order-strip-proof').count(),1);
 const down=page.waitForEvent('download');await page.locator('.order-record a').first().click();
 const pdf=(await readFile(await(await down).path())).toString('latin1');
 assert(pdf.startsWith('%PDF-1.4'));assert(Number(pdf.match(/\/Count (\d+)/)[1])>=7);
 const firstURL=page.url();await page.reload();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);assert.equal((await state()).orders[0].ref,first.ref);
 await add('jia-yi-b6-text',{translations:['en','ja','de','fr','ru'],size:36});
 await issue(page);assert.equal((await state()).orders[0].lines[0].workId,'jia-yi-b6-text');
 assert(await page.locator('.order-strip-proof img').count()>2,'multipage print remains one edition');
 await page.goto(firstURL);await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);
 assert.equal((await state()).orders[0].ref,first.ref,'first order survives second issue');
 await page.goto(base+'/poetry-voucher/shop.html?lang=en');
 await page.evaluate(()=>localStorage.setItem('poetry-voucher-bag-v1',JSON.stringify({version:1,lines:[{workId:'not-a-poem',quantity:1,font:'bitmap',size:24,locale:'en'}]})));
 await page.reload();await page.waitForFunction(()=>!!window.poetryShop);assert.equal((await state()).bag.length,0,'corrupt basket cannot inject an edition');
 for(const locale of ['en','zh-Hant','zh-Hans','ja','de','fr','ru']){
  await page.locator(`[data-locale="${locale}"]`).click();
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:960});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),locale+' '+width+' overflow');
  }
 }
 await page.locator('[data-locale="en"]').click();await page.setViewportSize({width:390,height:844});
 await page.locator('#browse-all').click();
 for(const surface of ['shop','bag','checkout']){
  if(surface==='bag'){await add(catalogue[0].id);await page.locator('#open-bag').click();}
  if(surface==='checkout')await page.locator('#to-checkout').click();
  const a11y=await new AxeBuilder({page}).analyze();
  assert.deepEqual(a11y.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],surface+' axe');
 }
 const stressContext=await browser.newContext(),stress=await stressContext.newPage();
 stress.on('pageerror',e=>errors.push('stress: '+e.message));
 for(let i=0;i<25;i++){
  const id=catalogue[i<23?i:0].id;
  await stress.goto(base+'/poetry-voucher/edition.html?lang=en&work='+encodeURIComponent(id));
  await stress.locator('#voucher-hero-image').waitFor({state:'visible'});
  await stress.locator('#save-line').click();
  if(i<24){await stress.waitForURL(/\/poetry-voucher\/shop\.html\?/);assert(await stress.locator('#bag-dialog').isVisible());}
 }
 assert.equal((await state(stress)).bag.reduce((s,item)=>s+item.quantity,0),24);
 assert.equal(await stress.locator('body').getAttribute('data-page'),'edition','25th voucher rejected on product page');
 await stress.locator('#edition-back').click();await stress.waitForURL(/\/poetry-voucher\/shop\.html\?/);
 await stress.locator('#open-bag').click();await stress.locator('#to-checkout').click();
 await stress.evaluate(()=>{const orig=HTMLCanvasElement.prototype.toDataURL;window.exportFailureInjected=false;HTMLCanvasElement.prototype.toDataURL=function(...args){HTMLCanvasElement.prototype.toDataURL=orig;window.exportFailureInjected=true;throw new Error('Injected checkout render failure')};});
 await stress.locator('#place-order').click();
 await stress.waitForFunction(()=>window.exportFailureInjected&&!poetryShop.snapshot().busy);
 assert.equal((await state(stress)).bag.reduce((s,item)=>s+item.quantity,0),24,'failed issue leaves basket intact');
 assert.equal(new URL(stress.url()).pathname,'/poetry-voucher/shop.html');
 await stress.locator('#place-order').click();await stress.waitForURL(/\/poetry-voucher\/order\.html\?/,{timeout:90000});
 await stress.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,null,{timeout:90000});
 assert.equal((await state(stress)).orders[0].units,24,'retry issues only once');
 await stressContext.close();
 assert.deepEqual(errors,[]);
 console.log('shopcheck: product-route cart merge, editing cancellation, quantity, persistence, locale stability, frozen orders, real PDF, historical URL, long editions, corrupt storage, 28 viewports, three axe surfaces, 24-unit limit, export failure and exactly-once retry OK');
}finally{await context.close();await browser.close();server?.kill('SIGTERM');}
