(() => {
  'use strict';
  const root = document.documentElement;
  const controls = document.querySelector('.poetry-layout-controls');
  if (!controls || !window.PoetryFlow) return;
  const key = 'hanpuli.poetryLayout.v1';
  const records = [];
  for (const article of document.querySelectorAll('.reader-poem[data-poetry-classical]')) {
    const source = article.querySelector('.poem-version.source');
    const body = source.querySelector('.body');
    const title = source.querySelector('h2');
    const composition = document.createElement('div');
    composition.className = 'poetry-composition';
    title.before(composition);
    composition.append(title, body);
    const titles = [...article.querySelectorAll('.poem-version h2')];
    titles.forEach(heading => { heading.textContent = heading.dataset.poetryTitle || heading.textContent; });
    const dates = article.querySelector('.poetry-dates');
    if (article.dataset.poetryLabel) {
      const label = document.createElement('span');
      label.className = 'poetry-authorial-label';
      label.textContent = article.dataset.poetryLabel;
      dates.prepend(label, ' · ');
    }
    const text = body.textContent, chars = Array.from(text);
    const rhymes = new Set((body.dataset.poetryRhymes || '').split(',').filter(Boolean).map(Number));
    // The closing full stop is the poem's one resting vermilion point.
    const end = /[。！？]/u.test(chars.at(-1) || '') ? chars.length - 1 : -1;
    records.push({body, title, composition, text, chars, rhymes, end,
      hiddenTitle:title.classList.contains('visually-hidden')});
  }
  // Rhyme and end marks wrap single characters; offsets count code points of
  // the authored body, so text, clipboard and line breaks stay unchanged.
  function marked(record, start, stop) {
    const nodes = [];
    let run = '';
    for (let index = start; index < stop; index++) {
      const kind = record.rhymes.has(index) ? 'poetry-rhyme' : index === record.end ? 'poetry-end' : '';
      if (!kind) { run += record.chars[index]; continue; }
      if (run) { nodes.push(document.createTextNode(run)); run = ''; }
      const span = document.createElement('span');
      span.className = kind;
      span.textContent = record.chars[index];
      nodes.push(span);
    }
    if (run) nodes.push(document.createTextNode(run));
    return nodes;
  }
  const rhymeKey = 'hanpuli.poetryRhymes.v1';
  const rhymeToggle = controls.querySelector('[data-poetry-rhymes-toggle]');
  if (rhymeToggle) {
    let rhymesOn = false;
    try { rhymesOn = localStorage.getItem(rhymeKey) === 'on'; } catch { /* Storage is optional. */ }
    const syncRhymes = () => {
      root.dataset.poetryRhymes = rhymesOn ? 'on' : 'off';
      rhymeToggle.setAttribute('aria-pressed', String(rhymesOn));
    };
    rhymeToggle.hidden = !records.some(record => record.rhymes.size);
    rhymeToggle.addEventListener('click', () => {
      rhymesOn = !rhymesOn;
      try { localStorage.setItem(rhymeKey, rhymesOn ? 'on' : 'off'); } catch { /* Storage is optional. */ }
      syncRhymes();
    });
    syncRhymes();
  }
  const requested = new URL(location.href).searchParams.get('layout');
  let preferred;
  try { preferred = localStorage.getItem(key); } catch { /* Page controls still work. */ }
  if (!['horizontal', 'vertical'].includes(preferred)) {
    const traditionalOriginal = document.querySelector(
      '.reader-poem[data-poetry-classical] .poem-version.source[lang^="zh-Hant"]');
    preferred = traditionalOriginal ? 'vertical' : 'horizontal';
  }
  if (['horizontal', 'vertical'].includes(requested)) preferred = requested;

  // Japanese classical pages offer one three-way choice: horizontal,
  // vertical, or vertical with kunten marks (owned by poetry-kunten-host.js).
  function syncButtons() {
    const simple = root.hasAttribute('data-reading-simple');
    const layout = root.dataset.poetryLayout, marks = root.dataset.poetryKuntenMarks || 'on';
    for (const button of controls.querySelectorAll('[data-poetry-layout]')) {
      const choice = button.dataset.poetryKuntenChoice;
      button.setAttribute('aria-pressed', String(button.dataset.poetryLayout === layout && (!choice || choice === marks)));
      button.disabled = simple && button.dataset.poetryLayout === 'vertical';
      button.title = button.disabled ? controls.dataset.simpleLabel : '';
    }
  }
  addEventListener('poetry-kunten-change', syncButtons);
  function apply() {
    const simple = root.hasAttribute('data-reading-simple');
    const layout = simple ? 'horizontal' : preferred;
    root.dataset.poetryLayout = layout;
    for (const record of records) {
      const {body, title, composition, text, chars, hiddenTitle} = record;
      title.classList.toggle('visually-hidden', hiddenTitle && layout !== 'vertical');
      body.replaceChildren();
      if (layout === 'vertical') {
        let offset = 0;
        text.split('\n\n').forEach((stanza, index) => {
          const paragraph = document.createElement('p');
          paragraph.className = 'poetry-stanza';
          paragraph.dataset.poetryStanza = String(index);
          const length = Array.from(stanza).length;
          paragraph.append(...marked(record, offset, offset + length));
          offset += length + 2;
          if (index) body.append(document.createTextNode('\n\n'));
          body.append(paragraph);
        });
      } else body.append(...marked(record, 0, chars.length));
      PoetryFlow.update(composition, title, body);
    }
    syncButtons();
    dispatchEvent(new Event('poetry-layout-applied'));
  }
  controls.addEventListener('click', event => {
    const button = event.target.closest('[data-poetry-layout]');
    if (!button || button.disabled) return;
    preferred = button.dataset.poetryLayout;
    try { localStorage.setItem(key, preferred); } catch { /* Storage is optional. */ }
    const url = new URL(location.href);
    url.searchParams.set('layout', preferred);
    const marks = button.dataset.poetryKuntenChoice;
    if (marks) {
      root.dataset.poetryKuntenMarks = marks;
      try { localStorage.setItem('hanpuli.poetryKunten.v2', marks); } catch { /* Storage is optional. */ }
      url.searchParams.set('kunten', marks);
    }
    history.replaceState(history.state, '', url);
    apply();
  });
  new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.attributeName === 'data-reading-simple')) apply();
  }).observe(root, {attributes:true, attributeFilter:['data-reading-simple']});
  apply();
  controls.hidden = false;

  // Font loading and vertical bands can move an initial deep-link target after
  // the browser's first anchor scroll. Restore it once after the measured layout,
  // while leaving readers who have already interacted where they are.
  const initialHash = location.hash;
  if (initialHash) {
    let interacted = false;
    const markInteraction = () => { interacted = true; };
    const events = ['wheel', 'touchmove', 'pointerdown', 'keydown'];
    events.forEach(name => addEventListener(name, markInteraction, {passive:true}));
    const restoreAnchor = () => document.fonts.ready.then(() => {
      PoetryFlow.schedule();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        events.forEach(name => removeEventListener(name, markInteraction));
        if (interacted || location.hash !== initialHash) return;
        try {
          document.getElementById(decodeURIComponent(initialHash.slice(1)))
            ?.scrollIntoView({block:'start', behavior:'instant'});
        } catch { /* An invalid or unavailable fragment has no target. */ }
      }));
    });
    if (document.readyState === 'complete') restoreAnchor();
    else addEventListener('load', restoreAnchor, {once:true});
  }
})();
