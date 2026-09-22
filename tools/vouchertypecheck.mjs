#!/usr/bin/env node
// Optical-size and tariff regression, no printing or private API calls.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const port=19847,base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try{
  for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch();const page=await browser.newPage();
  await page.goto(base+'/poetry-voucher/make.html?lang=en');
  await page.locator('#full-pdf').waitFor({state:'visible'});
  assert.equal(await page.locator('#font').inputValue(),'bitmap');
  assert.equal(await page.locator('#price').inputValue(),'2.99');
  const rows=await page.evaluate(async()=>{
    await document.fonts.load('24px FusionPixel',works.map(w=>w.poem+w.translation).join(''));
    const summaries=[];
    for(const work of works)for(const font of ['bitmap','site'])for(const size of typeSizes(font))for(const bilingual of [false,true]){
      const translation=bilingual?work.translation||'':'',q=quotePoem(work.poem,translation,font);
      const spec={work,original:true,font,size,title:work.title,author:work.author,poem:work.poem,translation,
        created:new Date('2026-09-22T12:00:00Z'),ref:'SAMPLE000001',...q,method:'cash'};
      const rendered=render(spec),data=rendered.full.getContext('2d').getImageData(0,0,384,rendered.full.height).data;
      let binary=true;for(let i=0;i<data.length;i++){if(i%4===3?data[i]!==255:data[i]!==0&&data[i]!==255){binary=false;break;}}
      summaries.push({id:work.id,font,size,bilingual,height:rendered.full.height,binary,price:q.price,fee:q.items.filter(i=>i.id==='font').reduce((n,i)=>n+i.amount,0)});
    }
    return summaries;
  });
  assert.equal(rows.length,230);assert(rows.every(r=>r.binary&&r.height+140<=6000),JSON.stringify(rows.filter(r=>!r.binary||r.height+140>6000)));
  assert(rows.every(r=>r.fee===(r.font==='site'?199:0)));
  for(const locale of ['en','zh-Hant','zh-Hans','ja','de','fr','ru']){
    await page.locator('#ui-locale').selectOption(locale);
    assert.equal(await page.locator('#font').inputValue(),'bitmap');
    const labels=await page.locator('#font option').allTextContents();
    const expected=await page.evaluate(()=>[tr('點陣體 · 預設，已包含'),tr('明朝體 · +£1.99')]);
    assert.deepEqual(labels,expected);
    await page.locator('#size').selectOption('36');await page.locator('#font').selectOption('site');
    assert.equal(await page.locator('#size').inputValue(),'24');assert.equal(await page.locator('#price').inputValue(),'4.98');
    assert.equal(await page.locator('#full-pdf').isVisible(),false);
    assert.equal(await page.locator('#price-breakdown').textContent(),await page.evaluate(()=>`${tr('詩券')} × 1 — ${new Intl.NumberFormat(document.documentElement.lang,{style:'currency',currency:'GBP'}).format(2.99)}${tr('明朝體版本')} × 1 — ${new Intl.NumberFormat(document.documentElement.lang,{style:'currency',currency:'GBP'}).format(1.99)}`));
    await page.locator('#size').selectOption('22');await page.locator('#font').selectOption('bitmap');
    assert.equal(await page.locator('#size').inputValue(),'24');assert.equal(await page.locator('#price').inputValue(),'2.99');
    assert.deepEqual(await page.locator('#size option').allTextContents(),['24','36']);
  }
  // Sample assets are refreshed only by explicit authoring command, never by QA.
  if(process.argv.includes('--write-samples')){
    const samples=await page.evaluate(()=>{
      const work=works.find(w=>w.id==='ci-b3'),q=quotePoem(work.poem,'','bitmap');
      const r=render({work,original:true,font:'bitmap',size:24,title:work.title,author:work.author,poem:work.poem,translation:'',ref:'SAMPLE000001',created:new Date('2026-09-22T12:00:00Z'),...q,method:'cash'});
      return {receipt:r.receipt.toDataURL(),voucher:r.voucher.toDataURL()};
    });
    for(const [kind,data] of Object.entries(samples))await writeFile(`poetry-voucher/sample-${kind}.png`,Buffer.from(data.split(',')[1],'base64'));
  }
  console.log(JSON.stringify({renders:rows.length,maxRows:Math.max(...rows.map(r=>r.height)),locales:7,default:'bitmap',minchoFee:199}));
}finally{await browser?.close();server.kill();}
