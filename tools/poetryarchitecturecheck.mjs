#!/usr/bin/env node
// End-to-end migration checks on the actual readers, catalogue, basket and frozen-order renderer.
// All transactions are synthetic local test data. No payment or printer is contacted.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const port=21500+process.pid%5000,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const registry=JSON.parse(await readFile('content/poetry/works.json','utf8'));
const catalogue=JSON.parse(await readFile('content/poetry-voucher-app/editions.json','utf8'));
const legacy=JSON.parse(await readFile('tests/legacy-voucher-w12.json','utf8'));
const artifacts='/tmp/poetry-architecture-check';await mkdir(artifacts,{recursive:true});
for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch(),errors=[];
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  // Old fragments are not reallocated; the destination is the same work, version and locale.
  for(const locale of ['','zh/','zh-hans/','ja/','de/','fr/','ru/']){
    for(const [old,target] of [
      ['ci.html#w12','poetry/queqiaoxian-20181222/'],
      ['ci.html#a10','poetry/jia-yi/#a10'],
      ['ci.html#w8','poetry/manjianghong-2022/#sewn'],
      ['ci.html#w9','poetry/manjianghong-2022/#echo'],
      ['shi.html#drafts','poetry/roof/']
    ]){
      await page.goto(base+'/'+locale+old);
      await page.waitForURL(base+'/'+locale+target);
      assert.equal(await page.locator('h1').count(),1);
    }
    await page.goto(base+'/'+locale+'poetry/jia-yi/');
    assert.equal(await page.locator('.poetry-work-text').count(),17);
    assert.equal(await page.locator('.poetry-sequence-toc li').count(),17);
    assert(!/outside the cycle|集外/.test(await page.locator('#a10').innerText()));
  }
  await page.goto(base+'/zh/poetry/manjianghong-2022/#echo');
  await page.locator('.page-languages a[hreflang="en-GB"]').click();
  await page.waitForURL(base+'/poetry/manjianghong-2022/#echo');
  await page.goto(base+'/zh/poetry/jia-yi/#a10');
  await page.locator('.page-languages a[hreflang="fr"]').click();
  await page.waitForURL(base+'/fr/poetry/jia-yi/#a10');
  console.log('35 legacy redirects, seventeen members in seven languages, and same-version language switching passed.');

  for(const route of ['zh/poetry/','poetry/','zh/poetry/queqiaoxian-20181222/','fr/poetry/jia-yi/','zh/poetry/roof/','poetry/manjianghong-2022/']){
    await page.goto(base+'/'+route);await page.evaluate(()=>document.fonts.ready);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' overflow '+width);
    }
    await page.setViewportSize({width:390,height:900});
    const audit=await new AxeBuilder({page}).analyze();
    assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],route);
  }
  await page.goto(base+'/zh/poetry/');await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:artifacts+'/catalogue-desktop.png',fullPage:true});
  await page.goto(base+'/zh/poetry/queqiaoxian-20181222/');await page.setViewportSize({width:390,height:900});
  await page.screenshot({path:artifacts+'/queqiaoxian-mobile.png',fullPage:true});

  const noJs=await browser.newContext({javaScriptEnabled:false}),fallback=await noJs.newPage();
  await fallback.goto(base+'/zh/ci.html#w12');
  assert.equal(await fallback.locator('#w12 a').getAttribute('href'),'/zh/poetry/queqiaoxian-20181222/');
  // Exercise the native link with page JavaScript disabled, using a verified visible hit target.
  await fallback.locator('#w12 a').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
  const hit=await fallback.locator('#w12 a').evaluate(e=>{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,inside:e.contains(document.elementFromPoint(x,y))};});
  assert(hit.inside);await fallback.mouse.click(hit.x,hit.y);
  await fallback.waitForURL(base+'/zh/poetry/queqiaoxian-20181222/');
  assert((await fallback.locator('.body').textContent()).includes('回身讓路'));
  await noJs.close();

  const ready=async()=>page.waitForFunction(count=>window.poetryShop&&document.querySelectorAll('.product-card').length===count,registry.works.length);
  const shop=async(query='')=>{await page.goto(base+'/poetry-voucher/shop.html?lang=en'+query);await ready();};
  const purchase=async()=>{
    await page.locator('#open-bag').click();await page.locator('#to-checkout').click();await page.locator('#place-order').click();
    await page.waitForURL(url=>url.pathname.endsWith('/order.html'),{timeout:60000});
    await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,null,{timeout:60000});
    return page.evaluate(()=>poetryShop.snapshot().orders[0]);
  };
  await page.setViewportSize({width:1440,height:1000});await shop();
  assert.equal(await page.locator('.product-card').count(),registry.works.length);
  assert.deepEqual((await page.locator('.product-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.work))).sort(),registry.works.map(w=>w.id).sort());
  assert.equal(await page.locator('.product-card[data-work="roof"]').count(),1);
  assert.equal(await page.locator('.product-card[data-work="roof"] .product-version option').count(),4);
  const variants=page.locator('.product-card[data-work="manjianghong-2022"]');
  assert.equal(await variants.locator('.product-version option').count(),2);
  const stableWorkTitle=await variants.locator('h3').textContent();
  await variants.locator('.product-version').selectOption('manjianghong-2022--echo');
  assert.equal(await variants.locator('h3').textContent(),stableWorkTitle);
  assert.deepEqual(await variants.locator('.product-version option').allTextContents(),['Sewn version','Another version']);
  await variants.locator('.text-button').click();
  assert.equal(await page.locator('#work').inputValue(),'manjianghong-2022--echo');
  assert((await page.locator('#poem').inputValue()).startsWith('漏盡鐘回'));
  assert.equal(new URL(await page.locator('#source-note a').getAttribute('href'),base).pathname,'/poetry/manjianghong-2022/');
  assert.equal(new URL(await page.locator('#source-note a').getAttribute('href'),base).hash,'#echo');
  await page.locator('[data-close="product-editor"]').click();
  await page.screenshot({path:artifacts+'/shop-desktop.png',fullPage:true});
  assert(!/\bW\d+\b|\bD\d+\.\d+\b/.test(await page.locator('#product-grid').innerText()));
  assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.map(v=>v.id),[]);

  // Saved, unpurchased selections migrate their identifiers, not the work or configuration.
  await page.evaluate(old=>localStorage.setItem('poetry-voucher-bag-v1',JSON.stringify({version:1,lines:[{
    id:'pre-migration-line',workId:old.id,title:old.title,author:old.author,poem:old.poem,
    font:'site',size:24,locale:'zh-Hant',translations:['en'],quantity:2
  }]})),legacy);
  await page.reload();await ready();const basket=await page.evaluate(()=>poetryShop.snapshot().bag);
  assert.equal(basket.length,1);assert.equal(basket[0].workId,'queqiaoxian-20181222');
  assert.equal(basket[0].poem,legacy.poem);assert.equal(basket[0].quantity,2);assert.deepEqual(basket[0].translations,['en']);
  await page.evaluate(()=>localStorage.removeItem('poetry-voucher-bag-v1'));
  await shop('&work=ci-w12');await page.waitForFunction(()=>document.querySelector('#product-editor').open);
  assert.equal(await page.locator('#work').inputValue(),'queqiaoxian-20181222');
  assert(!/W12/.test(await page.locator('#source-note').innerText()));
  await page.locator('#font').selectOption('site');await page.locator('#translation-options input[value=en]').check();
  await page.locator('#save-line').click();const current=await purchase();
  assert.equal(current.lines[0].work.id,'queqiaoxian-20181222');
  assert.equal(current.lines[0].work.source_id,'Queqiaoxian');
  assert.equal(current.lines[0].poem,legacy.poem);
  assert(!/\bW12\b/.test(await page.locator('.order-text-copy').innerText()));
  assert((await page.locator('.order-text-copy').innerText()).includes('poetry/queqiaoxian-20181222/'));

  // Freeze a real pre-migration catalogue snapshot with a different historical price.
  // Reopening must not consult the new work ID or silently charge today's tariff.
  const historical=await page.evaluate(async({old,current})=>{
    const q=quotePoem(old.poem,[{locale:'en',body:old.translations.en.body}],'site');
    const items=q.items.map(i=>({...i,quantity:1}));items[0].unitPrice-=20;items[0].amount-=20;
    const total=items.reduce((n,i)=>n+i.amount,0);
    const line={id:'old-w12-order-line',workId:old.id,work:old,title:old.title,author:old.author,poem:old.poem,
      locale:'zh-Hant',translations:['en'],font:'site',size:24,quantity:1,unitPrice:total,items};
    const order={ref:'261008123456',created:'2026-10-08T15:00:00.000Z',lines:[line],items,total,units:1,
      tariff:'historical-test-tariff',payment:automaticPayment(total,0,0),
      publication:{...current.publication,renderer:'pv-render-before-poetry-migration',textSnapshotSha256:await OrderReading.textHash([line])}};
    PoetryOrder.validate(order);sessionStorage.setItem('poetry-voucher-order-v1-'+order.ref,JSON.stringify(order));return order;
  },{old:legacy,current});
  await page.goto(base+'/poetry-voucher/order.html?lang=en&order='+historical.ref);
  await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1,null,{timeout:60000});
  const reopened=await page.evaluate(()=>poetryShop.snapshot().orders[0]);
  assert.deepEqual(reopened.lines,historical.lines);assert.equal(reopened.total,historical.total);
  assert.equal(reopened.lines[0].work.source_id,'W12');assert.notEqual(reopened.total,current.total);
  assert((await page.locator('.order-reading .verse').first().textContent())===legacy.poem);
  assert.match(await page.locator('.render-notice').textContent(),/Re-rendered/);
  await page.reload();await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);
  assert.deepEqual((await page.evaluate(()=>poetryShop.snapshot().orders[0])).lines,historical.lines);
  console.log('Old W12 basket resolves correctly; new receipts use work labels; frozen W12 text, identity and historical price survive reopening.');

  // The long summer poem uses the production pagination path, not the retired single-strip Studio.
  for(const [font,size,script] of [['bitmap',36,'zh-Hant'],['site',26,'zh-Hans']]){
    await shop('&work=summer-2017');await page.waitForFunction(()=>document.querySelector('#product-editor').open);
    assert.equal(await page.locator('#translation-options input:not(:disabled)').count(),0);
    await page.locator('#font').selectOption(font);await page.locator('#size').selectOption(String(size));await page.locator('#original-script').selectOption(script);
    await page.locator('#save-line').click();const long=await purchase();
    assert.equal(long.lines[0].work_id,undefined);assert.equal(long.lines[0].work.work_id,'summer-2017');
    assert.equal(long.lines[0].locale,script);assert.equal(long.lines[0].translations.length,0);
    const source=script==='zh-Hans'?catalogue.works.find(w=>w.work_id==='summer-2017').translations['zh-Hans'].body:catalogue.works.find(w=>w.work_id==='summer-2017').poem;
    assert.equal(long.lines[0].poem,source);assert.equal(await page.locator('.order-reading .verse').textContent(),source);
    const dimensions=await page.locator('.order-strip-proof img').evaluateAll(async nodes=>{const out=[];for(const n of nodes){const image=new Image();image.src=n.src;await image.decode();out.push({w:image.naturalWidth,h:image.naturalHeight});}return out;});
    assert(dimensions.length>=3&&dimensions.every(p=>p.w===384&&p.h>0&&p.h<=6000),JSON.stringify(dimensions));
    const pending=page.waitForEvent('download');await page.locator('.order-record a[data-shop="orderPdf"]').click();
    const pdf=await readFile(await (await pending).path());assert(pdf.toString('latin1',0,8)==='%PDF-1.4');
  }
  console.log('Both original scripts of the long summer work export at the largest supported size through identified, bounded production pages.');
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('poetryarchitecturecheck: canonical readers, no-JS aliases, grouping, 24 viewport cases, 7 axe scans, legacy basket/order preservation and new-edition exports passed.');
}finally{await browser.close();server.kill('SIGTERM');}
