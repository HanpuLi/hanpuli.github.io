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

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(base)).ok) break; } catch { /* server starting */ }
    await sleep(100);
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const width of [520, 1024]) {
    await open(page, '/', width);
    const note = await lines(page, '#photo .section-note');
    if (note.at(-1) === 'a take.') failures.push(`EN photo note @ ${width}: orphaned “a take.”`);
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

  await open(page, '/ru/', 520);
  const navHeight = await page.locator('.section-nav').evaluate((nav) => nav.getBoundingClientRect().height);
  if (navHeight > 110) failures.push(`RU nav @ 520: ${navHeight}px high`);
  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const { root } = await client.send('DOM.getDocument');
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.hero-id p:first-child' });
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
  if (!fonts.some((font) => font.familyName.startsWith('Shippori') && font.glyphCount >= 3)) {
    failures.push(`RU Chinese name: ${fonts.map((font) => `${font.familyName} (${font.glyphCount})`).join(', ')}`);
  }
  await client.detach();

  for (const path of ['/', '/ci.html', '/poetry-voucher/shop.html?lang=en', '/poetry-voucher/make.html?lang=en']) {
    await open(page, path, 390);
    const tools = await page.locator('.reading-tools').evaluate((element) => ({
      position: getComputedStyle(element).position,
      height: element.querySelector('summary').getBoundingClientRect().height,
    }));
    if (tools.position !== 'relative' || tools.height < 44) {
      failures.push(`${path}: reading control position=${tools.position}, target=${tools.height}px`);
    }
    await page.locator('.reading-tools summary').click();
    const expanded = await page.locator('.reading-tools').evaluate((element) => ({
      panelBottom: element.querySelector('.reading-panel').getBoundingClientRect().bottom,
      headerTop: document.querySelector('header').getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    if (expanded.headerTop < expanded.panelBottom || expanded.overflow) {
      failures.push(`${path}: expanded reading panel overlaps the header or causes overflow`);
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
console.log('editorialcheck: line breaks, RU font run, reading-control flow and target size passed');
