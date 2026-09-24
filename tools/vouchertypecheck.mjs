#!/usr/bin/env node
// Optical-size and tariff regression, no printing or private API calls.
import assert from 'node:assert/strict';
import {installStudioFixture} from './studio-test-fixture.mjs';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const BASIC_SPECIMEN=Object.freeze({
  workId:'ci-b3',
  created:'2026-09-22T12:00:00Z',
  entropy:Object.freeze([0x12,0x34,0x56,0x78]),
  font:'bitmap',
  size:24,
  locale:'zh-Hant',
  bilingual:false,
  method:'cash'
});
const port=19847,base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try{
  for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=process.env.PLAYWRIGHT_CDP_URL?await chromium.connectOverCDP(process.env.PLAYWRIGHT_CDP_URL):await chromium.launch();
  const context=browser.contexts()[0]||await browser.newContext();const page=await context.newPage();
  await installStudioFixture(page,base);
  await page.goto(base+'/poetry-voucher/make.html?lang=en');
  await page.locator('#full-pdf').waitFor({state:'visible'});
  const runtime=await page.evaluate(()=>({
    tariff:{...TARIFF},
    paper:{...PAPER_CONFIG},
    type:{bitmapSizes:[...TYPE_CONFIG.bitmapSizes],siteSizes:[...TYPE_CONFIG.siteSizes],defaultSize:TYPE_CONFIG.defaultSize},
    receipt:{currency:RECEIPT_CONFIG.currency,defaultWork:RECEIPT_CONFIG.defaultWork}
  }));
  assert.equal(BASIC_SPECIMEN.workId,runtime.receipt.defaultWork);
  assert.equal(await page.locator('#font').inputValue(),BASIC_SPECIMEN.font);
  assert.equal(await page.locator('#price').inputValue(),await page.evaluate(()=>priceText(quotePoem(currentWork().poem,'','bitmap').price)));
  for(const locale of ['en','zh-Hans','ja','de','fr','ru']){
    await page.locator('#language').selectOption(locale);
    const expected=await page.evaluate(locale=>{
      const translated=currentWork().translations[locale];
      return {title:translated.title,body:translated.body,price:priceText(quotePoem(currentWork().poem,translated.body,'bitmap',false,locale).price)};
    },locale);
    assert.equal(await page.locator('#price').inputValue(),expected.price);
    await page.locator('#generate').click();
    await page.locator('#full-pdf').waitFor({state:'visible'});
    assert.equal(await page.locator('#translation-section').getAttribute('lang'),locale);
    assert.equal(await page.locator('#translation-title').textContent(),expected.title);
    assert.equal(await page.locator('#translation').textContent(),expected.body);
    assert.equal(await page.locator('#translation-section').getAttribute('hidden'),null);
    assert.match(await page.locator('#receipt-image').getAttribute('src'),/^data:image\/png;base64,/);
  }
  await page.locator('#language').selectOption('receipt');
  assert.deepEqual(await page.locator('#ui-locale .language-short').allTextContents(),['EN','繁','简','日','DE','FR','RU']);
  assert.match(await page.locator('#proof-note').textContent(),/^\d{12} \/ /);
  const workIds=await page.evaluate(()=>works.map(w=>w.id)),rows=[];
  for(let start=0;start<workIds.length;start+=6){
    const ids=workIds.slice(start,start+6);
    const batch=await page.evaluate(async({specimen,ids})=>{
      const selected=ids.map(id=>works.find(w=>w.id===id)),sample=selected.map(w=>w.poem+Object.values(w.translations).map(text=>text.title+text.body).join('')).join('');
      const sampleDate=new Date(specimen.created),sampleRef=receiptReference(sampleDate,Uint8Array.from(specimen.entropy));
      await Promise.all([...new Set(Object.values(bitmapFaces))].map(f=>document.fonts.load(`${TYPE_CONFIG.defaultSize}px ${f}`,sample)));
      const summaries=[];
      for(const work of selected)for(const font of ['bitmap','site'])for(const size of [Math.max(...typeSizes(font))])for(const pairedLocale of [null,...Object.keys(work.translations)]){
        const paired=pairedLocale?work.translations[pairedLocale]:null,translation=paired?.body||'',q=quotePoem(work.poem,translation,font,false,pairedLocale||'en');
        const spec={work,original:true,font,size,locale:specimen.locale,title:work.title,author:work.author,poem:work.poem,translation,translationTitle:paired?.title||'',translationLocale:pairedLocale||'en',
          created:sampleDate,ref:sampleRef,...q,method:specimen.method};
        const rendered=render(spec),data=rendered.full.getContext('2d').getImageData(0,0,PAPER_CONFIG.printableDots,rendered.full.height).data;
        let binary=true;for(let i=0;i<data.length;i++){if(i%4===3?data[i]!==255:data[i]!==0&&data[i]!==255){binary=false;break;}}
        summaries.push({id:work.id,font,size,pairedLocale,height:rendered.full.height,binary,price:q.price,fee:q.items.filter(i=>i.id==='font').reduce((n,i)=>n+i.amount,0)});
      }
      return summaries;
    },{specimen:BASIC_SPECIMEN,ids});
    rows.push(...batch);
  }
  const expectedRenderCount=await page.evaluate(()=>works.length*2*(1+Object.keys(works[0].translations).length));
  assert.equal(rows.length,expectedRenderCount);
  assert(rows.every(r=>r.binary&&r.height+140<=runtime.paper.canvasMaxDots),JSON.stringify(rows.filter(r=>!r.binary||r.height+140>runtime.paper.canvasMaxDots)));
  assert(rows.every(r=>r.fee===(r.font==='site'?runtime.tariff.addOn:0)));
  for(const locale of ['en','zh-Hant','zh-Hans','ja','de','fr','ru']){
    await page.locator(`#ui-locale [data-locale="${locale}"]`).click();
    assert.equal(await page.locator('#ui-locale [aria-current="page"]').getAttribute('data-locale'),locale);
    assert.equal(await page.locator('#font').inputValue(),'bitmap');
    const labels=await page.locator('#font option').allTextContents();
    const expected=await page.evaluate(()=>[tr('點陣體 · 預設，已包含'),`${tr('網站字體')} · +${uiMoney(TARIFF.addOn)}`]);
    assert.deepEqual(labels,expected);
    await page.locator('#size').selectOption(String(runtime.type.bitmapSizes.at(-1)));await page.locator('#font').selectOption('site');
    assert.equal(await page.locator('#size').inputValue(),String(runtime.type.defaultSize));
    assert.equal(await page.locator('#price').inputValue(),await page.evaluate(()=>priceText(quotePoem(currentWork().poem,'','site').price)));
    assert.equal(await page.locator('#full-pdf').isVisible(),false);
    assert.equal(await page.locator('#price-breakdown').textContent(),await page.evaluate(()=>{
      const q=quotePoem(currentWork().poem,'','site');
      return q.items.map(item=>`${tr(item.label)} × 1 — ${uiMoney(item.amount)}`).join('');
    }));
    await page.locator('#size').selectOption(String(runtime.type.siteSizes[0]));await page.locator('#font').selectOption('bitmap');
    assert.equal(await page.locator('#size').inputValue(),String(runtime.type.defaultSize));
    assert.equal(await page.locator('#price').inputValue(),await page.evaluate(()=>priceText(quotePoem(currentWork().poem,'','bitmap').price)));
    assert.deepEqual(await page.locator('#size option').allTextContents(),runtime.type.bitmapSizes.map(String));
  }
  // Confirm the actual raster-font face, not merely a CSS family declaration.
  // These probes cover the seven supported language/script families.
  const samples={en:'Poetry voucher', 'zh-Hant':'點陣字體詩詞罷籬鸞疊',
    'zh-Hans':'点阵字体诗词简体龙门',ja:'詩の引換券 ひらがな カタカナ 漢字',
    de:'ÄÖÜäöüß Größe für Wörter',fr:'ÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸàâæçéèêëîïôœùûüÿ',
    ru:'Стихотворение Ёжик съел щуку ЙйЁёъыьэюя'};
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  {
    const {root}=await cdp.send('DOM.getDocument');
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#ui-locale [data-locale="zh-Hans"] .language-short'});
    const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    assert(fonts.length>0&&fonts.every(f=>f.isCustomFont&&/Noto Serif SC/.test(f.familyName)),'zh-Hans locale label fallback: '+JSON.stringify(fonts));
  }
  for(const [locale,text] of Object.entries(samples)){
    await page.locator(`#ui-locale [data-locale="${locale}"]`).click();
    const rendered=await page.evaluate(async({locale,text,specimen})=>{
      const family=bitmapFace(locale);
      await document.fonts.load(`${TYPE_CONFIG.defaultSize}px ${family}`,text);
      let probe=document.getElementById('font-audit');
      if(!probe){probe=document.createElement('span');probe.id='font-audit';document.body.append(probe);}
      probe.style.cssText='position:fixed;top:0;left:0;z-index:9999;background:white;color:black;font:'+TYPE_CONFIG.defaultSize+'px '+bitmapFamily(locale);
      probe.textContent=text;probe.getBoundingClientRect();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const sampleDate=new Date(specimen.created),sampleRef=receiptReference(sampleDate,Uint8Array.from(specimen.entropy));
      const image=font=>{const q=quotePoem(text,'',font,true);return render({work:null,original:false,font,size:TYPE_CONFIG.defaultSize,locale,
        title:text,author:'',poem:text,translation:'',ref:sampleRef,created:sampleDate,...q,method:specimen.method}).voucher.toDataURL();};
      return {family,different:image('bitmap')!==image('site'),pixelFee:quotePoem(text,'','bitmap',true).items.filter(i=>i.id==='font').length,
        siteFee:quotePoem(text,'','site',true).items.find(i=>i.id==='font').amount};
    },{locale,text,specimen:BASIC_SPECIMEN});
    const expectedFamily={'zh-Hant':'FusionPixelZhHK','zh-Hans':'FusionPixelZhHans',ja:'FusionPixelJa',en:'FusionPixelLatin',de:'FusionPixelLatin',fr:'FusionPixelLatin',ru:'FusionPixelLatin'}[locale];
    assert.deepEqual(rendered,{family:expectedFamily,different:true,pixelFee:0,siteFee:runtime.tariff.addOn});
    const {root}=await cdp.send('DOM.getDocument');
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#font-audit'});
    const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    const expectedFlavor={'zh-Hant':'zh-HK','zh-Hans':'zh-Hans',ja:'ja',en:'latin',de:'latin',fr:'latin',ru:'latin'}[locale];
    assert(fonts.length>0&&fonts.every(f=>f.isCustomFont&&f.familyName.includes(`Fusion Pixel 12px Mono ${expectedFlavor}`)),`${locale}: unexpected pixel-font fallback: ${JSON.stringify(fonts)}`);
  }
  await page.evaluate(()=>document.getElementById('font-audit').remove());await cdp.detach();
  // Purchased typography applies to metadata as well as the poem; inspect actual one-bit pixels.
  const metadata=await page.evaluate(()=>{
    const results=[];
    for(const font of ['bitmap','site']){
      const family=font==='bitmap'?bitmapFamily('en'):serif,weight=font==='bitmap'?400:600;
      const probe=w=>{const p=new Paper();p.text('NO. W3-02260923000001-01',24,family,true,32,false,w);return p.finish();};
      const image=probe(weight),data=image.getContext('2d').getImageData(0,0,image.width,image.height).data;
      const runs=[];let ink=0;for(let y=0;y<image.height;y++){let run=0;for(let x=0;x<=image.width;x++){if(x<image.width&&data[(y*image.width+x)*4]===0){run++;ink++;}else if(run){runs.push(run);run=0;}}}
      const normal=probe(400).getContext('2d').getImageData(0,0,image.width,image.height).data;let normalInk=0;for(let i=0;i<normal.length;i+=4)if(normal[i]===0)normalInk++;
      const work=works.find(w=>w.id==='ci-w3'),p=new Paper(),calls=[],text=p.text.bind(p);p.text=(...args)=>{calls.push(args);return text(...args);};
      renderVoucherBody(p,{...work,work,original:true,size:24,font},'W3-02260923000001-01',font==='bitmap'?bitmapFamily('zh-Hant'):serif,family);
      const labels=calls.filter(a=>/^(NO\. |POETRY VOUCHER|ART EDITION|NO CASH VALUE|hanpuli\.github)/.test(a[0]));
      results.push({font,ink,normalInk,minRun:Math.min(...runs),labels:labels.map(a=>({size:a[1],family:a[2],weight:a[6]})),authorFamily:calls.find(a=>a[0]==='Hanpu Li')[2],png:p.finish().toDataURL()});
    }
    return results;
  });
  for(const row of metadata){assert.equal(row.labels.length,5);assert(row.labels.every(label=>label.size===24));if(row.font==='bitmap'){assert(row.minRun>=2,'pixel metadata must have at least two-dot horizontal strokes');assert(row.labels.every(label=>label.family.startsWith('FusionPixel')));assert(row.authorFamily.startsWith('FusionPixel'));}else{assert(row.labels.every(label=>label.family.startsWith('EB')&&label.weight===600));assert(row.ink>row.normalInk,'website metadata must retain more ink than its regular-weight form');assert(row.authorFamily.startsWith('EB'));}await writeFile('/tmp/voucher-'+row.font+'-updated.png',Buffer.from(row.png.split(',')[1],'base64'));}
  console.log('Voucher metadata: purchased font throughout; 24-dot labels; two-dot bitmap strokes; heavier website labels verified. No printing.');
  // Sample assets are refreshed only by explicit authoring command, never by QA.
  if(process.argv.includes('--write-samples')){
    const samples=await page.evaluate(specimen=>{
      const work=works.find(w=>w.id===specimen.workId),translation=specimen.bilingual?work.translations.en.body:'',q=quotePoem(work.poem,translation,specimen.font);
      const sampleDate=new Date(specimen.created),sampleRef=receiptReference(sampleDate,Uint8Array.from(specimen.entropy));
      const r=render({work,original:true,font:specimen.font,size:specimen.size,locale:specimen.locale,title:work.title,author:work.author,poem:work.poem,translation,translationTitle:work.translations.en.title,translationLocale:'en',ref:sampleRef,created:sampleDate,...q,method:specimen.method});
      return {receipt:r.receipt.toDataURL(),voucher:r.voucher.toDataURL()};
    },BASIC_SPECIMEN);
    for(const [kind,data] of Object.entries(samples))await writeFile(`poetry-voucher/sample-${kind}.png`,Buffer.from(data.split(',')[1],'base64'));
  }
  console.log(JSON.stringify({renders:rows.length,maxRows:Math.max(...rows.map(r=>r.height)),locales:7,actualPixelFontScripts:7,customRenders:14,default:BASIC_SPECIMEN.font,websiteTypefaceFee:runtime.tariff.addOn}));
}finally{await browser?.close();server.kill();}
