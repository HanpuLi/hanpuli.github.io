#!/usr/bin/env node
// Render the high-resolution source mark into browser and Apple icons.
// The SVG embeds the cropped high-resolution artwork.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const svg = await readFile(new URL('assets/site-mark.svg', root));
const image = `data:image/svg+xml;base64,${svg.toString('base64')}`;
const browser = await chromium.launch({ headless: true });
try {
  for (const [size, file] of [[64, 'site-icon-64.png'], [180, 'apple-touch-icon.png']]) {
    const output = fileURLToPath(new URL(`assets/${file}`, root));
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    await page.setContent(`<style>
      html, body { width: ${size}px; height: ${size}px; margin: 0; }
      img { display: block; width: ${size}px; height: ${size}px; }
    </style><img src="${image}" alt="">`);
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: output });
    await page.close();
    console.log(output);
  }
} finally {
  await browser.close();
}
