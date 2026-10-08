#!/usr/bin/env node
// Render the paper-free vector master into browser, Apple and web-app icons.
// Full vector textures stay in docs/, which GitHub Pages excludes from the site.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const svg = await readFile(new URL('docs/site-icon/site-mark-web.svg', root));
const image = `data:image/svg+xml;base64,${svg.toString('base64')}`;
const browser = await chromium.launch({ headless: true });
try {
  const rendered = new Map();
  const render = async (size, file, scale = 1, colorScheme = 'light') => {
    const output = fileURLToPath(new URL(`assets/${file}`, root));
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
      colorScheme,
    });
    const renderedSize = Math.round(size * scale);
    const inset = Math.round((size - renderedSize) / 2);
    const background = colorScheme === 'dark' ? '#151412' : '#f5f2eb';
    await page.setContent(`<style>
      html, body { width: ${size}px; height: ${size}px; margin: 0; background: ${background}; }
      img { display: block; position: absolute; inset: ${inset}px; width: ${renderedSize}px; height: ${renderedSize}px; }
    </style><img src="${image}" alt="">`);
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: output });
    await page.close();
    rendered.set(file, await readFile(output));
    console.log(output);
  };

  for (const [size, file] of [
    [16, 'site-icon-16.png'],
    [32, 'site-icon-32.png'],
    [48, 'site-icon-48.png'],
    [64, 'site-icon-64.png'],
    [180, 'apple-touch-icon.png'],
    [192, 'site-icon-192.png'],
    [512, 'site-icon-512.png'],
  ]) {
    await render(size, file);
  }
  for (const size of [32, 64]) {
    await render(size, `site-icon-${size}-dark.png`, 1, 'dark');
  }
  await render(512, 'site-icon-maskable-512.png', 0.7);

  // ICO supports PNG-compressed entries. Keep a root fallback for user agents
  // and crawlers that request /favicon.ico without consulting the document head.
  const icoEntries = [
    [16, rendered.get('site-icon-16.png')],
    [32, rendered.get('site-icon-32.png')],
    [48, rendered.get('site-icon-48.png')],
    [64, rendered.get('site-icon-64.png')],
  ];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(icoEntries.length, 4);
  const directory = Buffer.alloc(16 * icoEntries.length);
  let offset = header.length + directory.length;
  icoEntries.forEach(([size, png], index) => {
    const start = index * 16;
    directory.writeUInt8(size, start);
    directory.writeUInt8(size, start + 1);
    directory.writeUInt8(0, start + 2);
    directory.writeUInt8(0, start + 3);
    directory.writeUInt16LE(1, start + 4);
    directory.writeUInt16LE(32, start + 6);
    directory.writeUInt32LE(png.length, start + 8);
    directory.writeUInt32LE(offset, start + 12);
    offset += png.length;
  });
  const favicon = fileURLToPath(new URL('favicon.ico', root));
  await writeFile(favicon, Buffer.concat([header, directory, ...icoEntries.map(([, png]) => png)]));
  console.log(favicon);
} finally {
  await browser.close();
}
