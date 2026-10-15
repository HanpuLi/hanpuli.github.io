#!/usr/bin/env node
// The kanbun reader recovers when its frame loads badly: a missing
// typesetter (the frame reports an error), a missing viewer (the frame never
// answers), or a ready report that never reaches the host. Each must end with
// the visual reader shown, not the plain vertical fallback.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium, webkit} from 'playwright';

const root = process.cwd();
const page_url = '/ja/poetry/linjiangxian-20260909/';
const id = 'linjiangxian-20260909-text';
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

// Fail only the first request for a viewer asset; later reloads succeed.
async function failFirst(context, pattern) {
  let failed = 0;
  await context.route(pattern, route => {
    if (failed++ === 0) return route.abort();
    return route.continue();
  });
}

const scenarios = {
  'typesetter missing on first load': context => failFirst(context, /kanbun-render\.js/),
  'viewer missing on first load': context => failFirst(context, /kanbun-viewer\/viewer\.js/),
  'first ready report lost': async context => {
    // Swallow the frame's first ready message before the host sees it.
    await context.addInitScript(() => {
      if (window.top !== window) return;
      let dropped = false;
      addEventListener('message', event => {
        if (!dropped && event.data?.type === 'hanpu-kanbun-viewer-v1' && event.data.state === 'ready') {
          dropped = true;
          event.stopImmediatePropagation();
        }
      }, true);
    });
  },
};

let count = 0;
try {
  for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
    const browser = await engine.launch();
    try {
      for (const [label, inject] of Object.entries(scenarios)) {
        const context = await browser.newContext({viewport:{width:390,height:844}});
        await inject(context);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e=>errors.push(e.message));
        await page.goto(base+page_url+'?layout=vertical&kunten=on',{waitUntil:'load'});
        const stage = page.locator(`[data-poetry-kanbun-viewer="${id}"]`);
        await page.locator(`[data-poetry-kanbun-viewer="${id}"][data-kanbun-ready="true"]`)
          .waitFor({state:'visible',timeout:20000})
          .catch(() => { throw Error(`${name}: ${label}: reader never became ready`); });
        assert.ok(await page.locator('.poem-version.source').first()
          .evaluate(el=>el.classList.contains('poetry-kanbun-showing')), `${name}: ${label}: source not replaced`);
        const glyphs = await stage.locator('iframe[data-kanbun-frame]').contentFrame()
          .locator('#kanbun-display .kaeriten').count();
        assert.ok(glyphs > 0, `${name}: ${label}: no return marks rendered`);
        assert.deepEqual(errors, [], `${name}: ${label}: page errors`);
        count++;
        await context.close();
      }

      // A reader stuck before ready restarts when the reader chooses
      // 縦書き＋訓点 again: block the frame entirely, then let it through.
      const context = await browser.newContext({viewport:{width:390,height:844}});
      let blocked = true;
      await context.route(/kanbun-viewer\/works\//, route => blocked ? route.abort() : route.continue());
      const page = await context.newPage();
      await page.goto(base+page_url+'?layout=vertical&kunten=on',{waitUntil:'load'});
      // Exhaust the automatic attempts (3 pings + 2 reloads at 1.5s).
      await page.waitForTimeout(14000);
      const stage = page.locator(`[data-poetry-kanbun-viewer="${id}"]`);
      assert.notEqual(await stage.getAttribute('data-kanbun-ready'),'true',`${name}: blocked frame reported ready`);
      assert.ok(await page.locator('.poem-version.source .body').first().isVisible(),
        `${name}: plain source must remain while the reader is unavailable`);
      blocked = false;
      await page.locator('[data-poetry-kunten-choice="off"]').click();
      await page.locator('[data-poetry-kunten-choice="on"]').click();
      await page.locator(`[data-poetry-kanbun-viewer="${id}"][data-kanbun-ready="true"]`)
        .waitFor({state:'visible',timeout:20000})
        .catch(() => { throw Error(`${name}: layout choice did not retry the reader`); });
      count++;
      await context.close();
    } finally { await browser.close(); }
  }
} finally { server.close(); }
console.log(`kanbun recovery: ${count} scenarios passed`);
