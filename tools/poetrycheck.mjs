#!/usr/bin/env node
// Browser-free invariants for the public studio. Rendering is tested in-browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const file = path => readFileSync(new URL('../' + path, import.meta.url));
const read = path => file(path).toString('utf8');
const sha256 = path => createHash('sha256').update(file(path)).digest('hex');
const source = read('content/poetry-voucher-app/gallery.js');
const { quotePoem, automaticPayment, wrapText, typeSizes, bitmapFace, receiptReference } = vm.runInNewContext(
  source.split('const $=')[0] + ';({quotePoem,automaticPayment,wrapText,typeSizes,bitmapFace,receiptReference})'
);
const count = parts => parts.reduce((sum, part) => sum + part.value * part.count, 0);
const sampleRef=receiptReference(new Date('2026-09-22T12:00:00Z'),Uint8Array.from([0x12,0x34,0x56,0x78]));
assert.equal(sampleRef,'260922419896');
assert.match(sampleRef,/^\d{12}$/);
assert.equal(quotePoem('').price, 0);
const base = quotePoem('春風吹\n\n雨聲來');
assert.equal(base.characters, 6);
assert.equal(base.lines, 2);
assert.equal(base.stanzas, 2);
assert.equal(quotePoem('é').price, quotePoem('e\u0301').price);
const extra = quotePoem('春風吹\n\n雨聲來', 'English', 'site', true);
assert.equal(extra.price, base.price + 3 * 199);
assert.equal(extra.characters, base.characters);
assert(!base.items.some(item=>item.id==='font'));
assert.equal(quotePoem('春風吹\n\n雨聲來','','bitmap').price,base.price);
assert.equal(quotePoem('春風吹\n\n雨聲來','','site').price,base.price+199);
assert.equal(extra.items.find(item=>item.id==='font').receipt,'WEBSITE TYPEFACES');
for(const poem of ['A poem','詩詞','诗词','詩とひらがな','Größe für Wörter','Été à Noël','Стихотворение Ёжик']){
  const pixel=quotePoem(poem,'','bitmap'),site=quotePoem(poem,'','site');
  assert(!pixel.items.some(item=>item.id==='font'));
  assert.equal(site.price,pixel.price+199);
  assert.equal(site.items.find(item=>item.id==='font').label,'網站字體版本');
}
assert.deepEqual(Array.from(typeSizes('bitmap')),[24,36]);
assert.deepEqual(Array.from(typeSizes('site')),[22,24,26]);
assert.equal(bitmapFace('zh-Hant'),'FusionPixelZhHK');
assert.equal(bitmapFace('zh-Hans'),'FusionPixelZhHans');
assert.equal(bitmapFace('ja'),'FusionPixelJa');
for(const locale of ['en','de','fr','ru'])assert.equal(bitmapFace(locale),'FusionPixelLatin');
const pixelFonts={
  'assets/fonts/fusion-pixel-12px-latin.woff2':'095cfda45b63eedc1e985da815ef73c1c910e698b5632098076af83738f109e1',
  'assets/fonts/fusion-pixel-12px-zh-hans.woff2':'01559eceaa1bda8d59bf4a44ab95674c346ffd3a25582eea201947324e707a2a',
  'assets/fonts/fusion-pixel-12px-zh-hk.woff2':'573425df4584b6b6d03be5177273d8d5eeb3261aaf7b1aca9a41576b6299344c',
  'assets/fonts/fusion-pixel-12px-ja.woff2':'1ddc7d7112d8deb626c1ab1714b180983d637c590a4c516dcb0277a100db573b'
};
for(const [path,hash] of Object.entries(pixelFonts))assert.equal(sha256(path),hash,path);
const studioCss=read('content/poetry-voucher-app/studio.css');
for(const family of ['FusionPixelLatin','FusionPixelZhHans','FusionPixelZhHK','FusionPixelJa'])assert(studioCss.includes(`font-family:${family};`),family);
assert(!studioCss.includes('fusion-pixel-12px-zh-hant.woff2'));
assert(extra.items.every(item => item.amount % 100 === 99));
const line='燭暗蛩寒簾影瘦，殘酲猶帶微温。';
const wrapped=wrapText(line,text=>[...text].length*24);
assert.equal(wrapped.join(''),line);
assert.equal(wrapped[0],'燭暗蛩寒簾影瘦，');
assert.equal(wrapped[1],'殘酲猶帶微温。');
assert(wrapped.every(text=>text.length*24<=352));
let scenes = 0;
for (let price = 1; price <= 10000; price += 7) {
  for (const roll of [0, 0.499, 0.5, 0.749, 0.75, 0.899, 0.9, 0.999]) {
    for (const cashRoll of [0, 0.099, 0.1, 0.549, 0.55, 0.849, 0.85, 0.999]) {
      const payment = automaticPayment(price, roll, cashRoll);
      assert(payment.tender >= price);
      assert.equal(payment.tender - price, payment.change);
      assert.equal(payment.shortfall, 0);
      assert.equal(count(payment.changeParts), payment.change);
      if (payment.method === 'cash') assert.equal(count(payment.notes), payment.tender);
      if (payment.mode === 'coins') {
        assert(price <= 1000);
        assert(payment.notes.every(part => part.value <= 200));
      }
      scenes++;
    }
  }
}
assert.equal(automaticPayment(499, 0.95, 0.5).change, 1);
assert.equal(automaticPayment(499, 0.95, 0.05).change, 0);
const { localeRows, localeNames } = vm.runInNewContext(
  read('content/poetry-voucher-app/i18n.js').split('const traditionalOverrides')[0] + ';({localeRows,localeNames})'
);
assert.equal(localeNames.length, 7);
assert.equal(new Set(localeRows.map(row => row[0])).size, localeRows.length);
assert(localeRows.every(row => row.length === 7 && row.every(value => typeof value === 'string' && value.trim())));
const data = JSON.parse(read('content/poetry-voucher-app/editions.json'));
assert.equal(new Set(data.works.map(work => work.id)).size, data.works.length);
assert(data.works.some(work => work.id === 'ci-b3'));
for (const work of data.works) {
  const url = new URL(work.source_url);
  assert.equal(url.origin, 'https://hanpuli.github.io');
  assert(['/ci.html', '/shi.html'].includes(url.pathname));
  assert(url.hash);
  assert(work.title && work.poem);
}
for (const file of ['gallery.js', 'i18n.js', 'editions.json', 'studio.css']) {
  const text = read('content/poetry-voucher-app/' + file);
  assert(!/tail95239f|100\.99\.73|192\.168\.|\/api\/print|\/dev\/|Bearer\s|sendBeacon|WebSocket/.test(text), file + ': private endpoint or telemetry');
}
assert.deepEqual([...source.matchAll(/fetch\(([^)]+)\)/g)].map(match => match[1]), ["'editions.json'"]);
assert(!/localStorage|sessionStorage|indexedDB|innerHTML/.test(source));
console.log(`poetrycheck: ${scenes} payment cases, pricing, ${localeRows.length} translation rows, ${data.works.length} public works and privacy invariants OK`);
