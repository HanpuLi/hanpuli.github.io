/* A separate, portfolio-owned controller for a sandboxed kanbun viewer.
 * The iframe runs the site's kanbun typesetter; this host controller
 * exchanges only data and dimensions by postMessage.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const stages = [...document.querySelectorAll('[data-poetry-kanbun-viewer]')];
  // The three-way layout choice (poetry-layout.js) sets data-poetry-kunten-choice.
  if (!stages.length || !document.querySelector('[data-poetry-kunten-choice]')) return;
  const storageKey = 'hanpuli.poetryKunten.v2';
  let preference = null;
  try { preference = localStorage.getItem(storageKey); } catch {}
  const override = new URL(location.href).searchParams.get('kunten');
  if (override === 'on' || override === 'off') preference = override;
  root.dataset.poetryKuntenMarks = preference === 'off' ? 'off' : 'on';
  dispatchEvent(new Event('poetry-kunten-change'));
  const byWindow = new Map();
  for (const stage of stages) {
    const frame = stage.querySelector('iframe[data-kanbun-frame]');
    const article = stage.closest('.reader-poem');
    if (!frame || !article) continue;
    byWindow.set(frame.contentWindow, {frame, article, stage});
  }
  let currentLayout = root.dataset.poetryLayout;
  function isActive() {
    return root.dataset.poetryKuntenMarks !== 'off' && root.dataset.poetryLayout === 'vertical' &&
           !root.hasAttribute('data-reading-simple');
  }
  function apply() {
    const on = isActive();
    root.dataset.poetryKunten = on ? 'on' : 'off';
    for (const stage of stages) {
      const source = stage.closest('.poem-version.source');
      const show = on && stage.dataset.kanbunReady === 'true';
      // Keep an on-page, measurable iframe while it initializes; the
      // pre-ready stage is clipped and has no effect on the Chinese source.
      stage.hidden = !on;
      source?.classList.toggle('poetry-kanbun-showing',show);
    }
    window.PoetryFlow?.schedule();
    currentLayout = root.dataset.poetryLayout;
  }
  addEventListener('message', event => {
    const match = [...byWindow.values()].find(({frame}) => frame.contentWindow === event.source);
    if (!match) return;
    const {frame, article, stage} = match;
    const msg = event.data;
    if (msg?.type !== 'hanpu-kanbun-viewer-v1' ||
        msg.tid !== article.dataset.poetryText ||
        msg.tid !== stage.dataset.poetryKanbunViewer) return;
    if (msg.state === 'error') {
      stage.dataset.kanbunReady = 'false';
      apply(); // Canonical Chinese source remains visible.
      return;
    }
    if (msg.state !== 'ready' ||
        msg.sha256 !== stage.dataset.kanbunSha256 ||
        !Number.isInteger(msg.width) || !Number.isInteger(msg.height) ||
        msg.width < 20 || msg.height < 50 || msg.width > 1200 || msg.height > 20000) return;
    // Sizing is provided by the isolated renderer, not estimated via padding
    // around arbitrary glyphs. Never let an iframe exceed its parent column.
    frame.style.width = msg.width + 'px';
    frame.style.height = msg.height + 'px';
    stage.dataset.kanbunReady = 'true';
    apply();
  });
  function updateFontSizes() {
    for (const {frame,article} of byWindow.values()) {
      const reference = article.querySelector('.source .body');
      if (!reference || !frame.contentWindow) continue;
      const style = getComputedStyle(reference);
      const size = Number.parseFloat(style.fontSize);
      const section = article.querySelector('.poem-version.source');
      const display = section?.querySelector('.poetry-kanbun-display');
      const sectionWidth = section?.getBoundingClientRect().width || innerWidth;
      const gap = Number.parseFloat(getComputedStyle(display).columnGap) || 12;
      // Reserve 38px inside the iframe for glyph bounds/gutters, plus a
      // safety margin. The title is typeset inside the frame.
      const cap = Math.max(100,Math.floor(sectionWidth - gap - 44));
      if (Number.isFinite(size))
        frame.contentWindow.postMessage({
          type:'hanpu-kanbun-preferences-v1',
          fontSize:Math.max(20,Math.min(36,Math.round(size*1.35))),
          foreground:style.color,
          maxContentWidth:cap,
        }, '*');
    }
  }
  // Unlike the failed overlay, the visual iframe never owns source text.
  // Readers may select within it or use this explicit canonical-copy control.
  for (const stage of stages) {
    const button = stage.querySelector('[data-kanbun-copy]');
    if (!button) continue;
    button.addEventListener('click', async () => {
      const original = stage.closest('.reader-poem')?.querySelector('.source .body')?.textContent;
      if (!original) return;
      const label = button.dataset.initialLabel || button.textContent;
      button.dataset.initialLabel = label;
      let copied = false;
      try {
        await navigator.clipboard.writeText(original);
        copied = true;
      } catch {}
      // Confirmation is brief; a clipboard denial is said plainly, never reported as success.
      button.textContent = copied ? '原文をコピーしました' : 'コピーできませんでした';
      clearTimeout(button.resetTimer);
      button.resetTimer = setTimeout(() => { button.textContent = label; }, 2000);
    });
  }
  addEventListener('poetry-layout-applied', () => {
    apply();
    updateFontSizes();
  });
  addEventListener('resize', () => {
    updateFontSizes();
  });
  new MutationObserver(mutations => {
    if (mutations.some(m => m.attributeName === 'data-reading-simple' ||
                            m.attributeName === 'data-reading-large' ||
                            m.attributeName === 'data-reading-contrast')) {
      apply();
      updateFontSizes();
    }
  }).observe(root,{attributes:true,attributeFilter:['data-reading-simple','data-reading-large','data-reading-contrast']});
  for (const {frame} of byWindow.values()) frame.addEventListener('load', updateFontSizes);
  apply();
})();