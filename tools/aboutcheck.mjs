import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {inspectTypeInk} from './type-ink-check.mjs';

// A real browser audit of both essays, not a count of strings in templates.
const root=process.cwd(), capture=process.env.ABOUT_CAPTURE_DIR;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    let relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(relative.endsWith('/'))relative+='index.html';
    const file=path.resolve(root,'.'+relative);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
const rows=[], failures=[];
try{
  if(capture)await mkdir(capture,{recursive:true});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  for(const locale of ['en','zh','zh-hans','ja','de','fr','ru']){
    for(const kind of ['site','project']){
      const prefix=locale==='en'?'':locale+'/';
      const url=base+'/'+prefix+(kind==='site'?'about.html':'poetry-voucher/');
      const page=await context.newPage();
      const errors=[],badResponses=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.status()>=400)badResponses.push([r.status(),r.url()]);});
      await page.goto(url,{waitUntil:'load'});
      await page.evaluate(()=>document.fonts.ready);
      const counts=await page.evaluate(()=>({sections:document.querySelectorAll('.editorial-section').length,
        placeholders:document.body.innerText.includes('[[')||document.body.innerText.includes('{{'),
        citations:[...document.querySelectorAll('.editorial-citation a')].map(a=>({href:a.getAttribute('href'),exists:!!document.querySelector(a.getAttribute('href'))})),
        texts:[...document.querySelectorAll('.editorial-section .about-section-copy')].map(n=>n.textContent.length),
        siteVisual:document.querySelectorAll('.site-visual-grammar').length,
        projectStructure:document.querySelectorAll('.pv-structure-diagram').length,
        projectAesthetic:document.querySelectorAll('.pv-aesthetic-diagram').length}));
      assert.equal(counts.sections,kind==='site'?6:8,`${locale}/${kind}: section count`);
      assert(!counts.placeholders,`${locale}/${kind}: unexpanded copy`);
      assert(counts.texts.every(n=>n>120),`${locale}/${kind}: missing paragraphs`);
      assert(counts.citations.length>0&&counts.citations.every(x=>x.exists),`${locale}/${kind}: citation targets`);
      if(kind==='site')assert.equal(counts.siteVisual,1,`${locale}/site: visual grammar`);
      else{assert.equal(counts.projectStructure,1,`${locale}/project: structure diagram`);assert.equal(counts.projectAesthetic,1,`${locale}/project: aesthetic diagram`);}
      if(kind==='project'){
        await page.locator('.editorial-tariff summary').click();
        assert.equal(await page.locator('.pv-tariff > div').count(),7);
        assert.match(await page.locator('.pv-tariff').innerText(),/£1\.00/);
        assert.equal(await page.locator('.pv-tariff').innerText().then(s=>(s.match(/£1\.99/g)||[]).length),2);
      }
      for(const width of [320,390,520,768,900,1024,1440]){
        await page.setViewportSize({width,height:1000});
        const geometry=await page.evaluate(()=>{
          const overflow=document.documentElement.scrollWidth-document.documentElement.clientWidth;
          const clipped=[...document.querySelectorAll('.page-nav a,.page-languages a,.pv-contents a,.editorial-section h2,.pv-tariff dd,.design-atlas h3,.design-atlas h4,.plate-metrics dd,.plate-type-metrics dd')]
            .filter(n=>n.getBoundingClientRect().width>0&&n.scrollWidth>n.clientWidth+1)
            .map(n=>({text:n.textContent.trim(),scroll:n.scrollWidth,client:n.clientWidth}));
          return {overflow,clipped};
        });
        if(geometry.overflow>1||geometry.clipped.length)failures.push({locale,kind,width,...geometry});
        const ink=await page.evaluate(inspectTypeInk);
        if(ink.failures.length)failures.push({locale,kind,width,ink:ink.failures});
        rows.push({locale,kind,width,...geometry,ink:ink.measurements});
      }
      for(const width of [390,1440]){
        await page.setViewportSize({width,height:1000});
        const scan=await new AxeBuilder({page}).analyze();
        if(scan.violations.length)failures.push({locale,kind,width,axe:scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});
      }
      await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
      await page.setViewportSize({width:390,height:1000});
      // Style stress, separate from the interactive reading-controls checks in browsercheck.
      await page.evaluate(()=>{for(const option of ['sans','large','spacing','measure','simple','contrast'])document.documentElement.setAttribute('data-reading-'+option,'');});
      const stress=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      if(stress>1)failures.push({locale,kind,stressOverflow:stress});
      await page.evaluate(()=>{for(const option of ['sans','large','spacing','measure','simple','contrast'])document.documentElement.removeAttribute('data-reading-'+option);});
      await page.emulateMedia({colorScheme:'light'});
      await page.evaluate(()=>document.activeElement?.blur());
      if(capture&&['en','zh-hans','de'].includes(locale)){
        await page.setViewportSize({width:1440,height:1000});
        await page.evaluate(()=>scrollTo(0,0));
        await page.screenshot({path:path.join(capture,`${locale}-${kind}-desktop.png`)});
        await page.locator(kind==='site'?'#layout':'#configuration').screenshot({path:path.join(capture,`${locale}-${kind}-body.png`)});
        await page.locator(kind==='site'?'.site-visual-grammar':'.pv-aesthetic-diagram').screenshot({path:path.join(capture,`${locale}-${kind}-visual.png`)});
        await page.setViewportSize({width:390,height:844});
        await page.locator(kind==='site'?'#layout':'#pricing').screenshot({path:path.join(capture,`${locale}-${kind}-mobile.png`)});
      }
      assert.deepEqual(errors,[],`${locale}/${kind}: browser errors`);
      assert.deepEqual(badResponses,[],`${locale}/${kind}: missing assets`);
      await page.close();
      console.log(`${locale}/${kind}: complete copy, citations, 7 widths, 2 axe scans, dark + reading-style stress`);
    }
  }
  const nojs=await browser.newContext({javaScriptEnabled:false});
  for(const endpoint of ['about.html','poetry-voucher/']){
    const page=await nojs.newPage();await page.goto(base+'/'+endpoint);
    assert(await page.locator('.editorial-section').count()>0);
    assert(await page.locator('.editorial-references a').count()>0);
    if(endpoint==='about.html')assert.equal(await page.locator('.site-visual-grammar').count(),1);
    else{assert.equal(await page.locator('.pv-structure-diagram').count(),1);assert.equal(await page.locator('.pv-aesthetic-diagram').count(),1);}
    if(endpoint.includes('voucher')){await page.locator('.editorial-tariff summary').click();assert(await page.locator('.pv-tariff').isVisible());}
  }
  await nojs.close();
  const shop=await browser.newPage();await shop.goto(base+'/poetry-voucher/shop.html?lang=en');await shop.waitForSelector('.product-card');
  const quotes=await shop.evaluate(()=>({drafts:['shi-d1-1','shi-d2-1'].map(id=>{const w=works.find(w=>w.id===id);const q=quotePoem(w.poem,'','bitmap');return [q.characters,q.lines,q.stanzas,q.price];}),threshold:[quotePoem('x'.repeat(40),'','bitmap').price,quotePoem('x'.repeat(20)+'\n'+'x'.repeat(20),'','bitmap').price],unchanged:[quotePoem(works.find(w=>w.id==='ci-b3').poem,'','bitmap').price,quotePoem(works.find(w=>w.id==='ci-b3').poem.replace(/\n/g,''),'','bitmap').price],tariff:TARIFF}));
  assert.deepEqual(quotes.drafts,[[185,19,7,699],[109,19,7,499]],'Published comparison must track the real renderer');
  assert.deepEqual(quotes.threshold,[199,299]);assert.deepEqual(quotes.unchanged,[299,299]);
  if(capture)await writeFile(path.join(capture,'aboutcheck.json'),JSON.stringify({rows,failures,quotes},null,2)+'\n');
  assert.deepEqual(failures,[],'Editorial geometry or accessibility regression');
  console.log('aboutcheck: 14 essays, 98 viewport checks, 28 axe scans, 14 combined style checks; no-JS reading and real pricing examples passed. No physical printing or human-reader validation.');
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
