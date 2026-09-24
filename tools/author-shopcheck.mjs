#!/usr/bin/env node
// Author-only publication, accessible exports and historical-order compatibility.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base=process.env.SHOP_BASE||'http://127.0.0.1:19853';
const artifacts=process.env.PV_ARTIFACT_DIR||'/tmp/poetry-voucher-author-check';
await mkdir(artifacts,{recursive:true});
const server=process.env.SHOP_BASE?null:spawn('python3',['-m','http.server','19853','--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
const results=[];
try{
  for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const loaded=()=>page.waitForFunction(()=>window.poetryShop&&document.querySelectorAll('.product-card').length===23);
  const purchase=async()=>{await page.locator('#open-bag').click();await page.locator('#to-checkout').click();await page.locator('#place-order').click();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,{},{timeout:60000});};
  const file=async(selector,name)=>{const pending=page.waitForEvent('download');await page.locator(selector).click();const downloaded=await pending;const path=join(artifacts,name);await downloaded.saveAs(path);return readFile(path);};
  for(const lang of ['en','zh-Hant','zh-Hans','ja','de','fr','ru']){
    await page.goto(base+'/poetry-voucher/make.html?lang='+lang+'&work=custom');await loaded();
    assert.equal(new URL(page.url()).pathname,'/poetry-voucher/shop.html');
    assert.equal(new URL(page.url()).searchParams.get('lang'),lang);
    assert.equal(await page.locator('#custom-work').count(),0);assert.equal(await page.locator('#work option[value=custom]').count(),0);
  }
  results.push('Seven public Studio URLs redirect to the same-language author shop; no custom option.');
  await page.goto(base+'/poetry-voucher/shop.html?lang=en&work=custom');await loaded();assert.equal(await page.locator('#product-editor').isVisible(),false);
  await page.goto(base+'/poetry-voucher/shop.html?lang=en&work=ci-b3');await loaded();await page.waitForFunction(()=>document.querySelector('#product-editor').open);
  for(const id of ['title','author','poem'])assert(await page.locator('#'+id).evaluate(element=>element.readOnly));
  // A manipulated form is rejected even when readonly is bypassed with script.
  await page.locator('#poem').evaluate(element=>{element.value='Not the author poem';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#save-line').click();assert.equal((await page.evaluate(()=>poetryShop.snapshot())).bag.length,0);
  await page.goto(base+'/poetry-voucher/shop.html?lang=en&work=ci-b3');await loaded();await page.waitForFunction(()=>document.querySelector('#product-editor').open);
  await page.locator('#font').selectOption('site');await page.locator('#translation-options input[value=en]').check();await page.locator('#save-line').click();await purchase();
  const order=await page.evaluate(()=>poetryShop.snapshot().orders[0]),orderUrl=page.url();
  assert.equal(order.total,697);assert.equal(order.lines[0].work.source_id,'B3');
  assert.match(order.publication.textSnapshotSha256,/^[a-f0-9]{64}$/);assert.match(order.publication.renderer,/^pv-render-[a-f0-9]{16}$/);
  const pdf=await file('.order-record a[data-shop=orderPdf]','b3-order.pdf');
  const html=await file('.order-record a[data-shop=textDownload]','b3-reading.html');
  const markup=html.toString();assert(markup.includes('NOT PROOF OF PURCHASE'));assert(markup.includes('NO PAYMENT PROCESSED'));assert(markup.includes('VAT SUMMARY'));assert(markup.includes('QTY'));assert(markup.includes('6.97'));assert(markup.includes(order.lines[0].poem));assert(markup.includes(order.lines[0].work.translations.en.body));assert(markup.includes('B3-'+order.ref+'-01'));assert(!/<script\b/i.test(markup));
  const saved=await context.newPage();let networkRequests=0;
  await saved.route('**/*',route=>{networkRequests++;return route.abort();});
  await saved.setContent(markup);assert.equal(await saved.locator('.order-reading .verse').count(),2);assert.equal(networkRequests,0);
  await saved.setViewportSize({width:390,height:844});assert(await saved.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const a11y=await new AxeBuilder({page:saved}).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  await saved.screenshot({path:join(artifacts,'reading-mobile.png')});await saved.close();
  await page.reload();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);
  const reopened=await file('.order-record a[data-shop=orderPdf]','b3-reopened.pdf');assert.equal(createHash('sha256').update(pdf).digest('hex'),createHash('sha256').update(reopened).digest('hex'));
  results.push('B3 site type + English remains GBP 6.97; complete offline HTML and same-build PDF recovery pass.');
  // A changed manifest must be visible; the saved content and charges remain frozen.
  await page.evaluate(ref=>{const key='poetry-voucher-order-v1-'+ref,order=JSON.parse(sessionStorage.getItem(key));order.publication.renderer='pv-render-test-older';sessionStorage.setItem(key,JSON.stringify(order));},order.ref);
  await page.reload();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);
  assert.match(await page.locator('.render-notice').textContent(),/Re-rendered/);
  const rerendered=await page.evaluate(()=>poetryShop.snapshot().orders[0]);assert.deepEqual(rerendered.lines,order.lines);assert.equal(rerendered.total,order.total);
  results.push('Renderer change is disclosed without changing the saved poem, translation or price.');
  // Synthetic historical reader order: no claim that an actual visitor created it.
  const historical=await page.evaluate(original=>{
    const old=structuredClone(original);delete old.publication;delete old.receiptMetadata;old.ref='260924123456';old.created='2026-09-24T10:00:00.000Z';
    const poem='A <script>literal tag</script>\nA second line';const q=quotePoem(poem,[],'bitmap',true);
    const line={id:'historical-test-line',workId:null,work:null,title:'Reader <test>',author:'Test reader',poem,locale:'en',translations:[],font:'bitmap',size:24,quantity:1,unitPrice:q.price,items:q.items};
    old.lines=[line];old.items=q.items;old.total=q.price;old.units=1;old.payment=automaticPayment(old.total,0,0);
    sessionStorage.setItem('poetry-voucher-order-v1-'+old.ref,JSON.stringify(old));
    localStorage.setItem('poetry-voucher-bag-v1',JSON.stringify({version:1,saveCustom:true,lines:[line]}));return old;
  },order);
  await page.goto(base+'/poetry-voucher/order.html?lang=en&order='+historical.ref);await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);
  assert.match(await page.locator('.render-notice').textContent(),/did not record/);assert.equal(await page.locator('.order-reading .verse').textContent(),historical.lines[0].poem);assert.equal(await page.locator('.order-reading script').count(),0);
  const legacyHtml=(await file('.order-record a[data-shop=textDownload]','historical-reading-test.html')).toString();assert(legacyHtml.includes('READER EDITION'));assert(!legacyHtml.includes('You may save these files'));assert(legacyHtml.includes('&lt;script&gt;literal tag&lt;/script&gt;'));
  await page.goto(base+'/poetry-voucher/shop.html?lang=en');await loaded();assert.equal((await page.evaluate(()=>poetryShop.snapshot())).bag.length,0);
  const retained=await page.evaluate(()=>JSON.parse(localStorage.getItem('poetry-voucher-bag-v1')));assert.equal([...retained.lines,...(retained.retiredCustom||[])].find(line=>line.id==='historical-test-line').poem,historical.lines[0].poem);
  await page.reload();await loaded();assert.equal((await page.evaluate(()=>poetryShop.snapshot())).bag.length,0);
  results.push('Previously consented custom text is retained but not reissued; frozen historical reader orders remain readable and safely escaped.');
  await page.goto(base+'/poetry-voucher/shop.html?lang=en&work=ci-b6');await loaded();await page.waitForFunction(()=>document.querySelector('#product-editor').open);
  await page.locator('#size').selectOption('36');for(const lang of ['en','ja','de','fr','ru'])await page.locator(`#translation-options input[value=${lang}]`).check();await page.locator('#save-line').click();await purchase();
  const longOrder=await page.evaluate(()=>poetryShop.snapshot().orders[0]);assert.equal(longOrder.total,1694);const images=await page.locator('.voucher-proof img').evaluateAll(nodes=>nodes.map(n=>n.src));assert(images.length>=3);
  for(let index=0;index<images.length;index++)await writeFile(join(artifacts,'long-voucher-'+(index+1)+'.png'),Buffer.from(images[index].split(',')[1],'base64'));
  await file('.order-record a[data-shop=orderPdf]','long-order.pdf');
  await file('.order-record a[data-shop=textDownload]','long-reading.html');
  await writeFile(join(artifacts,'long-order-test.json'),JSON.stringify(longOrder,null,2));
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),String(width));}
  assert.equal(await page.locator('.order-reading .verse').count(),6);
  results.push('B6 five-translation edition remains GBP 16.94, produces identified multipage output and preserves all six text bodies.');
  const noJs=await browser.newContext({javaScriptEnabled:false}),fallback=await noJs.newPage();await fallback.goto(base+'/poetry-voucher/make.html');assert.equal(await fallback.locator('nav a').count(),7);assert.equal(await fallback.locator('textarea').count(),0);await noJs.close();
  assert.deepEqual(errors,[]);
  await writeFile(join(artifacts,'results.json'),JSON.stringify({passed:results,artifacts,visualReview:'required separately'},null,2));
  console.log(results.join('\n'));console.log('author-shopcheck: PASS; inspect the saved long-page images separately.');
}finally{await browser?.close();server?.kill('SIGTERM');}
