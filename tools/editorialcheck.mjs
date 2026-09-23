#!/usr/bin/env node
// Browser geometry alone cannot catch a punctuation mark or two words stranded on a line.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const port = 19000 + (process.pid % 10000);
const base = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const failures = [];
let browser;

async function open(page, path, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(base + path, { waitUntil: 'load' });
  await page.evaluate(async () => {
    // content-visibility:auto intentionally defers distant sections. Make their
    // actual type measurable without depending on screenshot scroll timing.
    document.querySelectorAll('section').forEach((section) => { section.style.contentVisibility = 'visible'; });
    await document.fonts.ready;
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function lines(page, selector) {
  return page.locator(selector).last().evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const result = [];
    let node;
    let previousY = null;
    while ((node = walker.nextNode())) {
      for (let index = 0; index < node.textContent.length; index += 1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        if (!rect.width) continue;
        if (previousY === null || Math.abs(rect.y - previousY) > 2) {
          result.push('');
          previousY = rect.y;
        }
        result[result.length - 1] += node.textContent[index];
      }
    }
    return result.map((line) => line.replaceAll('\u200b', '').trim());
  });
}

async function platformFonts(page, selector) {
  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const { root } = await client.send('DOM.getDocument');
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) {
    await client.detach();
    return [];
  }
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
  await client.detach();
  return fonts;
}

