#!/usr/bin/env node
// Render the SVG site mark onto a paper-colored Apple touch icon.
// The SVG is the editable source; the PNG is its 180 px platform variant.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const svg = await readFile(new URL('assets/site-mark.svg', root));
const image = `data:image/svg+xml;base64,${svg.toString('base64')}`;
const output = fileURLToPath(new URL('assets/apple-touch-icon.png', root));

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 180, height: 180 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
  await page.setContent(`<style>
    html, body { width: 180px; height: 180px; margin: 0; background: #f5f2eb; }
    img { display: block; width: 180px; height: 180px; }
  </style><img src="${image}" alt="">`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: output });
} finally {
  await browser.close();
}
console.log(output);
