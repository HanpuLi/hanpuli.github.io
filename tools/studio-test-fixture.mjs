// The retired Studio is a test-only renderer fixture, never a public app route.
import {readFile} from 'node:fs/promises';
export async function installStudioFixture(page, base) {
  const body = await readFile(new URL('../templates/poetry-voucher-studio.html', import.meta.url), 'utf8');
  await page.route(base + '/poetry-voucher/make.html*', route => route.fulfill({status:200, contentType:'text/html; charset=utf-8', body}));
}
