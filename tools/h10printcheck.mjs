#!/usr/bin/env node
// Exercise the public order page inside a paired-origin frame without a printer.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';

const shopOrigin='http://127.0.0.1:19854';
const terminalOrigin='http://127.0.0.1:18859';
const server=spawn('python3',['-m','http.server','19854','--bind','127.0.0.1'],{stdio:'ignore'});
const parent=createServer((request,response)=>{
  response.setHeader('Content-Type','text/html');
  response.end(`
    <iframe id="shop" src="${shopOrigin}/poetry-voucher/shop.html?lang=en&work=ci-b3"></iframe>
    <script>
      window.received=[];
      const frame=document.getElementById('shop'),origin='${shopOrigin}',nonce='12345678-1234-4123-8123-123456789abc';
      frame.addEventListener('load',()=>frame.contentWindow.postMessage({channel:'poetry-voucher-h10s',type:'ready',nonce},origin));
      addEventListener('message',event=>{
        if(event.origin===origin&&event.source===frame.contentWindow&&event.data?.type==='print-order')received.push(event.data);
      });
    </script>`);
});
let browser;
try{
  await new Promise((resolve,reject)=>parent.once('error',reject).listen(18859,'127.0.0.1',resolve));
  for(let i=0;i<50;i++){
    try{if((await fetch(shopOrigin)).ok)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser=await chromium.launch();
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>errors.push(request.url()+' '+request.failure()?.errorText));
  // The parent captures pixels via postMessage and has no printer endpoint.
  await page.goto(terminalOrigin+'/');
  const shop=page.frameLocator('#shop');
  await shop.locator('#work option[value="ci-b3"]').waitFor({state:'attached',timeout:15000});
  await shop.locator('#product-editor[open]').waitFor();
  await shop.locator('#font').selectOption('site');
  await shop.locator('#size').selectOption('24');
  await shop.locator('#save-line').click();
  await shop.locator('#open-bag').click();
  await shop.locator('#to-checkout').click();
  await shop.locator('#place-order').click();
  await shop.locator('.completed-order').waitFor({timeout:30000});
  const order=await shop.locator('body').evaluate(()=>poetryShop.snapshot().orders[0]);
  assert.equal(order.lines.length,1);
  assert.equal(order.lines[0].workId,'ci-b3');
  assert.equal(order.lines[0].font,'site');
  await shop.locator('.h10-print-order:visible').click();
  await page.waitForFunction(()=>received.length===1,{},{timeout:10000});
  const sent=await page.evaluate(()=>received[0]);
  assert.equal(sent.reference,order.ref);
  assert(sent.pages.length>=3,'receipt, cut marker and voucher must all be sent');
  for(const paper of sent.pages){
    assert(paper.height>0&&paper.height<=6000);
    assert.equal(Buffer.from(paper.bits,'base64').length,paper.height*48);
  }
  assert.deepEqual(errors,[]);
  console.log('h10printcheck: paired order sent receipt, cut marker and B3 site-font voucher; no printer contacted');
}finally{await browser?.close();server.kill('SIGTERM');parent.close();}
