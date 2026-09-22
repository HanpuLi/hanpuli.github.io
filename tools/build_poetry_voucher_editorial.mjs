#!/usr/bin/env node
// Rebuild the homepage Poetry Voucher editorial image from the public Studio renderer.
// This is an authoring helper only; it does not print or contact a private device.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from '@playwright/test';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const EDITORIAL_SPECIMEN=Object.freeze({
  workId:'ci-b3',
  created:'2026-09-22T15:25:50Z',
  entropy:Object.freeze([0x9a,0xbc,0xde,0xf0]),
  font:'site',
  size:24,
  locale:'zh-Hant',
  bilingual:true,
  paymentMethod:'card',
  previewWidth:960,
  previewHeight:2400,
  topInset:65,
  webpQuality:.94
});
const port=19849,base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:ROOT,stdio:'ignore'});
let browser;
const decode=data=>Buffer.from(data.slice(data.indexOf(',')+1),'base64');

try{
  for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=process.env.PLAYWRIGHT_CDP_URL?await chromium.connectOverCDP(process.env.PLAYWRIGHT_CDP_URL):await chromium.launch();
  const context=browser.contexts()[0]||await browser.newContext();
  const page=await context.newPage();
  await page.goto(base+'/poetry-voucher/make.html?lang='+encodeURIComponent(EDITORIAL_SPECIMEN.locale));
  await page.locator('#full-pdf').waitFor({state:'visible'});
  const result=await page.evaluate(async specimen=>{
    const work=works.find(w=>w.id===specimen.workId);
    if(!work)throw Error('Editorial specimen work is missing.');
    const created=new Date(specimen.created);
    const ref=receiptReference(created,Uint8Array.from(specimen.entropy));
    const translation=specimen.bilingual?work.translation:'';
    const q=quotePoem(work.poem,translation,specimen.font);
    const sample=work.title+work.author+work.poem+translation+(work.edition||'')+'李函璞';
    await Promise.all(['EB','Courier','ShipCommon','Ship','IMing','Noto'].map(f=>document.fonts.load(`${specimen.size}px ${f}`,sample)));
    await document.fonts.load(`italic ${TYPE_CONFIG.translation}px EB`);
    const full=render({work,original:true,font:specimen.font,size:specimen.size,locale:specimen.locale,
      title:work.title,author:work.author,poem:work.poem,translation,
      created,ref,...q,method:specimen.paymentMethod,tender:q.price}).full;

    // Homepage documentation: the printed paper is the object. Keep the
    // renderer's native strip and leave the surrounding canvas transparent.
    const editorial=document.createElement('canvas');
    editorial.width=specimen.previewWidth;editorial.height=specimen.previewHeight;
    const x=editorial.getContext('2d');
    x.drawImage(full,(editorial.width-full.width)/2,specimen.topInset);

    const small=document.createElement('canvas');
    small.width=specimen.previewWidth/2;small.height=specimen.previewHeight/2;
    const sx=small.getContext('2d');
    sx.imageSmoothingEnabled=true;sx.imageSmoothingQuality='high';
    sx.drawImage(editorial,0,0,small.width,small.height);
    return {
      ref,width:full.width,height:full.height,printableDots:PAPER_CONFIG.printableDots,
      previewWidth:editorial.width,previewHeight:editorial.height,
      cornerAlpha:x.getImageData(0,0,1,1).data[3],
      png:editorial.toDataURL('image/png'),
      webp960:editorial.toDataURL('image/webp',specimen.webpQuality),
      webp480:small.toDataURL('image/webp',specimen.webpQuality)
    };
  },EDITORIAL_SPECIMEN);
  assert.equal(result.width,result.printableDots);
  assert(result.height<=result.previewHeight-EDITORIAL_SPECIMEN.topInset*2);
  assert.equal(result.previewWidth,EDITORIAL_SPECIMEN.previewWidth);
  assert.equal(result.previewHeight,EDITORIAL_SPECIMEN.previewHeight);
  assert.equal(result.cornerAlpha,0);
  assert.match(result.ref,/^\d{12}$/);
  const dir=join(ROOT,'assets/projects/poetry-voucher');
  await Promise.all([
    writeFile(join(dir,'poetry-voucher-paper-960.png'),decode(result.png)),
    writeFile(join(dir,'poetry-voucher-paper-960.webp'),decode(result.webp960)),
    writeFile(join(dir,'poetry-voucher-paper-480.webp'),decode(result.webp480))
  ]);
  console.log(`build_poetry_voucher_editorial: ${result.ref}, native ${result.width}x${result.height} paper -> transparent ${result.previewWidth}x${result.previewHeight} + ${Math.round(result.previewWidth/2)}x${Math.round(result.previewHeight/2)} assets`);
}finally{
  await browser?.close();
  server.kill();
}
