#!/usr/bin/env node
// Public product routes must be full documents, not dialogs over the catalogue.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const port=19893,base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<70;i++){try{if((await fetch(base)).ok)break;}catch{}await sleep(120);}
const browser=await chromium.launch();
const errors=[];
try{
 for(const lang of ['en','zh-Hant','zh-Hans','ja','de','fr','ru']){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:lang});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(lang+': '+e.message));
  await page.goto(`${base}/poetry-voucher/shop.html?lang=${lang}`);
  await page.locator('.collection-tile').first().click();
  const choose=page.locator('.product-card .choose-button').first();
  assert.equal(await choose.evaluate(n=>n.tagName),'A','product cards are real links (new tab, share)');
  assert.match(await choose.getAttribute('href'),/^edition\.html\?/);
  await choose.click();
  await page.waitForURL(/\/poetry-voucher\/edition\.html\?/);
  await page.locator('#voucher-hero-image').waitFor({state:'visible',timeout:30000});
  assert.equal(await page.locator('body').getAttribute('data-page'),'edition');
  assert.equal(await page.locator('main:visible').count(),1,'only one visible main landmark');
  assert.equal(await page.locator('#product-editor').evaluate(n=>n.tagName),'MAIN');
  assert.equal(await page.locator('#product-editor').evaluate(n=>n instanceof HTMLDialogElement),false);
  assert(await page.locator('#shop').isHidden());
  assert.equal(await page.locator('#pair-view').isHidden(),true,'single poem paper first');
  assert(await page.locator('#voucher-hero-image').evaluate(img=>img.naturalWidth>0));
  assert.equal(await page.locator('#original-script').inputValue(),lang==='zh-Hans'?'zh-Hans':'zh-Hant');
  assert.equal(await page.locator('#translation-options input:checked').count(),['en','ja','de','fr','ru'].includes(lang)?1:0);
  assert(await page.locator('#edition-product-title').innerText());
  assert(await page.locator('#editor-price').innerText());
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${lang} ${width}: no horizontal overflow`);
   const geometry=await page.evaluate(()=>{const b=document.querySelector('#save-line').getBoundingClientRect();return {visible:b.top>=0&&b.bottom<=innerHeight+1,w:b.width,body:getComputedStyle(document.body).overflow};});
   assert(geometry.visible,`${lang} ${width}: fixed purchase action in viewport`);
   assert(geometry.w>=120,`${lang} ${width}: purchase action can be tapped`);
   assert.notEqual(geometry.body,'hidden',`${lang} ${width}: body must scroll`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#translation-options').scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>scrollY>0),`${lang}: controls require normal page scroll`);
  const result=await new AxeBuilder({page}).analyze();
  assert.deepEqual(result.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)})),[],lang+' product axe');
  await page.locator('#save-line').click();
  await page.waitForURL(/\/poetry-voucher\/shop\.html\?/);
  await page.locator('#bag-dialog').waitFor({state:'visible',timeout:30000});
  assert(await page.locator('#bag-dialog').isVisible(),'selection returns with real bag review');
  assert.equal(await page.locator('#bag-count').textContent(),'1');
  await page.locator('.bag-line').getByRole('button',{name:/Edit|編輯|编辑|編集|Bearbeiten|Modifier|Изменить/}).click();
  await page.waitForURL(/\/poetry-voucher\/edition\.html\?/);
  assert.equal(await page.locator('main:visible').count(),1);
  assert.equal(await page.locator('#save-line').innerText(),({en:'Save changes','zh-Hant':'儲存更改','zh-Hans':'保存更改',ja:'変更を保存',de:'Änderungen speichern',fr:'Enregistrer',ru:'Сохранить'})[lang]??await page.locator('#save-line').innerText());
  const restoredCopy=await page.evaluate(()=>SHOP_COPY.restored);
  assert(!restoredCopy.includes(await page.locator('#shop-status').textContent()),'no restore toast when moving between pages in one tab');
  await page.reload();await page.locator('#voucher-hero-image').waitFor({state:'visible',timeout:30000});
  assert.equal(await page.locator('#save-line').innerText(),await page.evaluate(()=>SHOP_COPY.save[SHOP_LANGS.indexOf(uiLocale)]),'reload keeps edit mode');
  await page.locator('#open-bag').click();await page.locator('#bag-dialog .dialog-close').click();
  assert.equal(new URL(page.url()).pathname,'/poetry-voucher/edition.html','closing the bag keeps the product page');
  await page.locator('.advanced-type summary').click();
  await page.locator('#font').selectOption('site');
  await page.locator('#save-line').click();
  await page.waitForURL(/\/poetry-voucher\/shop\.html\?/);
  await page.locator('#bag-dialog').waitFor({state:'visible',timeout:30000});
  assert.equal(await page.locator('.bag-line').count(),1,'editing must not duplicate a selection');
  const saved=await page.evaluate(()=>poetryShop.snapshot().bag);
  assert.equal(saved[0].font,'site');
  assert.equal(saved[0].quantity,1);
  console.log(`${lang}: independent route, responsive paper, localised defaults, axe, persistent bag/edit OK`);
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 await page.goto(base+'/poetry-voucher/shop.html?lang=en&work=jia-yi-b3-text');
 await page.waitForURL(/\/poetry-voucher\/edition\.html\?/);
 assert.equal(new URL(page.url()).searchParams.get('work'),'jia-yi-b3-text','old product URLs redirect');
 await page.goto(base+'/poetry-voucher/edition.html?lang=en&work=jia-yi-b3-text');
 await page.locator('#voucher-hero-image').waitFor({state:'visible'});
 const initial=(await page.locator('#edition-product-title').innerText());
 await page.locator('[data-locale="fr"]').click();
 assert.equal(new URL(page.url()).searchParams.get('work'),'jia-yi-b3-text');
 assert.notEqual(await page.locator('#edition-product-title').innerText(),initial,'localised title switches without losing work');
 await page.locator('#save-line').click();
 await page.waitForURL(/\/poetry-voucher\/shop\.html\?/);
 await page.locator('#to-checkout').click();await page.locator('#place-order').click();
 await page.waitForURL(/\/poetry-voucher\/order\.html\?/,{timeout:40000});
 await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);
 const download=page.waitForEvent('download');await page.locator('.order-record [data-shop="orderPdf"]').click();
 assert((await readFile(await(await download).path())).toString('latin1').startsWith('%PDF-1.4'));
 console.log('Deep link, in-place locale selection, issued frozen PDF OK');
 await context.close();
 // A separate product document must preserve the bag when persistent storage
 // is unavailable. If all browser storage is disabled it must refuse navigation,
 // not silently lose a selected poem.
 for(const mode of ['local','both']){
  const blocked=await browser.newContext({viewport:{width:390,height:844}});
  await blocked.addInitScript(mode=>{
   const originalGet=Storage.prototype.getItem,originalSet=Storage.prototype.setItem;
   const deny=store=>store===window.localStorage||(mode==='both'&&store===window.sessionStorage);
   Storage.prototype.getItem=function(...args){if(deny(this))throw new DOMException('Storage restricted','SecurityError');return originalGet.apply(this,args);};
   Storage.prototype.setItem=function(...args){if(deny(this))throw new DOMException('Storage restricted','SecurityError');return originalSet.apply(this,args);};
  },mode);
  const restricted=await blocked.newPage();
  restricted.on('pageerror',e=>errors.push('blocked-'+mode+': '+e.message));
  await restricted.goto(base+'/poetry-voucher/edition.html?lang=en&work=jia-yi-a1-text');
  await restricted.locator('#voucher-hero-image').waitFor({state:'visible'});
  await restricted.locator('#save-line').click();
  if(mode==='local'){
   await restricted.waitForURL(url=>url.pathname.endsWith('/poetry-voucher/shop.html'));
   // The bag is restored once the catalogue has loaded; wait for that rather than racing it.
   await restricted.waitForFunction(()=>window.poetryShop?.snapshot().bag.length===1,{},{timeout:30000}).catch(()=>{});
   assert.equal((await restricted.evaluate(()=>poetryShop.snapshot())).bag.length,1,'session storage keeps bag');
   await restricted.locator('#bag-dialog').waitFor({state:'visible',timeout:30000});
   assert((await restricted.locator('#storage-note').innerText()).includes('tab'),'storage limitation disclosed');
  }else{
   assert.equal(new URL(restricted.url()).pathname,'/poetry-voucher/edition.html','refuse irreversible navigation without either storage');
   assert.equal((await restricted.evaluate(()=>poetryShop.snapshot())).bag.length,0,'no phantom order');
   assert((await restricted.locator('#shop-status').innerText()).includes('disabled'),'visible storage warning');
  }
  await blocked.close();
 }
 console.log('Blocked-localStorage and blocked-all-storage regression paths OK');
 assert.deepEqual(errors,[],'JavaScript errors');
}finally{await browser.close();server.kill();}
