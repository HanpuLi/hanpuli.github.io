#!/usr/bin/env node
// Exercise the published reader, including authored line preservation on resize.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium, webkit} from 'playwright';

const root = process.cwd();
const library = JSON.parse(await readFile(path.join(root, 'content/poetry/library.json'), 'utf8'));
const classicalRoutes = [...new Set(library.works.filter(work => ['ci', 'shi', 'qu'].includes(work.form))
  .map(work => `/zh/poetry/${work.route}/`))];
classicalRoutes.push('/zh/poetry/september-2026/');
const mime = {'.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript',
  '.woff2':'font/woff2', '.json':'application/json', '.png':'image/png', '.webp':'image/webp'};
const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) throw Error('outside repository');
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const engineName = process.env.POETRY_LAYOUT_ENGINE === 'webkit' ? 'webkit' : 'chromium';
let browser;
let layouts = 0;
const errors = [];
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function inspect(page, expected, layout) {
  await settle(page);
  const result = await page.evaluate(() => {
    const articles = [...document.querySelectorAll('.reader-poem[data-poetry-classical]')];
    return {
      layout:document.documentElement.dataset.poetryLayout,
      width:innerWidth, scroll:document.documentElement.scrollWidth,
      articles:articles.map(article => {
        const body = article.querySelector('.source .body');
        const chunks = [...body.querySelectorAll('.poetry-stanza')];
        const stanzas = new Map();
        for (const chunk of chunks) {
          const id = chunk.dataset.poetryStanza;
          stanzas.set(id, [...(stanzas.get(id) || []), chunk.textContent]);
        }
        const text = chunks.length ? [...stanzas.values()].map(parts => parts.join('\n')).join('\n\n') : body.textContent;
        const title = article.querySelector('.source h2');
        const rectangles = [...article.querySelectorAll('.poetry-composition, .flow-row, .poetry-stanza, .source h2')]
          .filter(el => !el.classList.contains('visually-hidden'))
          .map(el => ({tag:el.className, left:el.getBoundingClientRect().left, right:el.getBoundingClientRect().right}));
        return {id:article.dataset.poetryText, text, raw:body.textContent, rectangles,
          title:title.textContent, columns:title.querySelectorAll('.flow-title-column').length,
          label:article.querySelector('.poetry-authorial-label')?.textContent,
          mode:getComputedStyle(chunks[0] || body).writingMode};
      }),
      translations:[...document.querySelectorAll('.translation .body')].map(el => ({text:el.textContent, mode:getComputedStyle(el).writingMode})),
    };
  });
  assert.equal(result.layout, layout);
  assert.ok(result.scroll <= result.width + 1, `${engineName} ${result.width}: page overflow ${JSON.stringify(result)}`);
  for (const article of result.articles) {
    assert.equal(article.text, expected.sources[article.id], `${article.id}: authored lines or stanza boundaries changed`);
    assert.equal(article.raw, expected.sources[article.id], `${article.id}: DOM copy must preserve the complete original`);
    assert.equal(article.mode, layout === 'vertical' ? 'vertical-rl' : 'horizontal-tb');
    for (const rect of article.rectangles) {
      assert.ok(rect.left >= -1 && rect.right <= result.width + 1, `${article.id} ${result.width}: clipped ${JSON.stringify(rect)}`);
    }
  }
  assert.deepEqual(result.translations.map(item => item.text), expected.translations);
  assert.ok(result.translations.every(item => item.mode === 'horizontal-tb'));
  layouts++;
  return result;
}
async function original(page, route) {
  await page.goto(base + route, {waitUntil:'load'});
  return page.evaluate(() => ({
    sources:Object.fromEntries([...document.querySelectorAll('.reader-poem[data-poetry-classical]')]
      .map(article => [article.dataset.poetryText, article.querySelector('.source .body').textContent])),
    translations:[...document.querySelectorAll('.translation .body')].map(el => el.textContent),
  }));
}
try {
  browser = await (engineName === 'webkit' ? webkit : chromium).launch();
  const context = await browser.newContext({viewport:{width:390, height:844}});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const plain = await browser.newPage({javaScriptEnabled:false, viewport:{width:390, height:844}});
  const sources = new Map();
  for (const locale of ['zh', 'zh-hans', '', 'ja', 'de', 'fr', 'ru']) {
    const prefix = locale ? '/' + locale : '';
    const route = `${prefix}/poetry/jia-yi/`;
    const expected = await original(plain, route);
    sources.set(locale, expected);
    assert.equal(Object.keys(expected.sources).length, 17);
    await page.goto(base + route, {waitUntil:'load'});
    const initial = locale === 'zh-hans' ? 'horizontal' : 'vertical';
    await inspect(page, expected, initial);
    await page.locator('button[data-poetry-layout="vertical"]').click();
    const vertical = await inspect(page, expected, 'vertical');
    const a10 = vertical.articles.find(article => article.id === 'jia-yi-a10-text');
    assert.equal(a10.columns, 1, 'short A10 title should occupy one column');
    assert.ok(a10.label);
    assert.ok(!a10.title.startsWith(a10.label));
    await page.locator('button[data-poetry-layout="horizontal"]').click();
    await inspect(page, expected, 'horizontal');
    await page.evaluate(() => localStorage.removeItem('hanpuli.poetryLayout.v1'));
  }
  for (const route of classicalRoutes) {
    const expected = await original(plain, route);
    await page.goto(base + route, {waitUntil:'load'});
    for (const width of [320, 345, 390, 768, 1280]) {
      await page.setViewportSize({width, height:844});
      await inspect(page, expected, 'vertical');
      await page.evaluate(() => {
        for (const name of ['large', 'spacing', 'measure']) document.documentElement.setAttribute('data-reading-' + name, '');
      });
      await inspect(page, expected, 'vertical');
      await page.evaluate(() => {
        for (const name of ['large', 'spacing', 'measure']) document.documentElement.removeAttribute('data-reading-' + name);
      });
    }
  }
  await page.goto(base + '/zh/poetry/jia-yi/#jia-10', {waitUntil:'load'});
  await page.locator('button[data-poetry-layout="horizontal"]').click();
  assert.equal(new URL(page.url()).searchParams.get('layout'), 'horizontal');
  assert.equal(new URL(page.url()).hash, '#jia-10');
  assert.equal(await page.locator('button[data-poetry-layout="horizontal"]').getAttribute('aria-pressed'), 'true');
  await page.goto(base + '/zh/poetry/yingtianchang-20261008/', {waitUntil:'load'});
  assert.equal(await page.evaluate(() => document.documentElement.dataset.poetryLayout), 'horizontal');
  await page.reload({waitUntil:'load'});
  assert.equal(await page.evaluate(() => document.documentElement.dataset.poetryLayout), 'horizontal');
  await page.goto(base + '/ja/poetry/jia-yi/', {waitUntil:'load'});
  await inspect(page, sources.get('ja'), 'horizontal');
  await page.goto(base + '/zh/poetry/jia-yi/?layout=vertical', {waitUntil:'load'});
  await inspect(page, sources.get('zh'), 'vertical');
  await page.evaluate(() => document.documentElement.setAttribute('data-reading-simple', ''));
  await inspect(page, sources.get('zh'), 'horizontal');
  assert.ok(await page.locator('button[data-poetry-layout="vertical"]').isDisabled());
  await page.evaluate(() => document.documentElement.removeAttribute('data-reading-simple'));
  await inspect(page, sources.get('zh'), 'vertical');

  await page.goto(base + '/zh/poetry/roof-splits/', {waitUntil:'load'});
  assert.equal(await page.locator('.poetry-layout-controls').count(), 0, 'modern authored lines remain horizontal');
  assert.equal(await page.locator('.poetry-stanza').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.poetryLayout), undefined);
  const blocked = await context.newPage();
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', {get() {throw Error('storage unavailable');}}));
  await blocked.goto(base + '/zh/poetry/jia-yi/', {waitUntil:'load'});
  await inspect(blocked, sources.get('zh'), 'vertical');
  await blocked.locator('button[data-poetry-layout="horizontal"]').click();
  await inspect(blocked, sources.get('zh'), 'horizontal');
  await blocked.goto(base + '/ja/poetry/jia-yi/', {waitUntil:'load'});
  await inspect(blocked, sources.get('ja'), 'vertical');
  const cold = await browser.newContext({viewport:{width:390, height:844}});
  const linked = await cold.newPage();
  await linked.goto(base + '/zh/poetry/jia-yi/#jia-10', {waitUntil:'load'});
  await settle(linked);
  const anchor = await linked.locator('#jia-10').boundingBox();
  assert.ok(anchor.y < 844 && anchor.y + anchor.height > 0, `vertical deep link must remain visible: ${JSON.stringify(anchor)}`);
  await cold.close();
  assert.deepEqual(errors, []);
  console.log(`poetrylayoutcheck: ${engineName}, ${layouts} layouts; ${classicalRoutes.length} classical routes; seven locales; 320–1280 px; authored lines, titles, labels, translations, preference memory, simple reading and blocked storage OK`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
