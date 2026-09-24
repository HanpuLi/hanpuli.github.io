#!/usr/bin/env node
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.TUNER_PORT || (29000 + (process.pid % 10000)));
const BASE = `http://127.0.0.1:${PORT}`;
const failures = [];
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/?tune=1`);
      if (response.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error("Design Tuner server did not start");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const server = spawn("python3", ["tools/serve_site.py", String(PORT), "--tune"], {
  cwd: process.cwd(),
  stdio: "ignore",
});

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error)));

  await page.goto(`${BASE}/?tune=1`, { waitUntil: "load" });
  await page.waitForSelector(".design-tuner");

  expect(await page.locator(".design-tuner").count() === 1, "tuned preview should contain one tuner panel");
  expect(await page.locator(".design-tuner-grid-overlay i").count() === 12, "page grid overlay should contain 12 columns");
  expect(await page.locator('[data-visual-range="width"]').count() === 1, "element width should use a visual range control");
  expect(await page.locator('[data-box-prop="margin-top"]').count() === 1, "box model should expose numeric side controls");
  expect(await page.locator('[data-grid-col]').count() === 12, "element grid editor should render 12 visual columns");

  // Existing global tuning remains available.
  const beforeGlobal = await page.$eval(".site-home .hero h1", el => getComputedStyle(el).fontSize);
  await page.$eval('[data-control="hero-size"]', el => {
    el.value = "150";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(await page.$eval(".site-home .hero h1", el => getComputedStyle(el).fontSize) === "150px", "global hero-size control should still work");

  const originalHTML = await page.$eval("#hero-title", el => el.innerHTML);
  await page.click("[data-pick]");
  await page.click("#hero-title");

  expect(await page.locator("[data-visual-controls]").isVisible(), "visual controls should appear after selecting an element");
  expect(await page.locator(".design-tuner-selection-box").isVisible(), "selected element should have an overlay");
  expect((await page.locator("[data-selection-selector]").textContent())?.includes("#hero-title"), "stable selector should be shown");

  // Width: visual slider + number field.
  await page.$eval('[data-visual-number="width"]', el => {
    el.value = "500";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(await page.$eval("#hero-title", el => getComputedStyle(el).width) === "500px", "visual width control should yield 500px");
  expect(await page.$eval(".hero-cover", el => getComputedStyle(el).width) !== "500px", "element width must not spill to another element");

  // Box model: numeric steppers, not CSS text.
  await page.$eval('[data-box-prop="margin-top"]', el => {
    el.value = "12";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(await page.$eval("#hero-title", el => getComputedStyle(el).marginTop) === "12px", "box model margin-top should apply");

  // Typography: visual slider.
  await page.$eval('[data-style-number="font-size"]', el => {
    el.value = "120";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(await page.$eval("#hero-title", el => getComputedStyle(el).fontSize) === "120px", "visual font-size control should apply");

  // Position nudge uses individual translate without forcing absolute positioning.
  await page.click('[data-nudge="1,0"]');
  expect((await page.$eval("#hero-title", el => getComputedStyle(el).translate)).includes("1px"), "nudge control should translate selected element");

  // Visual 12-column editor: drag columns 2 through 6.
  await page.locator('[data-grid-col="2"]').dispatchEvent("pointerdown", { pointerId: 1, button: 0 });
  await page.locator('[data-grid-col="6"]').dispatchEvent("pointerenter", { pointerId: 1, buttons: 1 });
  await page.locator("body").dispatchEvent("pointerup", { pointerId: 1, button: 0 });
  const gridColumn = await page.$eval("#hero-title", el => getComputedStyle(el).gridColumn);
  expect(gridColumn.includes("2") && gridColumn.includes("7"), `visual grid editor should set columns 2 / 7, got ${gridColumn}`);

  // Display choices are buttons rather than a freeform text box.
  await page.click('[data-segment-prop="display"][data-segment-value="block"]');
  expect(await page.$eval("#hero-title", el => getComputedStyle(el).display) === "block", "segmented display control should apply");

  // Advanced CSS remains available as a fallback only.
  await page.locator("details.design-tuner__advanced summary").click();
  const advancedMax = page.locator('[data-advanced-prop="max-width"]');
  await advancedMax.fill("620px");
  await advancedMax.press("Tab");
  expect(await page.$eval("#hero-title", el => getComputedStyle(el).maxWidth) === "620px", "advanced CSS fallback should still work");

  // Direct text editing remains primary.
  await page.click("[data-edit-text]");
  expect(await page.getAttribute("#hero-title", "contenteditable") === "true", "page text editing should enable contenteditable");
  await page.locator("#hero-title").press("End");
  await page.locator("#hero-title").pressSequentially(" X");
  await page.click("[data-edit-text]");

  // Exact replacement remains inside a disclosure.
  await page.locator("details.design-tuner__details").first().locator("summary").click();
  await page.locator("[data-element-text]").fill("Temporary title");
  await page.click("[data-replace-text]");
  expect(await page.$eval("#hero-title", el => el.textContent) === "Temporary title", "exact text replacement should work");

  const elementOverride = await page.$eval("#design-tuner-overrides", el => el.textContent || "");
  expect(elementOverride.includes("#hero-title"), "generated CSS should target the selected element");
  expect(elementOverride.includes("margin-top: 12px"), "generated CSS should contain box-model change");
  expect(elementOverride.includes("translate: 1px 0px"), "generated CSS should contain nudge change");

  await page.click("[data-reset-element]");
  expect(await page.$eval("#hero-title", el => el.innerHTML) === originalHTML, "Reset selected should restore original markup");
  expect(await page.$eval("#hero-title", el => getComputedStyle(el).width) !== "500px", "Reset selected should remove visual width override");

  await page.click("[data-reset]");
  expect(await page.$eval(".site-home .hero h1", el => getComputedStyle(el).fontSize) === beforeGlobal, "Reset all should restore global tuning");

  const anchorLink = await page.$eval('.section-nav a[href^="#"]', el => ({
    attr: el.getAttribute("href"),
    after: getComputedStyle(el, "::after").content
  }));
  expect(anchorLink.attr?.startsWith("#"), "same-page anchors should remain hash links");
  expect(!/external|外站|外部|extern|externe|внеш/.test(anchorLink.after || ""), "same-page anchors must not receive an external-link label");

  const internalLink = await page.$eval('.language-nav a[href]', el => ({
    attr: el.getAttribute("href"),
    resolved: el.href,
    after: getComputedStyle(el, "::after").content
  }));
  expect(internalLink.attr?.includes("tune=1"), "cross-page internal navigation should retain tune=1");
  expect(internalLink.attr?.startsWith("/"), "cross-page internal href should stay site-relative in tuner mode");
  expect(!internalLink.attr?.startsWith("http://127.0.0.1"), "internal href attribute should not become a localhost absolute URL");
  expect(!/external|外站|外部|extern|externe|внеш/.test(internalLink.after || ""), "internal links must not receive an external-link label in tuner mode");

  await page.setViewportSize({ width: 390, height: 844 });
  const panelRect = await page.$eval(".design-tuner", el => {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  });
  expect(panelRect.left >= 0 && panelRect.right <= 390.5, `mobile tuner should stay inside viewport, got ${JSON.stringify(panelRect)}`);

  await page.goto(`${BASE}/`, { waitUntil: "load" });
  expect(await page.locator(".design-tuner").count() === 0, "ordinary preview must not inject the tuner");
  expect(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

if (failures.length) {
  console.error("Design Tuner QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Design Tuner QA passed.");
