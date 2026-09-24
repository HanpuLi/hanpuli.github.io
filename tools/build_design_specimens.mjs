#!/usr/bin/env node
// Capture real DOM geometry and current shop output; no production hooks are shipped.
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(), dir=path.join(root,'assets/design');await mkdir(dir,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=createServer(async(req,res)=>{try{let u=new URL(req.url,'http://localhost').pathname;if(u.endsWith('/'))u+='index.html';const p=path.join(root,u);res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();const manifest={schema:1,site:{},voucher:{},inputs:{}};
const writeImage=async(name,url)=>writeFile(path.join(dir,name),Buffer.from(url.split(',')[1],'base64'));
try{
 for(const locale of ['en','zh','zh-hans','ja','de','fr','ru']){
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1,colorScheme:'light'});
  const route=locale==='en'?'/':`/${locale}/`;
  await page.goto(base+route);await page.addStyleTag({content:'*{content-visibility:visible!important}'});await page.evaluate(()=>document.fonts.ready);
  const result={route,views:{},type:[]};
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1100});const node=page.locator('.project-feature');await node.scrollIntoViewIfNeeded();
   const data=await node.evaluate(el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);const box=n=>{const q=n.getBoundingClientRect();return {x:q.x-r.x,y:q.y-r.y,w:q.width,h:q.height};};return {width:r.width,height:r.height,viewport:innerWidth,gap:parseFloat(cs.columnGap),columns:(cs.gridTemplateColumns.startsWith('subgrid')?getComputedStyle(el.parentElement).gridTemplateColumns:cs.gridTemplateColumns).split(' ').map(parseFloat).filter(Number.isFinite),paddingTop:cs.paddingTop,rule:cs.borderTopWidth,parts:['.project-index','.project-main','.project-proof','.project-evidence-disclosure'].map(s=>({selector:s,...box(el.querySelector(s)),column:getComputedStyle(el.querySelector(s)).gridColumn}))};});
   const filename=`site-${locale}-${width}.png`;await node.screenshot({path:path.join(dir,filename)});result.views[width]={...data,file:filename};
  }
  await page.setViewportSize({width:1440,height:1100});
  const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const doc=(await cdp.send('DOM.getDocument')).root.nodeId;
  for(const selector of ['.project-feature .project-type','.project-feature h3','.project-feature .project-main > p:last-child']){
   const item=await page.locator(selector).evaluate(el=>{const s=getComputedStyle(el);return {text:el.innerText,family:s.fontFamily,size:parseFloat(s.fontSize),leading:parseFloat(s.lineHeight),tracking:s.letterSpacing,weight:s.fontWeight,transform:s.textTransform};});
   const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc,selector});item.fonts=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts.filter(f=>f.glyphCount).map(f=>({family:f.familyName,custom:f.isCustomFont}));result.type.push(item);
  }
  manifest.site[locale]=result;await page.close();console.log('Captured real layout:',locale);
 }
 const page=await browser.newPage();
 const shop=await readFile(path.join(root,'poetry-voucher/shop.js'),'utf8');
 await page.route('**/poetry-voucher/shop.js',r=>r.fulfill({contentType:'text/javascript',body:shop.replace('window.poetryShop=','window.__design={prepare,freezeOrder,continuousOrderPages,PagedPaper};window.poetryShop=')}));
 await page.goto(base+'/poetry-voucher/shop.html?lang=en&work=ci-b3');await page.waitForFunction(()=>document.querySelector('#product-editor')?.open);await page.locator('#font').selectOption('bitmap');await page.locator('#size').selectOption('24');await page.locator('#save-line').click();
 const output=await page.evaluate(async()=>{
  const order=await __design.freezeOrder();order.ref='260924120001';order.created=new Date('2026-09-24T11:00:00Z');order.receiptMetadata=receiptMeta(order.ref);order.payment={method:'cash',tender:500,change:500-order.total};
  const log=[];const proto=__design.PagedPaper.prototype;
  for(const method of ['till','text']){const old=proto[method];proto[method]=function(...args){const y=this.y;const v=old.apply(this,args);log.push({kind:this.identity.kind,method,y,end:this.y,args});return v;};}
  const first=await __design.prepare(order);const calls=log.slice();const pages=__design.continuousOrderPages(first);const full=canvas(384,pages.reduce((n,c)=>n+c.height,0));let y=0;for(const c of pages){full.getContext('2d').drawImage(c,0,y);y+=c.height;}
  const crop=(c,x,y,w,h)=>{const out=canvas(w,h);out.getContext('2d').drawImage(c,x,y,w,h,0,0,w,h);return out.toDataURL();};
  const header=calls.find(c=>c.kind==='RECEIPT'&&c.args[0].startsWith('QTY'));const total=calls.find(c=>c.kind==='RECEIPT'&&c.args[0]==='TOTAL TO PAY');
  const body=calls.find(c=>c.kind==='VOUCHER'&&c.method==='text'&&c.args[0]===order.lines[0].poem.split('\n')[0]);
  const baseVoucher=first.vouchers[0].pages[0];
  const alt=structuredClone(order);alt.created=new Date(order.created);alt.lines[0].font='site';const q=quotePoem(alt.lines[0].poem,[],'site');alt.lines[0].items=q.items.map(i=>({...i,quantity:1,amount:i.unitPrice}));alt.lines[0].unitPrice=q.price;alt.items=alt.lines[0].items;alt.total=q.price;alt.payment={method:'cash',tender:500,change:500-alt.total};alt.publication.textSnapshotSha256=await OrderReading.textHash(alt.lines);log.length=0;const second=await __design.prepare(alt);const secondBody=log.find(c=>c.kind==='VOUCHER'&&c.method==='text'&&c.args[0]===alt.lines[0].poem.split('\n')[0]);
  const glyph=patterns['A'];
  return {order,paper:PAPER_CONFIG,type:TYPE_CONFIG,receipt:RECEIPT_CONFIG,calls,body,secondBody,glyph,width:384,height:full.height,receiptHeight:first.receipt[0].height,cutHeight:pages[1].height,voucherHeight:baseVoucher.height,headerY:header.y,totalY:total.y,images:{'voucher-strip.png':full.toDataURL(),'receipt-columns.png':crop(first.receipt[0],0,header.y,384,120),'receipt-total.png':crop(first.receipt[0],0,total.y,384,48),'poem-bitmap.png':crop(baseVoucher,0,body.y,384,96),'poem-site.png':crop(second.vouchers[0].pages[0],0,secondBody.y,384,96)}};
 });
 for(const [name,url]of Object.entries(output.images))await writeImage(name,url);delete output.images;manifest.voucher=output;
 await page.close();
 for(const file of ['assets/site.css','content/poetry-voucher-app/gallery.js','content/poetry-voucher-app/shop.js',...(await (await import('node:fs/promises')).readdir(path.join(root,'assets/fonts'))).filter(f=>f.endsWith('.woff2')).map(f=>'assets/fonts/'+f),...['en','zh','zh-hans','ja','de','fr','ru'].map(l=>(l==='en'?'':l+'/')+'index.html')])manifest.inputs[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
 await writeFile(path.join(dir,'measurements.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Captured actual shop B3 output and geometry.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
