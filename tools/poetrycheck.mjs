#!/usr/bin/env node
// Browser-free invariants for the public studio. Rendering is tested in-browser.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const file = path => readFileSync(new URL('../' + path, import.meta.url));
const read = path => file(path).toString('utf8');
const sha256 = path => createHash('sha256').update(file(path)).digest('hex');
const source = read('content/poetry-voucher-app/gallery.js');
const { quotePoem, automaticPayment, wrapText, typeSizes, bitmapFace, receiptReference, receiptTaxCode, vatSummary, receiptMeta, receiptItemLine, receiptItemRows, itemQuantity, itemUnitPrice, itemAmount, sku, TARIFF, UK_CASH, PAYMENT_SCENE, RECEIPT_CONFIG, PAPER_CONFIG, TYPE_CONFIG, SKU_DEFINITIONS } = vm.runInNewContext(
  source.split('const $=')[0] + ';({quotePoem,automaticPayment,wrapText,typeSizes,bitmapFace,receiptReference,receiptTaxCode,vatSummary,receiptMeta,receiptItemLine,receiptItemRows,itemQuantity,itemUnitPrice,itemAmount,sku,TARIFF,UK_CASH,PAYMENT_SCENE,RECEIPT_CONFIG,PAPER_CONFIG,TYPE_CONFIG,SKU_DEFINITIONS})'
);
const count = parts => parts.reduce((sum, part) => sum + part.value * part.count, 0);
assert.equal(Object.values(PAYMENT_SCENE.weights).reduce((sum,value)=>sum+value,0),1);
assert(Object.values(RECEIPT_CONFIG.columns).reduce((sum,value)=>sum+value,0)+3<=RECEIPT_CONFIG.lineChars);
assert.equal(RECEIPT_CONFIG.lineChars*PAPER_CONFIG.receiptCellDots+PAPER_CONFIG.receiptInsetDots*2,PAPER_CONFIG.printableDots);
assert.equal(PAPER_CONFIG.paperMm*PAPER_CONFIG.dotsPerMm,PAPER_CONFIG.printableDots+PAPER_CONFIG.pdfSideMarginDots*2);
const sampleRef=receiptReference(new Date('2026-09-22T12:00:00Z'),Uint8Array.from([0x12,0x34,0x56,0x78]));
assert.equal(sampleRef,'260922419896');
assert.match(sampleRef,/^\d{12}$/);
assert('VOUCHER'.length+RECEIPT_CONFIG.customWorkCode.length+1+sampleRef.length<=RECEIPT_CONFIG.lineChars,
  'custom voucher reference must fit on the receipt line');
