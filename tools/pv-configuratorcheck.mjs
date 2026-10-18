#!/usr/bin/env node
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const base='http://127.0.0.1:19864';
// The catalogue grows as paper editions are added; count it rather than pinning a number.
const catalogueSize=JSON.parse(await readFile(new URL('../poetry-voucher/editions.json',import.meta.url),'utf8')).works.length;
const server=spawn('python3',['-m','http.server','19864','--bind','127.0.0.1'],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(let n=0;n<40;n++){try{if((await fetch(base)).ok)break;}catch{}await sleep(150);}
const browser=await chromium.launch();
const issues=[];
try{
 for(const [lang,width] of [['en',390],['zh-Hant',1440],['fr',390]]){
  const context=await browser.newContext({viewport:{width,height:950},locale:lang==='zh-Hant'?'zh-TW':lang});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const failures=[];page.on('requestfailed',req=>failures.push(req.url()+' '+req.failure()?.errorText));
  let loaded=false;
  for(let attempt=0;attempt<3;attempt++){
   failures.length=0;errors.length=0;
   await page.goto(base+'/poetry-voucher/shop.html?lang='+lang);
   try{await page.waitForFunction(size=>window.poetryShop&&document.querySelectorAll('.product-card').length===size,catalogueSize,{timeout:8000});loaded=true;break;}
   catch(error){
    if(!failures.some(value=>value.startsWith(base+'/')))throw error;
    console.warn(lang+': retry after localhost resource failure '+failures.slice(0,2).join('; '));
    if(attempt===2)throw new Error('Scripts failed across 3 loads: '+failures.join('; '));
   }
  }
  assert(loaded,'all shop scripts loaded');
  assert.equal(await page.locator('.collection-tile').count(),4,'collection-first choice');
  assert(await page.locator('#product-grid').isHidden(),catalogueSize+' works should not overwhelm the first visit');
  assert(await page.locator('.shop-how').isVisible(),'payment/delivery explained before catalogue');
  assert(await page.locator('.studio-nav [data-order-link]').isHidden(),'no dead-end orders link before issuing a voucher');
  await page.locator('.collection-tile').first().click();
  assert(await page.locator('#product-grid').isVisible());
  assert(await page.locator('#current-collection').evaluate(el=>document.activeElement===el),'focus follows the chosen collection');
  const cardPrice=await page.locator('.product-card .product-price').first().textContent();
  await page.locator('.product-card .choose-button').first().click();
  await page.waitForURL(/\/poetry-voucher\/edition\.html\?/);
  assert(await page.locator('#product-editor').isVisible());
  assert.equal(await page.locator('#product-editor').evaluate(el=>el.tagName),'MAIN');
  assert(await page.locator('.advanced-type').evaluate(el=>!el.open),'technical settings collapsed');
  assert.equal(await page.locator('#original-script').inputValue(),'zh-Hant');
  assert.equal(await page.locator('#translation-options input:checked').count(),0,'no paid translation is preselected');
  await page.waitForFunction(()=>{const img=document.querySelector('#voucher-hero-image');return img&&!img.hidden&&img.naturalWidth>0;},{timeout:30000});
  assert(await page.locator('#voucher-view').isVisible(),'poem voucher leads the product page');assert(await page.locator('#voucher-hero-image').isVisible(),'true paper proof visible');
  const editorPrice=await page.locator('#editor-price').textContent();
  assert(cardPrice.includes(editorPrice),'catalogue starting price matches configured defaults');
  await page.locator('.advanced-type summary').click();
  await page.locator('#font').selectOption('site');
  await page.waitForFunction(()=>{const img=document.querySelector('#voucher-hero-image');return img&&!img.hidden&&img.naturalWidth>0;},{timeout:30000});
  if(lang==='en'){
    const a=await page.locator('#editor-price').textContent();
    await page.locator('#translation-options input[value="en"]').check();
    const b=await page.locator('#editor-price').textContent();
    assert.notEqual(a,b,'adding a translation changes the fictional price');
  }
  await page.screenshot({path:'/tmp/pv-config-'+lang+'.png'});
  await page.locator('#save-line').click();await page.locator('#bag-dialog').waitFor({state:'visible',timeout:30000});assert.equal(await page.locator('#bag-count').textContent(),'1');
  assert(await page.locator('#bag-dialog').isVisible(),'returning to a reviewed bag after adding');
  assert((await page.locator('.bag-footer').innerText()).includes(lang==='en'?'No money':'')||lang!=='en');
  await page.locator('#to-checkout').click();
  assert.equal(await page.locator('#checkout-dialog').isVisible(),true);
  await page.locator('#place-order').click();
  await page.waitForURL(/order\.html/,{timeout:40000});
  await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,{timeout:30000});
  assert(await page.locator('.studio-nav [data-order-link]').isVisible(),'the order link appears once an order exists in this tab');
  const payment=await page.locator('.order-record [data-order-field="payment"]').textContent();
  assert(payment.includes(lang==='en'?'No money charged':lang==='zh-Hant'?'未收取款項':'Aucun débit'),payment);
  const pending=page.waitForEvent('download');
  await page.locator('.order-record a').first().click();
  const result=await pending;
  assert((await readFile(await result.path())).toString('latin1').startsWith('%PDF-1.4'));
  assert.equal(errors.length,0,'page errors: '+errors.join('; '));
  await page.locator('#keep-shopping').click();
  await page.locator('#browse-all').click();assert.equal(await page.locator('.product-card:visible').count(),catalogueSize);
  await page.locator('#back-to-collections').click();assert(await page.locator('.collection-tile').first().isVisible());assert(await page.locator('.collection-tile').first().evaluate(el=>document.activeElement===el),'return focus to collection choices');
  await context.close();console.log(lang+': grouped catalogue, default edition, live proof, advanced typography, fictional purchase, PDF and collection return OK');
 }
}finally{await browser.close();server.kill();}