async function waitForAnchor(page, id) {
  try {
    await page.waitForFunction((targetId) => {
      const target = document.getElementById(targetId);
      const header = document.querySelector('.masthead');
      if (!target || !header) return false;
      const headerBottom = header.getBoundingClientRect().bottom;
      const targetTop = target.getBoundingClientRect().top;
      const title = target.querySelector('h2');
      return Math.abs(targetTop - headerBottom - 12) < 2 &&
        title && title.getBoundingClientRect().top >= headerBottom &&
        title.getBoundingClientRect().bottom <= innerHeight;
    }, id, { timeout: 1800 });
  } catch {
    // Return geometry below so one bad destination is reported with context.
  }
  return page.locator(`#${id}`).evaluate((target) => {
    const header = document.querySelector('.masthead').getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    return { top: rect.top, headerBottom: header.bottom, delta: rect.top - header.bottom - 12 };
  });
}

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(base)).ok) break; } catch { /* server starting */ }
    await sleep(100);
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const width of [320, 390, 520, 1024]) {
    await open(page, '/', width);
    const note = await lines(page, '#photo .section-note');
    if (note.at(-1) === 'a take.') failures.push(`EN photo note @ ${width}: orphaned “a take.”`);
    if (!note.some((line) => line.includes('instant film')) ||
        note.some((line) => line.endsWith('35') || line.startsWith('mm '))) {
      failures.push(`EN photo note @ ${width}: split media phrase or 35 mm unit: ${note.join(' | ')}`);
    }
  }

  for (const [path, phrases] of [
    ['/zh/', ['35 mm', '即影即有']],
    ['/zh-hans/', ['35 mm', '即时成像胶片']],
    ['/ja/', ['35 mmフィルム', 'インスタントフィルム']],
    ['/de/', ['35-mm-Film', 'Sofortbildfilm']],
    ['/fr/', ['35 mm', 'film instantané']],
    ['/ru/', ['35 мм', 'моментальная плёнка']],
  ]) {
    for (const width of [320, 390]) {
      await open(page, path, width);
      const note = await lines(page, '#photo .section-note');
      for (const phrase of phrases) {
        if (!note.some((line) => line.includes(phrase))) {
          failures.push(`${path} photo note @ ${width}: protected “${phrase}” is broken: ${note.join(' | ')}`);
        }
      }
    }
  }

  await open(page, '/fr/', 520);
  const eyebrow = await lines(page, '.hero .eyebrow');
  if (eyebrow.at(-1) === 'Londres' || eyebrow.some((line) => line.endsWith('/'))) {
    failures.push(`FR eyebrow @ 520: ${eyebrow.join(' | ')}`);
  }

  for (const width of [320, 390]) {
    await open(page, '/ja/', width);
    const heading = await lines(page, '.project-feature h3');
    const headingLeading = await page.locator('.project-feature h3').evaluate((element) => {
      const style = getComputedStyle(element);
      return parseFloat(style.lineHeight) / parseFloat(style.fontSize);
    });
    if (!heading.some((line) => line.includes('バーチャルプロダクション')) ||
        !heading.some((line) => line.includes('フットプリント')) || headingLeading < 1.12) {
      failures.push(`JA research heading @ ${width}: ${heading.join(' | ')}; leading=${headingLeading}`);
    }
  }

  await open(page, '/fr/ci.html', 320);
  const ciTitle = await lines(page, '#a2 .translation h3');
  if (ciTitle.some((line) => /^[;:!?]/u.test(line))) {
    failures.push(`FR A2 title @ 320: ${ciTitle.join(' | ')}`);
  }

  for (const width of [768, 1440, 1728]) {
    await open(page, '/contexts.html', width);
    const contextTitle = await lines(page, '#public-records h2');
    if ((width >= 1440 && contextTitle.length > 2) ||
        contextTitle.some((line) => line.endsWith('first-'))) {
      failures.push(`EN contexts heading @ ${width}: ${contextTitle.join(' | ')}`);
    }
  }

  const photoPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await photoPage.goto(base + '/', { waitUntil: 'load' });
  await photoPage.locator('.section-nav a[href="#photo"]').click();
  const firstPhoto = await waitForAnchor(photoPage, 'photo');
  await photoPage.keyboard.press('Home');
  await photoPage.waitForFunction(() => window.scrollY < 2);
  await photoPage.locator('.section-nav a[href="#photo"]').click();
  const secondPhoto = await waitForAnchor(photoPage, 'photo');
  if (Math.abs(firstPhoto.top - secondPhoto.top) > 2 || Math.abs(firstPhoto.delta) > 2 || Math.abs(secondPhoto.delta) > 2) {
    failures.push(`EN #photo repeat click: first=${JSON.stringify(firstPhoto)}, second=${JSON.stringify(secondPhoto)}`);
  }
  await photoPage.close();

  for (const width of [768, 1024, 1440, 1728]) {
    const navPage = await browser.newPage({ viewport: { width, height: 900 } });
    await navPage.goto(base + '/', { waitUntil: 'load' });
    for (const [id, headingId] of [['writing', 'writing-heading'], ['ci', 'ci-heading'], ['work', 'work-heading'], ['photo', 'photo-heading']]) {
      await navPage.locator(`.section-nav a[href="#${id}"]`).click();
      const anchor = await waitForAnchor(navPage, id);
      const visible = await navPage.locator(`#${headingId}`).evaluate((heading) => {
        const header = document.querySelector('.masthead').getBoundingClientRect();
        const title = heading.getBoundingClientRect();
        return title.top >= header.bottom && title.bottom <= innerHeight;
      });
      if (!visible || Math.abs(anchor.delta) > 2) {
        failures.push(`EN #${id} @ ${width}: heading is obscured, outside the viewport or misplaced: ${JSON.stringify({ anchor, visible })}`);
      }
    }
    await navPage.close();
  }

  await open(page, '/ru/', 520);
  const navHeight = await page.locator('.section-nav').evaluate((nav) => nav.getBoundingClientRect().height);
  if (navHeight > 110) failures.push(`RU nav @ 520: ${navHeight}px high`);
  const ruNameFonts = await platformFonts(page, '.hero-id p:first-child');
  if (!ruNameFonts.some((font) => font.familyName.startsWith('Shippori') && font.glyphCount >= 3)) {
    failures.push(`RU Chinese name: ${ruNameFonts.map((font) => `${font.familyName} (${font.glyphCount})`).join(', ')}`);
  }

  // Test the preference in a clean context and inspect the fonts Chromium
  // actually painted, not only the checkbox or data attribute.
  const cleanContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const sansPage = await cleanContext.newPage();
  await sansPage.goto(base + '/zh-hans/', { waitUntil: 'load' });
  await sansPage.evaluate(() => document.fonts.ready);
  const serifFonts = await platformFonts(sansPage, '.hero-copy');
  await sansPage.locator('.reading-tools summary').click();
  await sansPage.locator('[data-reading-pref="sans"]').check();
  await sansPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const sansFonts = await platformFonts(sansPage, '.hero-copy');
  const sansStack = await sansPage.locator('.hero-copy').evaluate((element) => getComputedStyle(element).fontFamily);
  if (sansStack !== 'var(--readable-sans)' && !sansStack.includes('system-ui')) {
    failures.push(`ZH-Hans sans preference: unexpected computed stack ${sansStack}`);
  }
  if (!serifFonts.some((font) => font.familyName.includes('Noto Serif SC')) ||
      !sansFonts.length || sansFonts.some((font) => font.familyName.includes('Noto Serif SC'))) {
    failures.push(`ZH-Hans sans preference did not replace painted serif fonts: before=${serifFonts.map((font) => font.familyName).join(', ')}, after=${sansFonts.map((font) => font.familyName).join(', ')}`);
  }
  await sansPage.goto(base + '/ru/', { waitUntil: 'load' });
  await sansPage.evaluate(() => document.fonts.ready);
  await sansPage.locator('.reading-tools summary').click();
  await sansPage.locator('[data-reading-pref="sans"]').check();
  await sansPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const ruSansFonts = await platformFonts(sansPage, '.hero-id p:first-child');
  if (!ruSansFonts.length || ruSansFonts.some((font) => font.familyName.startsWith('Shippori'))) {
    failures.push(`RU Chinese name remained in Shippori under sans preference: ${ruSansFonts.map((font) => font.familyName).join(', ')}`);
  }
  await cleanContext.close();

  for (const [path, locale] of [['/', 'EN'], ['/zh/', 'ZH-Hant'], ['/zh-hans/', 'ZH-Hans'], ['/ja/', 'JA'], ['/de/', 'DE'], ['/fr/', 'FR'], ['/ru/', 'RU']]) {
    await open(page, path, 1440);
    const numbering = await page.evaluate(() => ({
      home: document.querySelector('.project-voucher .project-index')?.textContent.trim(),
      nav: document.querySelector('.section-nav a[href="#work"] .nav-no')?.textContent.trim(),
    }));
    await page.goto(base + (path === '/' ? '/poetry-voucher/' : `${path}poetry-voucher/`), { waitUntil: 'load' });
    const overview = await page.locator('.pv-context').evaluate((context) => ({
      project: context.querySelector('span')?.textContent.trim(),
      section: context.querySelector('a')?.textContent.trim().split(/\s+/)[0],
    }));
    if (numbering.home !== '03.1' || numbering.nav !== '03' ||
        overview.project !== `${numbering.home} / 2026` || overview.section !== numbering.nav) {
      failures.push(`${locale} project numbering mismatch: ${JSON.stringify({ numbering, overview })}`);
    }
  }

  for (const width of [390, 1440]) {
    await open(page, '/', width);
    const baselines = await page.evaluate(() => {
      const index = document.querySelector('.project-voucher .project-index').getBoundingClientRect();
      const type = document.querySelector('.project-voucher .project-type').getBoundingClientRect();
      return { indexTop: index.top, typeTop: type.top, indexHeight: index.height, typeHeight: type.height };
    });
    if (Math.abs(baselines.indexTop - baselines.typeTop) > 1 || Math.abs(baselines.indexHeight - baselines.typeHeight) > 1) {
      failures.push(`Project number/type first-line alignment @ ${width}: ${JSON.stringify(baselines)}`);
    }
    await page.goto(base + '/poetry-voucher/', { waitUntil: 'load' });
    const italicCorrection = await page.locator('.pv-heading h1 em').evaluate((element) => ({
      offset: getComputedStyle(element).insetInlineStart,
      size: parseFloat(getComputedStyle(element).fontSize),
    }));
    if (Math.abs(parseFloat(italicCorrection.offset) / italicCorrection.size + .137) > .002) {
      failures.push(`Voucher italic optical correction @ ${width}: ${JSON.stringify(italicCorrection)}`);
    }
  }

  await open(page, '/', 1440);
  const languageGeometry = await page.evaluate(() => {
    const current = document.querySelector('.language-nav .current');
    const adjacent = document.querySelector('.language-nav a[lang="de"]');
    const currentLabel = current.querySelector('.language-short').getBoundingClientRect();
    const adjacentLabel = adjacent.querySelector('.language-short').getBoundingClientRect();
    return {
      currentTop: currentLabel.top,
      adjacentTop: adjacentLabel.top,
      currentHeight: current.getBoundingClientRect().height,
      adjacentHeight: adjacent.getBoundingClientRect().height,
      currentUnderline: current.getBoundingClientRect().bottom,
    };
  });
  if (Math.abs(languageGeometry.currentTop - languageGeometry.adjacentTop) > .25 ||
      Math.abs(languageGeometry.currentHeight - languageGeometry.adjacentHeight) > .25) {
    failures.push(`Selected language shifts navigation geometry: ${JSON.stringify(languageGeometry)}`);
  }
  await open(page, '/zh-hans/', 1440);
  const hansGlyph = await page.locator('.language-nav [lang="zh-Hans"] .language-short').evaluate((element) => ({
    top: getComputedStyle(element).top,
    linkHeight: element.closest('a, .current').getBoundingClientRect().height,
  }));
  if (hansGlyph.top !== '-1px' || hansGlyph.linkHeight < 44) {
    failures.push(`ZH-Hans language glyph/click target: ${JSON.stringify(hansGlyph)}`);
  }

  const ciContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ciPage = await ciContext.newPage();
  await ciPage.goto(base + '/', { waitUntil: 'load' });
  const serifCompensation = await ciPage.locator('#ci-heading').evaluate((element) => getComputedStyle(element).marginInlineStart);
  await ciPage.locator('.reading-tools summary').click();
  await ciPage.locator('[data-reading-pref="sans"]').check();
  const sansCompensation = await ciPage.locator('#ci-heading').evaluate((element) => getComputedStyle(element).marginInlineStart);
  if (parseFloat(serifCompensation) >= -1 || parseFloat(sansCompensation) !== 0) {
    failures.push(`EN Ci optical correction should apply to Garamond only: serif=${serifCompensation}, sans=${sansCompensation}`);
  }
  await ciPage.goto(base + '/poetry-voucher/', { waitUntil: 'load' });
  const overviewSansCorrection = await ciPage.locator('.pv-heading h1 em').evaluate((element) => getComputedStyle(element).insetInlineStart);
  await ciPage.goto(base + '/poetry-voucher/shop.html?lang=en', { waitUntil: 'load' });
  const shopSansCorrection = await ciPage.locator('.shop-title-italic').evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
  if (parseFloat(overviewSansCorrection) !== 0 || shopSansCorrection !== 0) {
    failures.push(`Voucher optical correction should switch off in sans mode: overview=${overviewSansCorrection}, shop=${shopSansCorrection}px`);
  }
  await ciContext.close();

  await open(page, '/poetry-voucher/shop.html?lang=en', 1440);
  const shopItalicCorrection = await page.locator('.shop-title-italic').evaluate((element) => ({
    transformX: new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
    size: parseFloat(getComputedStyle(element).fontSize),
  }));
  if (Math.abs(shopItalicCorrection.transformX / shopItalicCorrection.size + .137) > .002) {
    failures.push(`Shop Voucher italic optical correction: ${JSON.stringify(shopItalicCorrection)}`);
  }

  for (const path of ['/poetry-voucher/', '/poetry-voucher/shop.html?lang=en']) {
    await open(page, path, 1440);
    for (const selector of ['.pv-cta', '.pv-text-link', '.shop-enter']) {
      const link = page.locator(selector).first();
      if (await link.count()) {
        const decoration = await link.evaluate((element) => getComputedStyle(element).textDecorationLine);
        if (decoration.includes('underline')) failures.push(`${path} ${selector}: duplicated text underline (${decoration})`);
      }
    }
  }

  for (const path of ['/', '/ci.html', '/poetry-voucher/', '/poetry-voucher/shop.html?lang=en', '/poetry-voucher/make.html?lang=en']) {
    for (const width of [320, 390]) {
      await open(page, path, width);
      const tools = await page.locator('.reading-tools').evaluate((element) => ({
        position: getComputedStyle(element).position,
        height: element.querySelector('summary').getBoundingClientRect().height,
        insideHeader: Boolean(element.closest('header')),
      }));
      if (tools.position !== 'relative' || tools.height < 44 || !tools.insideHeader) {
        failures.push(`${path} @ ${width}: reading control position=${tools.position}, target=${tools.height}px`);
      }
      await page.locator('.reading-tools summary').click();
      const expanded = await page.locator('.reading-tools').evaluate((element) => ({
        panel: element.querySelector('.reading-panel').getBoundingClientRect().toJSON(),
        header: element.closest('header').getBoundingClientRect().toJSON(),
        paddingLeft: parseFloat(getComputedStyle(element.closest('header')).paddingLeft),
        paddingRight: parseFloat(getComputedStyle(element.closest('header')).paddingRight),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      if (expanded.panel.bottom > expanded.header.bottom + 1 ||
          expanded.panel.left < expanded.header.left + expanded.paddingLeft - 1 ||
          expanded.panel.right > expanded.header.right - expanded.paddingRight + 1 || expanded.overflow) {
        failures.push(`${path} @ ${width}: expanded reading panel leaves the header content width or causes overflow: ${JSON.stringify(expanded)}`);
      }
    }
  }

  for (const path of ['/', '/ci.html', '/poetry-voucher/']) {
    await open(page, path, 1440);
    const alignment = await page.locator('.reading-tools summary').evaluate((summary) => {
      const header = summary.closest('header');
      const style = getComputedStyle(header);
      const edge = header.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
      return { right: summary.getBoundingClientRect().right, edge };
    });
    if (Math.abs(alignment.right - alignment.edge) > 1) {
      failures.push(`${path} @ 1440: reading control is detached from header alignment: ${JSON.stringify(alignment)}`);
    }
  }
  await page.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('editorialcheck: click navigation, line breaks, locale numbering, painted fonts, typography alignment and reading-control flow passed');
