/* A standalone kanbun presentation document.
 * Copyright 2026 Hanpu Li. Typesetting is in kanbun-render.js.
 */
(() => {
  'use strict';
  const node = document.getElementById('kanbun-display');
  const record = document.getElementById('canonical-kanbun-data');
  if (!node || !record) return;
  let original;
  try {
    original = JSON.parse(record.textContent);
    if (!original.body || !original.tid || !original.sha256 ||
        typeof convertKanbunDiv !== 'function') throw Error('Invalid viewer data');
    const stanzas = node.querySelectorAll('[data-kanbun-stanza]');
    if (!stanzas.length) throw Error('Missing kanbun stanza');
    stanzas.forEach(stanza=>convertKanbunDiv(stanza));
    const heading = node.querySelector('[data-kanbun-heading]');
    if (heading) convertKanbunDiv(heading);
  } catch {
    parent.postMessage({type:'hanpu-kanbun-viewer-v1',state:'error',
                        tid:document.body.dataset.kanbunText}, '*');
    return;
  }
  // The displayed reading apparatus is not the canonical text. Copying text
  // from this isolated renderer produces only the original Chinese source.
  document.addEventListener('copy', event => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', original.body);
    event.preventDefault();
  });
  let last = '';
  let lastWidth = 0;
  function measure() {
    // Measure actual painted DOM boxes, not a width guessed from the number
    // of characters or a fixed amount of pseudo-ruby padding. Reading
    // cells sit in side tracks of each .unit and are measured directly.
    const content = [node, ...node.querySelectorAll(
      '.unit,.kanbun-heading,.kanbun-body,.kanbun-stanza,.kanji,.furigana,.okurigana,.kaeriten,.saidoku,.punctuation'
    )];
    let right = 0;
    let bottom = 0;
    for (const element of content) {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      right = Math.max(right,bounds.right);
      bottom = Math.max(bottom,bounds.bottom);
    }
    const base = node.getBoundingClientRect();
    // A viewport can briefly acquire a larger scrollWidth while fonts settle
    // or the parent updates its iframe dimensions. Include that observed
    // overflow rather than publishing a "ready" measurement which clips it.
    const scroll = document.documentElement.scrollWidth > innerWidth + 1
      ? document.documentElement.scrollWidth + 12 : 0;
    const width = Math.ceil(Math.max(base.width + 38,right + 18,scroll));
    const parentWidth = Math.max(lastWidth,width);
    const parentHeight = Math.ceil(Math.max(base.height + 24,bottom + 12));
    if (!(parentWidth > 0 && parentHeight > 0) ||
        !Number.isFinite(parentWidth) || !Number.isFinite(parentHeight)) return;
    lastWidth = parentWidth;
    const payload = {
      type:'hanpu-kanbun-viewer-v1', state:'ready',
      tid:original.tid, sha256:original.sha256,
      width:parentWidth, height:parentHeight,
    };
    const key = parentWidth + '/' + parentHeight;
    if (key !== last) {
      last = key;
      parent.postMessage(payload, '*');
    }
  }
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'hanpu-kanbun-preferences-v1') return;
    const size = event.data.fontSize;
    if (typeof size === 'number' && size >= 18 && size <= 42)
      node.style.fontSize = size + 'px';
    // The host sends space available after the vertical title and gutters.
    // A new constraint may reduce the number of columns per reading band,
    // so reset the prior non-shrinking width before synchronous remeasurement.
    const cap = event.data.maxContentWidth;
    if (Number.isFinite(cap) && cap >= 100 && cap <= 1600) {
      const value = Math.floor(cap) + 'px';
      if (node.style.getPropertyValue('--kanbun-content-cap') !== value) {
        node.style.setProperty('--kanbun-content-cap', value);
        lastWidth = 0;
        last = '';
      }
    }
    const foreground = event.data.foreground;
    if (typeof foreground === 'string' && foreground.length < 100 &&
        CSS.supports('color',foreground)) document.body.style.color = foreground;
    // An offscreen sandboxed iframe may have requestAnimationFrame suspended.
    // The first handshake must not depend on animation frames.
    measure();
  });
  document.fonts.ready.then(() => {
    // ResizeObserver also fires for offscreen documents, whereas animation
    // frames may be paused. Re-measure directly; the payload is deduplicated
    // by width/height to avoid message storms.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
  });
  document.fonts.addEventListener('loadingdone',measure);
  addEventListener('resize',measure);
})();