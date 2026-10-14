#!/usr/bin/env node
// Browser behaviour of the sandboxed kanbun reader.
// Site-wide poetrylayoutcheck still tests all other 29 Japanese readings.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium, webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = process.cwd();
const original = '銅。鑰齒新裁付掌中。天寒了，加飯且從容。';
const id = 'jia-yi-b5-text';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
  '.woff2':'font/woff2','.json':'application/json','.png':'image/png'};
const server = createServer(async(req,res) => {
  try {
    let u = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (u.endsWith('/')) u += 'index.html';
    const file = path.resolve(root,'.'+u);
    if (!file.startsWith(root + path.sep)) throw Error('Path outside project');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
    res.end(await readFile(file));
  } catch { res.writeHead(404);res.end('Not found'); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let count = 0;
try {
  for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
    const browser = await engine.launch();
    try {
      for (const width of [320,390,1280]) {
        const context = await browser.newContext({viewport:{width,height:850}});
        if (name === 'chromium' && width === 390) {
          await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
        }
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e=>errors.push(e.message));
        await page.goto(base+'/ja/poetry/jia-yi/?layout=vertical&kunten=on',{waitUntil:'load'});
        const article = page.locator('[data-poetry-text="'+id+'"]');
        const stage = article.locator('[data-poetry-kanbun-viewer="'+id+'"]');
        const iframe = stage.locator('iframe[data-kanbun-frame]');
        // The iframe can have a nonzero box while it is still clipped and
        // awaiting two animation frames of stable measured glyph geometry.
        // Wait for the host's explicit ready handshake, not element presence.
        await page.locator('[data-poetry-kanbun-viewer="'+id+'"][data-kanbun-ready="true"]')
          .waitFor({state:'visible',timeout:12000});
        await iframe.waitFor({state:'visible',timeout:3000});
        assert.equal(await stage.getAttribute('data-kanbun-ready'),'true');
        assert.equal(await article.locator('.source .body').textContent(),original);
        assert.ok(await article.locator('.source').evaluate(el=>el.classList.contains('poetry-kanbun-showing')));
        assert.equal(await page.locator('[data-poetry-kunten-choice="on"]').getAttribute('aria-pressed'),'true');
        assert.equal(await page.locator('[data-poetry-kunten-toggle],[data-poetry-kanbun-local-toggle]').count(),0,'one three-way choice, no second toggle');
        assert.equal(await iframe.getAttribute('sandbox'),'allow-scripts','viewer may not access parent DOM');
        const renderer = iframe.contentFrame();
        const body = '#kanbun-display p:not(.kanbun-title)';
        assert.equal(await renderer.locator(body+' .unit').count(),16);
        assert.equal(await renderer.locator(body+' .kaeriten').count(),3);
        // 乙五《無題 · 十六字令》: two title columns before the poem.
        assert.deepEqual(await renderer.locator('#kanbun-display .kanbun-title').allTextContents(),['無題','十六字令']);
        // A one-line poem must remain in one vertical character column.
        const columns = await renderer.locator(body+' .kanji').evaluateAll(nodes =>
          [...new Set(nodes.map(el=>Math.round(el.getBoundingClientRect().x)))]
        );
        assert.ok(columns.length <= 2,
          name+' '+width+': broken glyph columns '+JSON.stringify(columns));
        const collisions = await renderer.locator('#kanbun-display').evaluate(root=>{
          const bases = [...root.querySelectorAll('.kanji')];
          const notes = [...root.querySelectorAll('.furigana,.okurigana,.kaeriten')];
          const hit = (a,b) => Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)) *
            Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
          const out = [];
          for (const note of notes) {
            const nr = note.getBoundingClientRect();
            if (nr.left < -1 || nr.right > innerWidth + 1) {
              out.push('clipped '+note.textContent);
              continue;
            }
            for (const base of bases) {
              if (hit(nr,base.getBoundingClientRect()) > 1) {
                out.push('overlap '+note.textContent+' / '+base.textContent);
              }
            }
          }
          for (let a=0;a<notes.length;a++) {
            for (let b=a+1;b<notes.length;b++) {
              if (hit(notes[a].getBoundingClientRect(),notes[b].getBoundingClientRect()) > 1) {
                out.push('mark collision '+notes[a].textContent+' / '+notes[b].textContent);
              }
            }
          }
          return out;
        });
        assert.deepEqual(collisions,[],
          name+' '+width+': glyph and note boxes overlap or clip');
        const frameOverflow = await renderer.locator('body').evaluate(()=>
          document.documentElement.scrollWidth - innerWidth);
        assert.ok(frameOverflow<=1,name+' '+width+' iframe overflow: '+frameOverflow);
        const pageOverflow = await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
        assert.ok(pageOverflow<=1,name+' '+width+' page overflow: '+pageOverflow);
        // Test the actual CopyEvent data rather than trusting its UI label.
        const copied = await renderer.locator('#kanbun-display').evaluate(el=>{
          const data={text:'',setData(k,v){if(k==='text/plain')this.text=v;}};
          const ev=new Event('copy',{bubbles:true,cancelable:true});
          Object.defineProperty(ev,'clipboardData',{value:data});
          el.dispatchEvent(ev);
          return {text:data.text,prevented:ev.defaultPrevented};
        });
        assert.deepEqual(copied,{text:original,prevented:true});
        if (name !== 'chromium' || width !== 390) {
          await page.evaluate(()=>{
            Object.defineProperty(navigator,'clipboard',{configurable:true,
              value:{writeText:async text=>{window.__copiedOriginal=text;}}});
          });
        }
        await stage.locator('[data-kanbun-copy]').click();
        if (name === 'chromium' && width === 1280) {
          // The confirmation is brief, and a denied clipboard is reported as a failure.
          const copy = stage.locator('[data-kanbun-copy]');
          assert.equal(await copy.textContent(),'原文をコピーしました');
          await page.waitForFunction(n=>n.textContent==='原文をコピー',await copy.elementHandle(),{timeout:4000});
          await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('denied','NotAllowedError');}}}));
          await copy.click();assert.equal(await copy.textContent(),'コピーできませんでした');
          await page.waitForFunction(n=>n.textContent==='原文をコピー',await copy.elementHandle(),{timeout:4000});
          await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedOriginal=text;}}}));
        }
        if (name === 'chromium' && width === 390) {
          assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),original,
            'Actual browser clipboard must contain only the original Chinese');
          const audit = await new AxeBuilder({page}).include('[data-poetry-text="'+id+'"]')
            .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
          assert.deepEqual(audit.violations.map(v=>v.id),[],
            'Active marked viewer must preserve accessible canonical text');
          assert.ok((await article.ariaSnapshot()).includes(original));
        } else {
          assert.equal(await page.evaluate(()=>window.__copiedOriginal),original);
        }
        // 横書き / 縦書き / 縦書き＋訓点 is one choice; vertical without marks is the white text.
        const plainVertical = page.locator('[data-poetry-kunten-choice="off"]'), marked = page.locator('[data-poetry-kunten-choice="on"]');
        assert.equal(await marked.textContent(),'縦書き＋訓点');
        await plainVertical.click();
        assert.ok(await stage.isHidden());
        assert.ok(!(await article.locator('.source').evaluate(el=>el.classList.contains('poetry-kanbun-showing'))));
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.poetryLayout),'vertical','white text stays vertical');
        assert.equal(await article.locator('.source .body').textContent(),original);
        assert.deepEqual(await page.locator('button[data-poetry-layout]').evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-pressed'))),['false','true','false']);
        assert.equal(new URL(page.url()).searchParams.get('kunten'),'off');
        await marked.focus();
        await page.keyboard.press('Enter');
        await stage.waitFor({state:'visible'});
        assert.deepEqual(await page.locator('button[data-poetry-layout]').evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-pressed'))),['false','false','true']);
        await page.locator('button[data-poetry-layout="horizontal"]').click();
        assert.ok(await stage.isHidden());
        assert.equal(await article.locator('.source .body').evaluate(el=>getComputedStyle(el).writingMode),'horizontal-tb');
        await marked.click();
        await stage.waitFor({state:'visible'});
        await page.evaluate(()=>document.documentElement.setAttribute('data-reading-simple',''));
        assert.ok(await stage.isHidden());
        await page.evaluate(()=>document.documentElement.removeAttribute('data-reading-simple'));
        await stage.waitFor({state:'visible'});
        await page.evaluate(()=>document.documentElement.setAttribute('data-reading-contrast',''));
        await page.waitForTimeout(70);
        const expectedColor = await article.locator('.source .body').evaluate(el=>getComputedStyle(el).color);
        const frameColor = await renderer.locator('body').evaluate(el=>getComputedStyle(el).color);
        assert.equal(frameColor,expectedColor,'Contrast preference colour must reach frame');
        assert.deepEqual(errors,[],name+' page exceptions');
        await context.close();
        count++;
      }
      const plain = await browser.newPage({javaScriptEnabled:false});
      await plain.goto(base+'/ja/poetry/jia-yi/',{waitUntil:'load'});
      const pArticle=plain.locator('[data-poetry-text="'+id+'"]');
      assert.equal(await pArticle.locator('.source .body').textContent(),original);
      assert.ok(await pArticle.locator('[data-poetry-kanbun-viewer]').isHidden());
      assert.ok(await pArticle.locator('.source .body').isVisible());
      await plain.close();
      const broken = await browser.newPage({viewport:{width:390,height:850}});
      await broken.route('**/assets/kanbun-viewer/works/**',route=>route.abort());
      await broken.goto(base+'/ja/poetry/jia-yi/?layout=vertical',{waitUntil:'load'});
      await broken.waitForTimeout(300);
      const bad=broken.locator('[data-poetry-text="'+id+'"]');
      assert.equal(await bad.locator('.source .body').textContent(),original);
      assert.ok(await bad.locator('.source .body').isVisible());
      await broken.close();
    } finally { await browser.close(); }
  }
  console.log('poetrykuntencheck: '+count+' viewports; Chromium/WebKit, copy original, '
    +'sandbox, no-JS and network-failure fallback, white/vertical/horizontal/simple controls OK');
} finally {
  await new Promise(resolve=>server.close(resolve));
}
