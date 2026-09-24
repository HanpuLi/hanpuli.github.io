'use strict';
// A complete, script-free reading copy, built from the frozen order, not the live catalogue.
const OrderReading = (() => {
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const language = value => value === 'zh-Hant' ? 'zh-Hant-HK' : value;
  const voucherId = (order, line, index) => (line.work?.source_id || 'CUSTOM') + '-' + order.ref + '-' + String(index).padStart(2, '0');
  async function textHash(lines) {
    const texts = lines.map(line => ({
      work: line.work?.id || null, locale: line.locale, title: line.title,
      author: line.author, poem: line.poem, edition: line.work?.edition || null,
      translations: line.translations.map(locale => ({locale, ...line.work?.translations?.[locale]}))
    }));
    const bytes = new TextEncoder().encode(JSON.stringify(texts));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  function record(order) {
    return {
      edition: order.lines.every(line => line.work) ? 'AUTHOR EDITION' : 'HISTORICAL ORDER / MAY INCLUDE READER EDITIONS',
      order: order.ref, issuedAt: new Date(order.created).toISOString(),
      tariff: order.tariff || 'not recorded',
      issuedPublication: order.publication || null,
      currentRendering: PUBLICATION_BUILD,
      status: !order.publication ? 'historical-renderer-unrecorded' :
        order.publication.renderer === PUBLICATION_BUILD.renderer ? 'same-renderer-build' : 're-rendered'
    };
  }
  function view(order, result, t, money) {
    const section = node('section', undefined, 'order-text-copy');
    section.append(node('h2', t('readOrder')), node('p', t('textCopyNote')));
    const receipt = node('section', undefined, 'receipt-reading');
    receipt.append(node('h3', t('receipt') + ' / ' + order.ref));
    const transcription = node('pre', result.receipt.transcript, 'receipt-transcript');
    transcription.lang = 'en-GB';
    receipt.append(transcription);
    section.append(receipt);
    let index = 0;
    for (const line of order.lines) {
      const reading = node('section', undefined, 'order-reading');
      const title = node('h3', line.title), author = node('p', line.author);
      title.lang = author.lang = language(line.locale);
      reading.append(title, author);
      const ids = [];
      for (let unit = 0; unit < line.quantity; unit++) ids.push(voucherId(order, line, ++index));
      reading.append(node('p', (line.work ? 'AUTHOR EDITION' : 'READER EDITION') + ' / ' + ids.join(' / '), 'micro'));
      const details = `${t('quantity')}: ${line.quantity} · ${t('unitPrice')}: ${money(line.unitPrice)} · ${t('total')}: ${money(line.unitPrice * line.quantity)}`;
      reading.append(node('p', details), node('p', `${language(line.locale)} / ${line.font === 'bitmap' ? 'PIXEL' : 'WEBSITE TYPEFACES'} / ${line.size} dots`, 'micro'));
      if (line.work?.edition) reading.append(node('p', line.work.edition, 'micro'));
      const original = node('p', line.poem, 'verse');
      original.lang = language(line.locale);reading.append(original);
      for (const locale of line.translations) {
        const translation = line.work?.translations?.[locale];
        if (!translation) continue;
        const heading = node('h4', translation.title), body = node('p', translation.body, 'verse');
        heading.lang = body.lang = language(locale);reading.append(heading, body);
      }
      if (line.work?.source_url) {
        // Historical local data never becomes an executable or external source link.
        try {
          const source = new URL(line.work.source_url);
          if (source.protocol === 'https:' && source.hostname === 'hanpuli.github.io') {
            const link = node('a', line.work.source_url);link.href = source.href;reading.append(link);
          }
        } catch { /* The frozen poem remains readable without a valid source URL. */ }
      }
      reading.append(node('p', 'ART EDITION / NO CASH VALUE', 'micro'));section.append(reading);
    }
    const publication = record(order);
    const notice = node('p', t(publication.status === 'same-renderer-build' ? 'renderSame' : publication.status === 're-rendered' ? 'renderChanged' : 'renderUnknown'), 'render-notice');
    section.append(notice);
    if (order.lines.every(line => line.work)) section.append(node('p', t('personalUse')));
    const manifest = node('details', undefined, 'publication-record');
    manifest.append(node('summary', t('editionRecord')), node('pre', JSON.stringify(publication, null, 2)));
    section.append(manifest);
    return section;
  }
  function html(order, result, t, money, locale) {
    const root = document.implementation.createHTMLDocument(t('order') + ' ' + order.ref);
    root.documentElement.lang = language(locale);
    const charset = root.createElement('meta');charset.setAttribute('charset', 'utf-8');root.head.prepend(charset);
    const viewport = root.createElement('meta');viewport.name = 'viewport';viewport.content = 'width=device-width, initial-scale=1';root.head.append(viewport);
    const policy = root.createElement('meta');policy.httpEquiv = 'Content-Security-Policy';policy.content = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";root.head.append(policy);
    const style = root.createElement('style');
    style.textContent = 'body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.65}h1,h2,h3,h4{line-height:1.3}section{margin-block:2rem}.verse,.receipt-transcript{white-space:pre-wrap}.verse{line-height:1.8}pre,a,.micro{overflow-wrap:anywhere;word-break:break-word}pre{white-space:pre-wrap;font-size:.9rem}summary{cursor:pointer}a{color:inherit;text-decoration:underline}:focus-visible{outline:3px solid currentColor;outline-offset:3px}@media print{body{margin:0;max-width:none}details{break-inside:avoid}}';
    root.head.append(style);
    const main = root.createElement('main');main.append(node('h1', 'Poetry Voucher / ' + t('order') + ' ' + order.ref), view(order, result, t, money));root.body.append(main);
    return new Blob(['<!DOCTYPE html>\n' + root.documentElement.outerHTML + '\n'], {type:'text/html;charset=utf-8'});
  }
  return Object.freeze({textHash, record, view, html});
})();
