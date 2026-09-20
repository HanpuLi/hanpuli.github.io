#!/usr/bin/env node
import { spawn } from "node:child_process";
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
  `${axeLocales.size * pageSuffixes.length * axeWidths.size} representative axe scans passed`
);
