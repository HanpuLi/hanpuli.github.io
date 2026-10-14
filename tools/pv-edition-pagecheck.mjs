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
  if(lang==='en'){await page.locator('.collection-sample').first().waitFor({state:'visible',timeout:30000});assert(await page.locator('.collection-sample').first().evaluate(img=>img.naturalWidth===384),'collection tiles show a rendered voucher');
   assert(await page.locator('.collection-tile').first().evaluate(n=>n.getBoundingClientRect().top<innerHeight),'first collection visible on the first phone screen');}
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
  assert.equal(await page.locator('#translation-options input:checked').count(),0,`${lang}: no paid translation is preselected`);
  // Apple Store audit 2026-10-14: price directly under the title, each option shows its cost.
  const lead=await page.evaluate(()=>{const h=document.querySelector('#edition-product-title').getBoundingClientRect(),p=document.querySelector('#edition-from').getBoundingClientRect();return {gap:p.top-h.bottom,text:document.querySelector('#edition-from').textContent};});
  assert(lead.text.includes(await page.locator('#editor-price').innerText()),`${lang}: starting price under the title (${lead.text})`);
  assert(lead.gap>=0&&lead.gap<40,`${lang}: price sits directly under the title`);
  assert.equal(await page.locator('#translation-options .option-price').count(),5);
  assert.equal(await page.locator('.option-cards').count(),3,`${lang}: script, typeface and size are cards`);
  assert((await page.locator('#edition-summary').textContent()).length>0,`${lang}: purchase bar summarises the edition (shown from 561px)`);
  assert.equal(await page.locator('[data-shop="fictionalPrice"]').count(),0,`${lang}: no extra fiction label on the product page`);
  // Phone: the first choice is reachable without scrolling past the whole voucher.
  const firstChoice=await page.locator('label[for="original-script"]').evaluate(n=>n.getBoundingClientRect().top+scrollY);
  assert(firstChoice<=844+200,`${lang}: first choice within ~1 screen on a phone (${Math.round(firstChoice)})`);
  const clipped=await page.locator('#voucher-view .paper').evaluate(n=>n.getBoundingClientRect().height);
  await page.locator('#voucher-expand').click();
  assert.equal(await page.locator('#voucher-expand').getAttribute('aria-expanded'),'true');
  assert(await page.locator('#voucher-view .paper').evaluate((n,h)=>n.getBoundingClientRect().height>h+100,clipped),`${lang}: whole voucher expands in the page`);
  await page.locator('#voucher-expand').click();await page.evaluate(()=>scrollTo(0,0));
  assert(await page.locator('#edition-product-title').innerText());
  assert(await page.locator('#editor-price').innerText());
  // Audit 2026-10-14: the paper is visible on arrival, the page is not trapped in
  // an inner scroll box, the order of reading follows the layout, and there are
  // no stray sequence numbers on a single-step page.
  const first=await page.evaluate(()=>{const v=document.querySelector('#voucher-view').getBoundingClientRect(),bar=document.querySelector('.editor-actions').getBoundingClientRect();return {top:v.top,visible:Math.min(v.bottom,bar.top)-Math.max(v.top,0),scrollY};});
  assert.equal(first.scrollY,0);
  assert(first.visible>=200,`${lang}: poetry voucher visible on the first screen (${Math.round(first.visible)}px)`);
  const desk=await page.locator('#voucher-view').boundingBox();
  await page.mouse.move(desk.x+desk.width/2,Math.min(desk.y+desk.height/2,700));await page.mouse.wheel(0,400);
  await page.waitForFunction(()=>scrollY>0,{},{timeout:3000}).catch(()=>{});
  assert(await page.evaluate(()=>scrollY>0),`${lang}: wheel over the proof scrolls the page`);
  await page.evaluate(()=>scrollTo(0,0));
  assert(await page.evaluate(()=>!!(document.querySelector('.proof-area').compareDocumentPosition(document.querySelector('.controls'))&Node.DOCUMENT_POSITION_FOLLOWING)),'proof precedes choices in the DOM');
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#product-editor legend,#product-editor h2,#product-editor .eyebrow')].filter(n=>n.checkVisibility()&&/\b\d{2}\b/.test(n.textContent)).length),0,`${lang}: no step numbers on the product page`);
  assert.equal(new Set(await page.locator('.view-switch button').evaluateAll(bs=>bs.map(b=>Math.round(b.getBoundingClientRect().top)))).size,1,`${lang}: view buttons on one row`);
  assert((await page.title()).startsWith(await page.locator('#edition-product-title').innerText()),`${lang}: document title names the work`);
  for(const href of await page.locator('#ui-locale a').evaluateAll(as=>as.map(a=>a.getAttribute('href'))))assert.match(href,/[?&]work=/,`${lang}: language links keep the work`);
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${lang} ${width}: no horizontal overflow`);
   const geometry=await page.evaluate(()=>{const b=document.querySelector('#save-line').getBoundingClientRect();return {visible:b.top>=0&&b.bottom<=innerHeight+1,w:b.width,body:getComputedStyle(document.body).overflow};});
   assert(geometry.visible,`${lang} ${width}: fixed purchase action in viewport`);
   assert(geometry.w>=120,`${lang} ${width}: purchase action can be tapped`);
   assert.notEqual(geometry.body,'hidden',`${lang} ${width}: body must scroll`);
  }
  // Keyboard focus is never hidden behind the fixed purchase bar (WCAG 2.4.11).
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{scrollTo(0,0);document.activeElement?.blur();});
  for(let i=0;i<60&&!await page.evaluate(()=>!!document.activeElement?.closest('#translation-options'));i++)await page.keyboard.press('Tab');
  const obscured=await page.evaluate(()=>{const r=document.activeElement.getBoundingClientRect(),bar=document.querySelector('.editor-actions').getBoundingClientRect();return {inside:!!document.activeElement.closest('#translation-options'),bottom:r.bottom,bar:bar.top};});
  assert(obscured.inside,`${lang}: translations reachable by keyboard`);
  assert(obscured.bottom<=obscured.bar,`${lang}: focused translation clears the purchase bar (${obscured.bottom} > ${obscured.bar})`);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#translation-options').scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>scrollY>0),`${lang}: controls require normal page scroll`);
  const result=await new AxeBuilder({page}).analyze();
  assert.deepEqual(result.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)})),[],lang+' product axe');
  await page.locator('#save-line').click();
  await page.locator('#bag-dialog').waitFor({state:'visible',timeout:30000});
  assert.equal(new URL(page.url()).pathname,'/poetry-voucher/edition.html','adding opens the bag on the product page');
  await page.locator('.bag-thumb').waitFor({state:'visible',timeout:30000});
  assert(await page.locator('.bag-thumb').evaluate(img=>img.naturalWidth===384),'bag shows the rendered voucher');
  assert.equal(await page.locator('.bag-line dl.line-specs dt').count(),2,'bag lists original and type');
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
  await page.locator('#bag-dialog').waitFor({state:'visible',timeout:30000});
  assert.equal(new URL(page.url()).searchParams.has('edit'),false,'saved edit leaves edit mode');
  assert.equal(await page.locator('.bag-line').count(),1,'editing must not duplicate a selection');
  const saved=await page.evaluate(()=>poetryShop.snapshot().bag);
  assert.equal(saved[0].font,'site');
  assert.equal(saved[0].quantity,1);
  console.log(`${lang}: independent route, responsive paper, localised defaults, axe, persistent bag/edit OK`);
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 // The configured edition lives in the URL: shareable, reloadable, validated.
 await page.goto(base+'/poetry-voucher/edition.html?lang=en&work=jia-yi-b3-text&tr=ja,xx&type=site&size=26');
 await page.locator('#voucher-hero-image').waitFor({state:'visible'});
 assert.deepEqual(await page.evaluate(()=>[[...document.querySelectorAll('#translation-options input:checked')].map(i=>i.value),font.value,size.value]),[['ja'],'site','26'],'edition restored from URL');
 await page.locator('.advanced-type summary').click();await page.locator('#font-cards input[value="bitmap"]').check();
 let shared=new URL(page.url()).searchParams;
 assert.equal(await page.locator('#font').inputValue(),'bitmap');assert.equal(shared.get('type'),null);assert.equal(shared.get('size'),null);assert.equal(shared.get('tr'),'ja');
 await page.locator('#translation-options input[value="ja"]').uncheck();
 assert.equal(new URL(page.url()).searchParams.get('tr'),null,'default edition has a clean URL');
 await page.goto(base+'/poetry-voucher/shop.html?lang=en&work=jia-yi-b3-text');
 await page.waitForURL(/\/poetry-voucher\/edition\.html\?/);
 assert.equal(new URL(page.url()).searchParams.get('work'),'jia-yi-b3-text','old product URLs redirect');
 await page.goto(base+'/poetry-voucher/edition.html?lang=en&work=jia-yi-b3-text');
 await page.locator('#voucher-hero-image').waitFor({state:'visible'});
 // After adding, Continue browsing returns to the card that was chosen.
 await page.locator('#save-line').click();await page.locator('#bag-dialog').waitFor({state:'visible'});
 await page.locator('#bag-dialog [data-shop="continue"]').click();
 await page.waitForURL(/\/poetry-voucher\/shop\.html\?.*#work-choose-jia-yi-b3-text$/);
 await page.waitForFunction(()=>document.activeElement?.id==='work-choose-jia-yi-b3-text',{},{timeout:30000});
 assert(await page.evaluate(()=>{const r=document.activeElement.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'continue browsing restores the chosen card into view');
 assert.equal(await page.locator('#bag-dialog').isVisible(),false);
 await page.goto(base+'/poetry-voucher/edition.html?lang=en&work=jia-yi-b3-text');
 await page.locator('#voucher-hero-image').waitFor({state:'visible'});
 // Leaving a product returns to its shelf, focused on the card that was chosen.
 await page.locator('#edition-back').click();
 await page.waitForURL(/\/poetry-voucher\/shop\.html\?.*#work-choose-jia-yi-b3-text$/);
 await page.waitForFunction(()=>document.activeElement?.id==='work-choose-jia-yi-b3-text',{},{timeout:30000});
 assert(await page.evaluate(()=>{const r=document.activeElement.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'back link restores the chosen card into view');
 assert(new URL(page.url()).searchParams.get('collection'),'shelf is kept in the URL');
 await page.goBack();await page.locator('#voucher-hero-image').waitFor({state:'visible'});
 const initial=(await page.locator('#edition-product-title').innerText());
 await page.locator('[data-locale="fr"]').click();
 assert.equal(new URL(page.url()).searchParams.get('work'),'jia-yi-b3-text');
 assert.notEqual(await page.locator('#edition-product-title').innerText(),initial,'localised title switches without losing work');
 await page.locator('#save-line').click();
 await page.locator('#bag-dialog').waitFor({state:'visible'});
 await page.locator('#to-checkout').click();await page.locator('#place-order').click();
 await page.waitForURL(/\/poetry-voucher\/order\.html\?/,{timeout:40000});
 await page.waitForFunction(()=>window.poetryShop?.snapshot().orders.length===1);
 assert.equal(await page.locator('.order-lines li').count(),1,'order summary lists the edition');
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
   assert.equal(new URL(restricted.url()).pathname,'/poetry-voucher/edition.html');
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