assert.equal(quotePoem('').price, 0);
const base = quotePoem('春風吹\n\n雨聲來');
assert.equal(base.characters, 6);
assert.equal(base.lines, 2);
assert.equal(base.stanzas, 2);
assert.equal(quotePoem('é').price, quotePoem('e\u0301').price);
const extra = quotePoem('春風吹\n\n雨聲來', 'English', 'site', true);
const pairedReceipts={en:'ENGLISH TRANSLATION','zh-Hans':'SIMPLIFIED CHINESE',ja:'JAPANESE TRANSLATION',de:'GERMAN TRANSLATION',fr:'FRENCH TRANSLATION',ru:'RUSSIAN TRANSLATION'};
for(const [locale,receipt] of Object.entries(pairedReceipts)){
  const item=Array.from(quotePoem('春風吹','paired text','bitmap',false,locale).items).find(item=>item.id==='translation');
  assert.equal(item.receipt,receipt,locale);
  assert.equal(item.label,locale==='zh-Hans'?'附加簡體版':'附加翻譯',locale);
}
for(const [locale,receipt] of Object.entries({en:'ENGLISH TRANSLATION',ja:'JAPANESE TRANSLATION',de:'GERMAN TRANSLATION',fr:'FRENCH TRANSLATION',ru:'RUSSIAN TRANSLATION'})){
  const translated=quotePoem('春風吹','translated','bitmap',false,locale);
  assert.equal(translated.items.find(item=>item.id==='translation').receipt,receipt);
  assert.equal(translated.price,quotePoem('春風吹').price+TARIFF.addOn);
  assert.equal(vatSummary(translated.items)[0].gross,translated.price);
}
assert.equal(TARIFF.version,'PV3');
assert.equal(extra.price, base.price + 3 * TARIFF.addOn);
assert.equal(extra.characters, base.characters);
assert.deepEqual(Array.from(extra.items,item=>item.id),['poem','font','translation','custom']);
assert.equal(extra.items.reduce((sum,item)=>sum+itemQuantity(item),0),4);
assert(extra.items.every(item=>itemQuantity(item)===1&&itemUnitPrice(item)===itemAmount(item)));
assert.equal(extra.items.reduce((sum,item)=>sum+itemAmount(item),0),extra.price);
const twoUnits=sku('translation',TARIFF.addOn,2);
assert.equal(itemQuantity(twoUnits),2);
assert.equal(itemUnitPrice(twoUnits),TARIFF.addOn);
assert.equal(itemAmount(twoUnits),TARIFF.addOn*2);
assert.equal(receiptItemRows(twoUnits,'B3')[0].slice(0,3).trim(),'2');
assert.equal(receiptItemRows(twoUnits,'B3')[0].slice(16,22).trim(),'1.99');
assert.equal(receiptItemRows(twoUnits,'B3')[0].slice(23,29).trim(),'3.98A');
assert.equal(vatSummary([twoUnits])[0].gross,398);
assert.throws(()=>itemAmount({...twoUnits,amount:199}),/does not match/);
const baseTax=Array.from(vatSummary(base.items),row=>({...row}));
assert.equal(baseTax.length,1);
assert.equal(baseTax[0].code,'A');
assert.equal(baseTax[0].rate,20);
assert.equal(baseTax[0].gross,base.price);
assert.equal(baseTax[0].net+baseTax[0].vat,base.price);
const sampleTax=Array.from(vatSummary([{...SKU_DEFINITIONS.poem,amount:299}]),row=>({...row}));
assert.deepEqual(sampleTax,[{rate:20,code:'A',gross:299,net:249,vat:50}]);
const extraTax=Array.from(vatSummary(extra.items),row=>({...row}));
assert.deepEqual(extraTax.map(row=>row.rate),[20]);
assert.equal(extraTax.reduce((sum,row)=>sum+row.gross,0),extra.price);
assert(extraTax.every(row=>row.net+row.vat===row.gross));
assert.equal(receiptTaxCode(extra.items.find(item=>item.id==='font')),'A');
assert.deepEqual(Object.fromEntries(Object.entries(SKU_DEFINITIONS).map(([id,item])=>[id,[item.taxCode,item.taxRate]])),{
  poem:['A',20],font:['A',20],translation:['A',20],custom:['A',20]
});
const meta={...receiptMeta(sampleRef)},metaAgain={...receiptMeta(sampleRef)},otherMeta={...receiptMeta('260922123456')};
assert.deepEqual(meta,metaAgain);
assert.equal(meta.store,RECEIPT_CONFIG.merchant.store);
assert.equal(meta.till,RECEIPT_CONFIG.merchant.till);
assert.equal(meta.terminal,RECEIPT_CONFIG.merchant.terminal);
assert.equal(meta.transaction,sampleRef.slice(-RECEIPT_CONFIG.referenceDigits));
assert.equal(meta.paymentRef,RECEIPT_CONFIG.paymentRefPrefix+sampleRef.slice(-RECEIPT_CONFIG.paymentRefDigits));
assert.equal(meta.operator.length,RECEIPT_CONFIG.operatorDigits);
assert(/^\d+$/.test(meta.operator));
assert(Number(meta.operator)>=1&&Number(meta.operator)<=RECEIPT_CONFIG.operatorCount);
assert.equal(meta.cardEnding.length,RECEIPT_CONFIG.cardEndingDigits);
assert(/^\d+$/.test(meta.cardEnding));
assert.notEqual(meta.cardEnding,'0'.repeat(RECEIPT_CONFIG.cardEndingDigits));
assert.equal(meta.auth.length,RECEIPT_CONFIG.authLength);
assert(/^[A-Z0-9]+$/.test(meta.auth));
assert(RECEIPT_CONFIG.cardEntries.includes(meta.entry));
assert.notDeepEqual({operator:meta.operator,cardEnding:meta.cardEnding,auth:meta.auth,entry:meta.entry},{operator:otherMeta.operator,cardEnding:otherMeta.cardEnding,auth:otherMeta.auth,entry:otherMeta.entry});
const metaPopulation=Array.from({length:100},(_,i)=>receiptMeta('260922'+String(i).padStart(RECEIPT_CONFIG.referenceDigits,'0')));
assert.equal(new Set(metaPopulation.map(x=>x.entry)).size,RECEIPT_CONFIG.cardEntries.length);
assert(new Set(metaPopulation.map(x=>x.operator)).size>1);
assert(new Set(metaPopulation.map(x=>x.cardEnding)).size>90);
assert(new Set(metaPopulation.map(x=>x.auth)).size>90);
assert(metaPopulation.every(x=>x.cardEnding!=='0'.repeat(RECEIPT_CONFIG.cardEndingDigits)&&!x.auth.startsWith('TEST')));
const itemHeader=receiptItemLine('QTY','DESCRIPTION','RSP(£)','AMT(£)');
assert.equal(itemHeader.length,RECEIPT_CONFIG.lineChars);
assert.equal(itemHeader.indexOf('QTY'),0);
assert.equal(itemHeader.indexOf('DESCRIPTION'),4);
assert.equal(itemHeader.indexOf('RSP(£)'),16);
assert.equal(itemHeader.indexOf('AMT(£)'),23);
const sampleItemRows=Array.from(receiptItemRows({...SKU_DEFINITIONS.poem,amount:299},'B3'));
assert.deepEqual(sampleItemRows,[
  '1   POETRY        2.99  2.99A ',
  '    VOUCHER B3                '
]);
assert(sampleItemRows.every(line=>line.length===RECEIPT_CONFIG.lineChars));
assert.equal(sampleItemRows[0].slice(16,22).trim(),'2.99');
assert.equal(sampleItemRows[0].slice(23,29).trim(),'2.99A');
assert(!base.items.some(item=>item.id==='font'));
assert.equal(quotePoem('春風吹\n\n雨聲來','','bitmap').price,base.price);
assert.equal(quotePoem('春風吹\n\n雨聲來','','site').price,base.price+TARIFF.addOn);
assert.equal(extra.items.find(item=>item.id==='font').receipt,'WEBSITE TYPEFACES');
for(const poem of ['A poem','詩詞','诗词','詩とひらがな','Größe für Wörter','Été à Noël','Стихотворение Ёжик']){
  const pixel=quotePoem(poem,'','bitmap'),site=quotePoem(poem,'','site');
  assert(!pixel.items.some(item=>item.id==='font'));
  assert.equal(site.price,pixel.price+TARIFF.addOn);
  assert.equal(site.items.find(item=>item.id==='font').label,'網站字體版本');
}
assert.deepEqual(Array.from(typeSizes('bitmap')),Array.from(TYPE_CONFIG.bitmapSizes));
assert.deepEqual(Array.from(typeSizes('site')),Array.from(TYPE_CONFIG.siteSizes));
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
assert(wrapped.every(text=>text.length*24<=PAPER_CONFIG.bodyWidthDots));
let scenes = 0;
for (let price = 1; price <= 10000; price += 7) {
  for (const roll of [0, 0.499, 0.5, 0.749, 0.75, 0.899, 0.9, 0.999]) {
    for (const cashRoll of [0, 0.099, 0.1, 0.549, 0.55, 0.849, 0.85, 0.999]) {
      const payment = automaticPayment(price, roll, cashRoll);
      assert(payment.tender >= price);
      assert.equal(payment.tender - price, payment.change);
      assert.equal(count(payment.changeParts), payment.change);
      if (payment.method === 'cash') assert.equal(count(payment.notes), payment.tender);
      if (payment.mode === 'coins') {
        assert(price <= UK_CASH.coinOnlyMax);
        assert(payment.notes.every(part => UK_CASH.coins.includes(part.value)));
      }
      scenes++;
    }
  }
}
assert.equal(automaticPayment(499, 0.95, 0.5).change, 1);
assert.equal(automaticPayment(499, 0.95, 0.05).change, 0);
const i18nSource=read('content/poetry-voucher-app/i18n.js');
const { localeRows, localeNames } = vm.runInNewContext(
  i18nSource.split('const traditionalOverrides')[0] + ';({localeRows,localeNames})'
);
assert.equal(localeNames.length, 7);
assert.equal(new Set(localeRows.map(row => row[0])).size, localeRows.length);
assert(localeRows.every(row => row.length === 7 && row.every(value => typeof value === 'string' && value.trim())));
const rowsByKey=new Map(Array.from(localeRows,row=>[row[0],Array.from(row)]));
const {traditionalOverrides}=vm.runInNewContext(
  i18nSource.slice(i18nSource.indexOf('const traditionalOverrides'),i18nSource.indexOf('const localeMap'))+';({traditionalOverrides})'
);
for(const [key,tokens] of [
  ['TYPEFACE_NOTE_TEMPLATE',['{bitmapSizes}','{siteSizes}','{addOn}']],
  ['TARIFF_NOTE_TEMPLATE',['{version}','{ending}','{addOn}']],
  ['PAYMENT_NOTE_TEMPLATE',['{coinLimit}']]
]){
  const translations=[traditionalOverrides[key],...rowsByKey.get(key).slice(1)];
  for(const text of translations)for(const token of tokens)assert(text.includes(token),key+' missing '+token);
}
assert(rowsByKey.get('網站字體').every(text=>!/[£€$]\s*\d|\d+[.,]\d{2}/.test(text)),'website typeface label must not duplicate the configured fee');
const i18nRuntime=i18nSource.slice(i18nSource.indexOf('// Original English headings')).replace(/const traditionalOverrides=.*?;/s,'');
const studioConsumers=source+read('templates/poetry-voucher-studio.html')+i18nRuntime;
const unusedLocaleRows=localeRows.filter(row=>!studioConsumers.includes(row[0])).map(row=>row[0]);
assert.equal(unusedLocaleRows.length,0,'dead studio i18n rows: '+unusedLocaleRows.join(' | '));
assert(!/\bPV1\b|\bPV3\b|\bPRN\b|SPECIMEN|自選面額|£1\.99|£10/.test(i18nSource),'stale or duplicated numeric studio copy survived cleanup');
const data = JSON.parse(read('content/poetry-voucher-app/editions.json'));
const catalogueCheck=spawnSync('python3',['tools/sync_voucher_translations.py','--check'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
assert.equal(catalogueCheck.status,0,catalogueCheck.stderr||'voucher translations are stale');
assert.equal(data.patterns['%'],'11001 11010 00100 01000 10110 10011 00000');
assert(data.patterns['(']&&data.patterns[')']&&data.patterns['£']);
assert.equal(new Set(data.works.map(work => work.id)).size, data.works.length);
assert(data.works.some(work => work.id === 'ci-b3'));
for (const work of data.works) {
  const url = new URL(work.source_url);
  assert.equal(url.origin, 'https://hanpuli.github.io');
  assert(['/ci.html', '/shi.html'].includes(url.pathname));
  assert(url.hash);
  assert(work.title && work.poem);
  assert.deepEqual(Object.keys(work.translations),['en','zh-Hans','ja','de','fr','ru']);
}
const ciSource=JSON.parse(read('content/ci-source.json'));
const ciSimplified=JSON.parse(read('content/ci-simplified.json'));
const shiSource=JSON.parse(read('content/shi-source.json'));
const shiSimplified=JSON.parse(read('content/shi-simplified.json'));
const shiEnglish=JSON.parse(read('content/shi-translations/en.json'));
const ciById=new Map(ciSource.poems.map(poem=>[poem.id,poem]));
const ciSimplifiedById=new Map(ciSimplified.poems.map(poem=>[poem.id,poem]));
assert.equal(data.works.filter(work=>work.kind==='CI').length,ciSource.poems.length);
assert.equal(data.works.filter(work=>work.kind==='POEM').length,shiSource.drafts.reduce((count,draft)=>count+draft.parts.length,0));
for(const work of data.works){
  if(work.kind==='CI'){
    const id=work.id.slice(3),sourcePoem=ciById.get(id);
    assert(sourcePoem,`missing canonical ci source for ${work.id}`);
    assert.equal(work.id,`ci-${sourcePoem.id}`);
    assert.equal(work.source_id,id.toUpperCase(),work.id);
    assert.equal(work.source_url,`https://hanpuli.github.io/ci.html#${id}`,work.id);
    assert.equal(work.title,sourcePoem.source_title,work.id);
    assert.equal(work.poem,sourcePoem.source_body,work.id);
    assert.equal(work.translations.en.title,sourcePoem.en.title,work.id);
    assert.equal(work.translations.en.body,sourcePoem.en.body,work.id);
    assert.equal(work.translations['zh-Hans'].title,ciSimplifiedById.get(id)?.source_title,work.id);
    assert.equal(work.translations['zh-Hans'].body,ciSimplifiedById.get(id)?.source_body,work.id);
    assert.equal(work.collection,sourcePoem.voice==='separate'?'詞':ciSource.title,work.id);
    const edition=sourcePoem.date||(
      ciSource.outside_dates[id]?`外編 · ${ciSource.outside_dates[id]}`:`集作日期 ${ciSource.cycle_date}`
    );
    assert.equal(work.edition,edition,work.id);
    continue;
  }
  assert.equal(work.kind,'POEM',work.id);
  const match=/^shi-d([1-9]\d*)-([1-9]\d*)$/.exec(work.id);
  assert(match,`invalid shi catalogue id: ${work.id}`);
  const [draftNumber,partNumber]=match.slice(1).map(Number);
  const draft=shiSource.drafts[draftNumber-1],part=draft?.parts[partNumber-1];
  const translatedPart=shiEnglish.drafts[draftNumber-1]?.parts[partNumber-1];
  assert(part&&translatedPart,`missing canonical shi source for ${work.id}`);
  assert.equal(work.source_id,`D${draftNumber}.${partNumber}`,work.id);
  assert.equal(work.source_url,'https://hanpuli.github.io/shi.html#drafts',work.id);
  assert.equal(work.collection,shiSource.title,work.id);
  assert.equal(work.title,`${shiSource.title} · ${part.number}`,work.id);
  assert.equal(work.edition,draft.title,work.id);
  assert.equal(work.poem,part.body,work.id);
  assert.equal(work.translations.en.body,translatedPart.body,work.id);
  assert.equal(work.translations['zh-Hans'].body,shiSimplified.drafts[draftNumber-1]?.parts[partNumber-1]?.body,work.id);
}
// Exercise the actual cart admission and pricing functions for every published variant.
const shopPrefix=read('content/poetry-voucher-app/shop.js').split('  function notify(')[0];
const shopCart=vm.runInNewContext(shopPrefix+'return {validateLine,quote};})()',{
  works:data.works,crypto:{randomUUID},typeSizes,quotePoem,
  SHOP_LANGS:['en','zh-Hant','zh-Hans','ja','de','fr','ru']
});
const expectedIds=[...ciSource.poems.map(p=>`ci-${p.id}`),...shiSource.drafts.flatMap((d,i)=>d.parts.map((p,j)=>`shi-d${i+1}-${j+1}`))];
assert.deepEqual(data.works.map(w=>w.id).sort(),expectedIds.sort());
let shopVariants=0,outsideVariants=0;
for(const work of data.works){
  const ciId=work.id.slice(3);
  const expectedShelf=work.kind==='POEM'?shiSource.title:
    ciById.get(ciId).voice==='separate'||ciSource.outside_dates[ciId]?'詞':ciSource.title;
  assert.equal(work.shelf,expectedShelf,work.id);
  for(const locale of ['zh-Hant','zh-Hans'])for(const translations of [[],...['en','ja','de','fr','ru'].map(language=>[language]),['en','ja','de','fr','ru']]){
    const line=shopCart.validateLine({workId:work.id,locale,translations,font:'bitmap',size:TYPE_CONFIG.defaultSize,quantity:1});
    assert.equal(line.workId,work.id);assert.equal(line.locale,locale);
    assert.equal(line.poem,locale==='zh-Hans'?work.translations['zh-Hans'].body:work.poem);
    assert.deepEqual([...line.translations],translations);
    assert.equal(shopCart.quote(line).price,quotePoem(work.poem).price+translations.length*TARIFF.addOn);
    shopVariants++;if(work.shelf!==ciSource.title)outsideVariants++;
  }
  assert.throws(()=>shopCart.validateLine({workId:work.id,locale:'zh-Hant',translations:['missing'],font:'bitmap',size:TYPE_CONFIG.defaultSize,quantity:1}));
  assert.throws(()=>shopCart.validateLine({workId:work.id,locale:'zh-Hant',translations:['en','en'],font:'bitmap',size:TYPE_CONFIG.defaultSize,quantity:1}));
}
assert.equal(data.works.filter(w=>w.shelf===ciSource.title).length,16);
console.log(`shop catalogue: ${shopVariants} checked configurations, including ${outsideVariants} outside the sixteen-poem cycle; actual cart validation and pricing OK`);
for (const file of ['gallery.js', 'i18n.js', 'editions.json', 'studio.css']) {
  const text = read('content/poetry-voucher-app/' + file);
  assert(!/tail95239f|100\.99\.73|192\.168\.|\/api\/print|\/dev\/|Bearer\s|sendBeacon|WebSocket/.test(text), file + ': private endpoint or telemetry');
}
assert.deepEqual([...source.matchAll(/fetch\(([^)]+)\)/g)].map(match => match[1]), ["'editions.json'"]);
assert(!/localStorage|sessionStorage|indexedDB|innerHTML/.test(source));
assert(!/cardEnding:'0000'|auth:'TEST|operator:'01'|p\.till\('ENTRY','CONTACTLESS'\)/.test(source),'transaction-specific receipt metadata must be derived from the receipt reference');
const studioTemplate=read('templates/poetry-voucher-studio.html');
assert.match(studioTemplate,/<html lang="zh-Hant-HK"[^>]+data-default-locale="zh-Hant"/);
assert(!/maxlength="(?:160|100|1800)"|£1\.99|\bPV3\b|58 mm \/ 384 dots \/ 1 bit/.test(studioTemplate),'studio duplicated a renderer-owned numeric parameter');
const overviewTemplate=read('templates/poetry-voucher.html'),homeTemplate=read('templates/index.html');
assert(overviewTemplate.includes('height="{{PV_RECEIPT_HEIGHT}}"')&&overviewTemplate.includes('height="{{PV_VOUCHER_HEIGHT}}"'));
assert(homeTemplate.includes('height="{{PV_EDITORIAL_HEIGHT}}"'));
assert(!/height="566"/.test(overviewTemplate));
console.log(`poetrycheck: ${scenes} payment cases, pricing, ${localeRows.length} translation rows, ${data.works.length} public works and privacy invariants OK`);
