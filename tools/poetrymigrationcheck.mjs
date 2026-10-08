#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd(), fixtures=JSON.parse(await readFile('tools/fixtures/poetry-before-refactor.json','utf8'));
const library=JSON.parse(await readFile('content/poetry/library.json','utf8'));
const collectedWorks=new Set(library.collections.flatMap(collection=>collection.members));
const standaloneWorks=library.works.filter(work=>!collectedWorks.has(work.id) && work.layout!=='summer-mirror');
const catalogue=JSON.parse(await readFile('poetry-voucher/editions.json','utf8'));
const target='queqiaoxian-20181222-revised-202610';
const old=fixtures.legacy_catalogue_examples.find(w=>w.id==='ci-w12');
const current=catalogue.works.find(w=>w.id===target);
const screenshotDir=process.env.POETRY_SCREENSHOTS;
if(screenshotDir)await mkdir(screenshotDir,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('path');
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',acceptDownloads:true});
const page=await context.newPage();
const ready=async p=>{await p.waitForFunction(()=>!!window.poetryShop&&document.querySelectorAll('.product-card').length>0);};
const snapshot=async p=>p.evaluate(()=>poetryShop.snapshot());
const overflow=async p=>p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
let readers=0,redirects=0;
try{
  for(const locale of ['','zh','zh-hans','ja','de','fr','ru']){
    const prefix=locale?'/'+locale+'/':'/';
    await page.goto(base+prefix+'poetry/');
    assert.equal(await page.locator('.poetry-collection-list > li').count(),3);
    assert.equal(await page.locator('.poetry-catalogue-entry').count(),standaloneWorks.length);
    assert(!await overflow(page),prefix+'catalogue overflow');
    await page.goto(base+prefix+'poetry/queqiaoxian-20181222/');
    assert.equal(await page.locator('.poem-version.source .body').textContent(),locale==='zh-hans'?current.translations['zh-Hans'].body:current.poem);
    assert.equal(await page.locator('.poem-version.translation').count(),['zh','zh-hans'].includes(locale)?0:1);
    assert(!await overflow(page),prefix+'reader overflow');
    readers+=2;
    await page.goto(base+prefix+'ci.html#w12');
    await page.waitForURL(base+prefix+'poetry/queqiaoxian-20181222/');redirects++;
    await page.goto(base+prefix+'ci.html#a10');
    await page.waitForURL(base+prefix+'poetry/jia-yi/#jia-10');
    assert.equal(await page.locator('.reader-poem').count(),17);
    assert(!(await page.locator('#jia-10').textContent()).includes('集外'));redirects++;
    await page.goto(base+prefix+'shi.html#summer-archive-link-title');
    await page.waitForURL(base+prefix+'poetry/summer-2017/');redirects++;
    for(const legacyPage of ['ci','shi']){
      await page.goto(base+prefix+legacyPage+'.html#voucher-heading');
      await page.waitForURL(base+prefix+'poetry-voucher/');redirects++;
    }
  }
  await page.goto(base+'/zh/poetry/jia-yi/#jia-10');
  const english=page.locator('a[data-poetry-language][hreflang="en-GB"]');
  await english.click();await page.waitForURL(base+'/poetry/jia-yi/#jia-10');
  assert((await page.locator('#jia-10 .translation h2').textContent()).includes('A10'));
  await page.goto(base+'/shi.html#drafts');await page.waitForURL(base+'/poetry/roof-splits/');
  assert.equal(await page.locator('.poetry-version').count(),2);assert.equal(await page.locator('.reader-poem').count(),4);redirects++;
  await page.goto(base+'/poetry/manjianghong-2022/');
  assert.equal(await page.locator('.reader-poem').count(),2);
  assert.equal(await page.locator('.poetry-related a[href="/poetry/manjianghong-rereading-202610/"]').count(),1);
  assert.equal(await page.locator('#sewn').count(),1);assert.equal(await page.locator('#echo').count(),1);
  const nojs=await browser.newContext({javaScriptEnabled:false});const staticPage=await nojs.newPage();
  await staticPage.goto(base+'/zh/ci.html#w12');await staticPage.locator('#w12 a').press('Enter');await staticPage.waitForURL(base+'/zh/poetry/queqiaoxian-20181222/');
  assert.equal(await staticPage.locator('.poem-version.source .body').textContent(),current.poem);
  await staticPage.goto(base+'/zh/shi.html#summer-archive-link-title');
  assert.equal(await staticPage.locator('#summer-archive-link-title a').textContent(),'你有沒有想起一個夏天');
  await staticPage.locator('#summer-archive-link-title a').press('Enter');
  await staticPage.waitForURL(base+'/zh/poetry/summer-2017/');
  await nojs.close();
  if(screenshotDir){
    for(const [name,url,width,height] of [['index-desktop','/zh/poetry/',1440,1050],['index-mobile','/zh/poetry/',390,844],['reader-desktop','/poetry/queqiaoxian-20181222/',1440,1050],['reader-mobile','/zh/poetry/queqiaoxian-20181222/',390,844]]){
      await page.setViewportSize({width,height});await page.goto(base+url);await page.evaluate(()=>document.fonts.ready);
      await page.screenshot({path:path.join(screenshotDir,name+'.png'),fullPage:true});
    }
  }
  console.log('poetrymigrationcheck: catalogue/readers, seventeen-member cycle, two-version/two-part work, old routes and no-JS recovery passed.');
  // Legacy selection URLs and baskets use aliases. Stored issued orders do not.
  await page.goto(base+'/poetry-voucher/shop.html?lang=en&work=ci-w12');await ready(page);
  await page.waitForFunction(()=>document.querySelector('#product-editor').open);
  assert.equal(await page.locator('#work').inputValue(),target);
  assert.equal(new URL(await page.locator('#source-note a').getAttribute('href'),base).pathname,'/poetry/queqiaoxian-20181222/');
  await page.locator('[data-close="product-editor"]').click();
  for(const shelf of ['jia-yi','september-2026','roof-splits','individual']){
    await page.locator('#shop-filter').selectOption(shelf);
    assert.equal(await page.locator('.product-card').count(),catalogue.works.filter(w=>w.shelf===shelf).length);
  }
  await page.locator('#shop-filter').selectOption('all');
  assert(!/\bW\d+\b/.test(await page.locator('#product-grid').innerText()));
  await page.evaluate(old=>localStorage.setItem('poetry-voucher-bag-v1',JSON.stringify({version:1,lines:[{id:'old-selection',workId:old.id,title:old.title,author:old.author,poem:old.poem,locale:'zh-Hant',translations:['en'],font:'site',size:24,quantity:2}]})),old);
  await page.goto(base+'/poetry-voucher/shop.html?lang=en');await ready(page);
  const basket=(await snapshot(page)).bag;
  assert.equal(basket.length,1);assert.equal(basket[0].workId,target);assert.equal(basket[0].quantity,2);assert.equal(basket[0].poem,old.poem);
  assert.deepEqual(basket[0].translations,['en']);
  // The synthetic historic order uses the old W12 identity and unmodified snapshot.
  const historical=await page.evaluate(async old=>{
    const ref='261008112233',q=quotePoem(old.poem,[{locale:'en',body:old.translations.en.body}],'site',false);
    const items=q.items.map(i=>({...i,quantity:1,amount:i.unitPrice}));
    const line={id:'historic-line',workId:old.id,work:structuredClone(old),title:old.title,author:old.author,poem:old.poem,locale:'zh-Hant',translations:['en'],font:'site',size:24,quantity:1,unitPrice:q.price,items};
    const order={schema:2,id:'11111111-1111-4111-8111-111111111111',ref,created:'2026-10-08T10:00:00.000Z',locale:'en',lines:[line],items:structuredClone(items),units:1,total:q.price,tariff:TARIFF.version,payment:{method:'card',tender:q.price,change:0},receiptMetadata:receiptMeta(ref)};
    order.publication={schema:1,renderer:'pre-poetry-refactor-fixture',textSnapshotSha256:await OrderReading.textHash(order.lines)};
    PoetryOrder.validate(order);
    const serialized=JSON.stringify(order);sessionStorage.setItem('poetry-voucher-order-v1-'+order.id,serialized);
    return {order,serialized};
  },old);
  await page.goto(base+'/poetry-voucher/order.html?lang=en&order='+historical.order.id);
  await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,null,{timeout:45000});
  const reopened=(await snapshot(page)).orders[0];
  assert.equal(reopened.lines[0].work.source_id,'W12');assert.equal(reopened.lines[0].work.id,'ci-w12');
  assert.equal(reopened.lines[0].poem,old.poem);assert.equal(reopened.total,historical.order.total);
  assert.equal(reopened.publication.textSnapshotSha256,historical.order.publication.textSnapshotSha256);
  assert.equal(await page.evaluate(id=>sessionStorage.getItem('poetry-voucher-order-v1-'+id),historical.order.id),historical.serialized);
  assert((await page.locator('.receipt-transcript').textContent()).includes('W12'));
  assert((await page.locator('.order-reading').innerText()).includes('W12-'+historical.order.ref+'-01'));
  console.log('poetrymigrationcheck: old selection URL and basket migrated; historical order identity, text hash, amount and stored bytes unchanged.');
  // A genuinely new virtual checkout must freeze only the current edition labels.
  await page.evaluate(()=>localStorage.removeItem('poetry-voucher-bag-v1'));
  await page.goto(base+'/poetry-voucher/shop.html?lang=en&work='+target);await ready(page);
  await page.waitForFunction(()=>document.querySelector('#product-editor').open);
  await page.locator('#font').selectOption('site');
  await page.locator('#translation-options input[value="en"]').check();
  await page.locator('#save-line').click();await page.locator('#open-bag').click();
  await page.locator('#to-checkout').click();await page.locator('#place-order').click();
  await page.waitForURL(/\/poetry-voucher\/order\.html\?/, {timeout:45000});
  await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,null,{timeout:45000});
  const issued=(await snapshot(page)).orders[0],line=issued.lines[0];
  assert.equal(line.work.id,target);assert.equal(line.work.source_id,'QUEQIAOXIAN 2018');
  assert.equal(line.work.source_url,'https://hanpuli.github.io/poetry/queqiaoxian-20181222/');
  assert.equal(line.poem,old.poem);assert(!/\bW12\b/.test(await page.locator('.receipt-transcript').textContent()));
  assert((await page.locator('.order-reading').innerText()).includes(issued.ref+'-01'));
  assert.equal(issued.total,historical.order.total);
  if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'new-paper-edition.png'),fullPage:true});
  console.log(JSON.stringify({readers,redirects,legacyBasket:'canonicalised',historicOrder:'immutable',newReceipt:'no W counters',pricePreserved:true,physicalPrints:0}));
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
