#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.PORT || (18000 + (process.pid % 10000)));
const BASE = `http://127.0.0.1:${PORT}`;
const locales = ["", "zh", "zh-hans", "ja", "de", "fr", "ru"];
const pageSuffixes = [
  "",
  "ci.html",
  "shi.html",
  "about.html",
  "writing/trainspotting/",
  "poetry-voucher/",
  "404.html",
];
const widths = [320, 390, 520, 640, 768, 900, 1024, 1440, 1728];
const axeWidths = new Set([390, 1440]);
const axeLocales = new Set(["", "zh-hans"]);

function pagePath(locale, suffix) {
  const prefix = locale ? `/${locale}/` : "/";
  return prefix + suffix;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // Server is not ready yet.
    }
    await sleep(100);
  }
  throw new Error("local QA server did not start");
}

function overlap(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  stdio: "ignore",
});
let browser;
const failures = [];

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();

  for (const locale of locales) {
    for (const suffix of pageSuffixes) {
      const path = pagePath(locale, suffix);
      await page.setViewportSize({ width: widths[0], height: 900 });
      const response = await page.goto(BASE + path, { waitUntil: "load" });
      if (!response || !response.ok()) {
        failures.push(`${path}: HTTP ${response?.status() ?? "no response"}`);
        continue;
      }
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
      });

      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        // Reserve the scrollbar width at the tablet boundary so local
        // Chromium exercises the same content width as Linux CI.
        await page.evaluate((reserveScrollbar) => {
          document.documentElement.style.inlineSize = reserveScrollbar
            ? "calc(100% - 16px)"
            : "";
        }, width === 768);
        await page.evaluate(() => new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));

        const geometry = await page.evaluate(() => {
          const root = document.documentElement;
          const body = document.body;
          const labelFor = (el) => (
            el.getAttribute("aria-label") || el.textContent || el.tagName
          ).trim().replace(/\s+/g, " ");
          const candidates = [...document.querySelectorAll(
            "header nav a, header nav [aria-current='page'], .about-toc a, .reading-tools summary, .reading-tools button"
          )]
            .filter((el) => {
              const style = getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              const visible = typeof el.checkVisibility === "function"
                ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
                : style.visibility !== "hidden" && style.display !== "none";
              return visible &&
                style.pointerEvents !== "none" &&
                rect.width > 0 &&
                rect.height > 0;
            })
            .map((el) => {
              const rect = el.getBoundingClientRect();
              return {
                label: labelFor(el),
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
              };
            });
          const clippedNavItems = [...document.querySelectorAll(
            ".section-nav > *, .page-nav > *"
          )]
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map(labelFor);
          let notfoundHeadingLines = null;
          const notfoundHeading = document.querySelector(".notfound-copy h1");
          if (notfoundHeading) {
            const range = document.createRange();
            range.selectNodeContents(notfoundHeading);
            notfoundHeadingLines = new Set(
              [...range.getClientRects()]
                .filter((rect) => rect.width > 0 && rect.height > 0)
                .map((rect) => Math.round(rect.y))
            ).size;
          }
          return {
            scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
            innerWidth: window.innerWidth,
            candidates,
            clippedNavItems,
            notfoundHeadingLines,
          };
        });

        if (geometry.scrollWidth > geometry.innerWidth + 1) {
          failures.push(
            `${path} @ ${width}: horizontal overflow ${geometry.scrollWidth}px > ${geometry.innerWidth}px`
          );
        }
        if (geometry.clippedNavItems.length) {
          failures.push(
            `${path} @ ${width}: clipped nav item(s): ${geometry.clippedNavItems.join(" / ")}`
          );
        }
        if (width >= 900 && geometry.notfoundHeadingLines > 2) {
          failures.push(
            `${path} @ ${width}: 404 quotation wraps to ${geometry.notfoundHeadingLines} lines`
          );
        }

        for (let i = 0; i < geometry.candidates.length; i += 1) {
          for (let j = i + 1; j < geometry.candidates.length; j += 1) {
            const a = geometry.candidates[i];
            const b = geometry.candidates[j];
            if (overlap(a, b) > 2) {
              failures.push(
                `${path} @ ${width}: interactive targets overlap: "${a.label}" / "${b.label}"`
              );
            }
          }
        }

        if (axeWidths.has(width) && axeLocales.has(locale)) {
          const results = await new AxeBuilder({ page }).analyze();
          for (const violation of results.violations) {
            failures.push(
              `${path} @ ${width}: axe ${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`
            );
          }
        }
      }
    }
  }

  // The maker is deliberately separate from the static project page.
  await page.goto(BASE + '/poetry-voucher/make.html?lang=en');
  await page.locator('#full-pdf').waitFor({ state: 'visible' });
  if(await page.locator('#font').inputValue()!=='bitmap'||await page.locator('#price').inputValue()!=='2.99')failures.push('studio: default bitmap/B3 base price is wrong');
  await page.locator('#size').selectOption('36');
  await page.locator('#font').selectOption('site');
  if(await page.locator('#size').inputValue()!=='24'||await page.locator('#price').inputValue()!=='4.98')failures.push('studio: Mincho surcharge or size reset is wrong');
  await page.locator('#font').selectOption('bitmap');
  if(await page.locator('#price').inputValue()!=='2.99')failures.push('studio: bitmap retains a font surcharge');
  await page.locator('#generate').click();
  await page.locator('#full-pdf').waitFor({ state: 'visible' });
  const studioWidths = [320, 390, 768, 1440];
  for (const locale of ['en', 'zh-Hant', 'zh-Hans', 'ja', 'de', 'fr', 'ru']) {
    const originalProof = await page.locator('#full-pdf').getAttribute('href');
    await page.locator('#ui-locale').selectOption(locale);
    if (await page.locator('#full-pdf').getAttribute('href') !== originalProof) {
      failures.push(`studio ${locale}: locale switch regenerated the proof`);
    }
    for (const width of studioWidths) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) failures.push(`studio ${locale} @ ${width}: horizontal overflow`);
      if (['en', 'zh-Hans'].includes(locale) && axeWidths.has(width)) {
        const results = await new AxeBuilder({ page }).analyze();
        for (const violation of results.violations) {
          failures.push(`studio ${locale} @ ${width}: axe ${violation.id}: ${violation.help}`);
        }
      }
    }
  }
  await page.locator('#work').selectOption('custom');
  await page.locator('#title').fill('Browser QA');
  await page.locator('#poem').fill('One line\n\nAnother line');
  await page.locator('#generate').click();
  await page.locator('#full-pdf').waitFor({ state: 'visible' });
  const downloadReady = page.waitForEvent('download');
  await page.locator('#full-pdf').click();
  const download = await downloadReady;
  const pdfBytes = await readFile(await download.path());
  const imageWidth = await page.locator('#full-image').evaluate(image => image.naturalWidth);
  if (!pdfBytes.subarray(0,8).equals(Buffer.from('%PDF-1.4')) || imageWidth !== 384) {
    failures.push('studio: invalid generated PDF or PNG');
  }
  await page.locator('#poem').fill('An edit after generation');
  if (await page.locator('#full-pdf').isVisible()) failures.push('studio: stale download still available after edit');

  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(`browsercheck: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log(
  `browsercheck: ${locales.length * pageSuffixes.length * widths.length} geometry cases and ` +
  `${axeLocales.size * pageSuffixes.length * axeWidths.size} representative axe scans passed; ` +
  'studio: 28 geometry cases, 4 axe scans, locale stability and custom export passed'
);
