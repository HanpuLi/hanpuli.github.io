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
const port=19849,base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:ROOT,stdio:'ignore'});
let browser;
const decode=data=>Buffer.from(data.slice(data.indexOf(',')+1),'base64');

try{
  for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch();
  const page=await browser.newPage();
  await page.goto(base+'/poetry-voucher/make.html?lang=zh-Hant');
  await page.locator('#full-pdf').waitFor({state:'visible'});
  const result=await page.evaluate(async()=>{
    const work=works.find(w=>w.id==='ci-b3');
    const created=new Date('2026-09-22T15:25:50Z');
    const ref=receiptReference(created,Uint8Array.from([0x9a,0xbc,0xde,0xf0]));
    const q=quotePoem(work.poem,work.translation,'site');
    const sample=work.title+work.author+work.poem+work.translation+(work.edition||'')+'李函璞';
    await Promise.all(['EB','Courier','ShipCommon','Ship','IMing','Noto'].map(f=>document.fonts.load(`24px ${f}`,sample)));
    await document.fonts.load('italic 19px EB');
    const full=render({work,original:true,font:'site',size:24,locale:'zh-Hant',
      title:work.title,author:work.author,poem:work.poem,translation:work.translation,
      created,ref,...q,method:'card',tender:q.price}).full;

    const editorial=document.createElement('canvas');
    editorial.width=1200;editorial.height=1800;
    const x=editorial.getContext('2d');
    x.fillStyle='#000';x.fillRect(0,0,1200,1800);
    x.fillStyle='#171614';x.beginPath();x.roundRect(375,37,455,1740,42);x.fill();
    x.drawImage(full,408,65);

    const small=document.createElement('canvas');
    small.width=600;small.height=900;
    const sx=small.getContext('2d');
    sx.imageSmoothingEnabled=true;sx.imageSmoothingQuality='high';
    sx.drawImage(editorial,0,0,600,900);
    return {
      ref,width:full.width,height:full.height,
      png:editorial.toDataURL('image/png'),
      webp1200:editorial.toDataURL('image/webp',0.92),
      webp600:small.toDataURL('image/webp',0.92)
    };
  });
  assert.equal(result.width,384);
  assert.equal(result.height,1669);
  assert.match(result.ref,/^\d{12}$/);
  const dir=join(ROOT,'assets/projects/poetry-voucher');
  await Promise.all([
    writeFile(join(dir,'poetry-voucher-editorial-1200.png'),decode(result.png)),
    writeFile(join(dir,'poetry-voucher-editorial-1200.webp'),decode(result.webp1200)),
    writeFile(join(dir,'poetry-voucher-editorial-600.webp'),decode(result.webp600))
  ]);
  console.log(`build_poetry_voucher_editorial: ${result.ref}, ${result.width}x${result.height} proof -> 1200x1800 + 600x900 assets`);
}finally{
  await browser?.close();
  server.kill();
}
