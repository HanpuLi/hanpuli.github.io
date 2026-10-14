#!/usr/bin/env node
// Font-scaling + repeated reflow regression for the five-stanza Chinese poem.
// This catches detached-original stanzas oscillating between broken and
// correctly packed bands, and iframe heights above the original 3000px guard.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    let url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(url.endsWith('/'))url+='index.html';
    const file=path.resolve(root,'.'+url);
    if(!file.startsWith(root+path.sep))throw Error('Not a source file');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port;
let completed=0;
try{
  for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch();
    try{
      for(const width of [320,390]){
        const page=await browser.newPage({viewport:{width,height:870}});
        const exceptions=[];
        page.on('pageerror',e=>exceptions.push(e.message));
        await page.goto(base+'/ja/poetry/jia-yi/?layout=vertical&kunten=on');
        const stage=page.locator('[data-poetry-kanbun-viewer="jia-yi-b6-text"]');
        const neighbour=page.locator('[data-poetry-text="jia-yi-a10-text"]');
        await page.waitForFunction(()=>document.querySelector(
          '[data-poetry-kanbun-viewer="jia-yi-b6-text"]')?.dataset.kanbunReady==='true');
        const contentBefore=await page.locator('[data-poetry-text="jia-yi-b6-text"] .source .body').textContent();
        await page.evaluate(()=>{
          document.documentElement.style.fontSize='200%';
          document.documentElement.setAttribute('data-reading-large','');
        });
        await page.evaluate(async()=>document.fonts.ready);

        async function inspect(mode,iteration){
          const expectedVisible=mode==='on';
          await page.waitForFunction((visible)=>{
            const a=document.querySelector('[data-poetry-kanbun-viewer="jia-yi-b6-text"]');
            const raw=document.querySelector('[data-poetry-text="jia-yi-a10-text"]');
            const rows=raw?.querySelectorAll('.flow-row').length??0;
            const marked=raw?.querySelector('.source')?.classList.contains('poetry-kanbun-showing');
            // All 17 classical Jia-Yi texts now have marks, including A10.
            // When marked, the original is deliberately visually clipped;
            // an absent flow-row is correct. When off, the original must
            // be laid out as real, complete bands again.
            const neighbourValid=visible ? marked : (!marked&&rows>0);
            return a && a.hidden!==visible && neighbourValid &&
              document.documentElement.scrollWidth<=innerWidth+1;
          },expectedVisible,{timeout:12000});
          assert.equal(await stage.isVisible(),expectedVisible,
            engineName+' '+width+' '+mode+' '+iteration+': viewer toggle');
          if (!expectedVisible)
            assert.ok((await neighbour.locator('.flow-row').count())>0,
              engineName+' '+width+' '+mode+' '+iteration+': stale detached stanza');
          else
            assert.ok(await neighbour.locator('.source').evaluate(el=>
              el.classList.contains('poetry-kanbun-showing')),
              engineName+' '+width+' '+mode+' '+iteration+': marked neighbour missing');
          const pageOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
          assert.ok(pageOverflow<=1,engineName+' '+width+': parent overflow '+pageOverflow);
          assert.equal(await page.locator('[data-poetry-text="jia-yi-b6-text"] .source .body').textContent(),contentBefore);
          if(expectedVisible){
            const frame=stage.locator('iframe');
            // The frame reports its size to the host by postMessage, so a
            // late font or reflow can briefly leave the host one message
            // behind. Allow that handshake to settle; persistent clipping
            // still fails below.
            let iframeRect,rendered;
            for(let attempt=0;attempt<25;attempt++){
              iframeRect=await frame.boundingBox();
              rendered=await frame.contentFrame().locator('#kanbun-display').evaluate(node=>{
                const r=node.getBoundingClientRect();
                return {right:r.right,bottom:r.bottom,scrollX:document.documentElement.scrollWidth-innerWidth,
                        scrollY:document.documentElement.scrollHeight-innerHeight};
              });
              if(iframeRect.width>=rendered.right+8&&iframeRect.height>=rendered.bottom+8)break;
              await page.waitForTimeout(200);
            }
            assert.ok(rendered.scrollX<=1,engineName+' '+width+': internal overflow');
            assert.ok(iframeRect.width>=rendered.right+8,
              engineName+' '+width+': marked text clipped in iframe width');
            assert.ok(iframeRect.height>=rendered.bottom+8,
              engineName+' '+width+': marked text clipped in iframe height');
          }
          assert.deepEqual(exceptions,[],engineName+' JS exceptions');
        }
        await inspect('on','initial');
        await page.locator('[data-poetry-kunten-choice="off"]').click(); await inspect('off','toggle');
        await page.locator('[data-poetry-kunten-choice="on"]').click(); await inspect('on','restore');
        for(let i=0;i<4;i++){
          await page.evaluate(()=>window.PoetryFlow.schedule());
          await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(
            ()=>requestAnimationFrame(ok))));
          await inspect('on',i);
        }
        completed++;
        await page.close();
      }
    }finally{await browser.close();}
  }
  console.log('poetrykuntenzoomcheck: '+completed+' viewport/engine stress cases; '
    +'200% font scale, 5-stanza frame geometry, 4 repeated flow passes, '
    +'source text, global toggle and no-overflow PASS');
}finally{await new Promise(ok=>server.close(ok));}
