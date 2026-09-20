#!/usr/bin/env node
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.NOTFOUND_PORT || (28000 + (process.pid % 10000)));
const BASE = "http://127.0.0.1:" + PORT;
const cases = [
  ["", "en-GB", "locale-en", "/"],
  ["zh", "zh-Hant-HK", "locale-zh", "/zh/"],
  ["zh-hans", "zh-Hans", "locale-zh-hans", "/zh-hans/"],
  ["ja", "ja", "locale-ja", "/ja/"],
  ["de", "de", "locale-de", "/de/"],
  ["fr", "fr", "locale-fr", "/fr/"],
  ["ru", "ru", "locale-ru", "/ru/"],
];
const widths = [320, 1440];

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
  throw new Error("real-404 QA server did not start");
}

const server = spawn("python3", ["tools/serve_site.py", String(PORT)], { stdio: "ignore" });
let browser;
const failures = [];

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();

  for (const [locale, htmlLang, bodyLocale, homeHref] of cases) {
    const prefix = locale ? "/" + locale : "";

    for (const width of widths) {
      const path = prefix + "/__missing__/deep/page?source=qa&width=" + width + "#probe";
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(BASE + path, { waitUntil: "networkidle" });
      if (!response || response.status() !== 404) {
        failures.push(path + " @ " + width + ": expected HTTP 404, got " + (response?.status() ?? "no response"));
        continue;
      }

      const state = await page.evaluate(() => {
        const languageNav = document.querySelector(".page-languages");
        const current = languageNav?.querySelector("[aria-current='page']");
        const styles = [...document.styleSheets]
          .map((sheet) => sheet.href)
          .filter(Boolean)
          .map((href) => new URL(href).pathname);
        const root = document.documentElement;
        const body = document.body;
        return {
          lang: root.lang,
          bodyClass: body.className,
          homeHref: document.querySelector(".notfound-home")?.getAttribute("href"),
          currentLang: current?.getAttribute("lang"),
          stylesheetLoaded: styles.includes("/assets/site.css"),
          stylesheetLink: document.querySelector('link[rel="stylesheet"]')?.getAttribute("href"),
          scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
          innerWidth: window.innerWidth,
          alternateHrefs: [...(languageNav?.querySelectorAll("a[hreflang]") ?? [])].map((link) => ({
            hreflang: link.getAttribute("hreflang"),
            href: link.getAttribute("href"),
          })),
        };
      });

      if (state.lang !== htmlLang) {
        failures.push(path + " @ " + width + ": html lang " + state.lang + " != " + htmlLang);
      }
      if (!state.bodyClass.split(/\s+/).includes(bodyLocale)) {
        failures.push(path + " @ " + width + ": body locale class is " + state.bodyClass);
      }
      if (state.currentLang !== htmlLang) {
        failures.push(path + " @ " + width + ": language switcher current lang " + state.currentLang + " != " + htmlLang);
      }
      if (state.homeHref !== homeHref) {
        failures.push(path + " @ " + width + ": home href " + state.homeHref + " != " + homeHref);
      }
      if (!state.stylesheetLoaded || state.stylesheetLink !== "/assets/site.css") {
        failures.push(path + " @ " + width + ": root stylesheet did not load from /assets/site.css");
      }
      if (state.scrollWidth > state.innerWidth + 1) {
        failures.push(path + " @ " + width + ": horizontal overflow " + state.scrollWidth + "px > " + state.innerWidth + "px");
      }

      const tail = "/__missing__/deep/page?source=qa&width=" + width + "#probe";
      for (const item of state.alternateHrefs) {
        const target = cases.find((entry) => entry[1] === item.hreflang)?.[0];
        if (target === undefined) continue;
        const expected = target ? "/" + target + tail : tail;
        if (item.href !== expected) {
          failures.push(path + " @ " + width + ": " + item.hreflang + " switch href " + item.href + " != " + expected);
        }
      }

      const results = await new AxeBuilder({ page }).analyze();
      for (const violation of results.violations) {
        failures.push(
          path + " @ " + width + ": axe " + violation.id + ": " + violation.help +
          " (" + violation.nodes.length + " node(s))"
        );
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
  console.error("notfoundcheck: " + failures.length + " failure(s)");
  process.exit(1);
}

console.log("notfoundcheck: " + cases.length * widths.length + " real missing-path cases passed with HTTP 404, locale routing, CSS and axe");
