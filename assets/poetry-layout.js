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
    records.push({body, title, composition, text:body.textContent,
      hiddenTitle:title.classList.contains('visually-hidden')});
  }
  const requested = new URL(location.href).searchParams.get('layout');
  let preferred;
  try { preferred = localStorage.getItem(key); } catch { /* Page controls still work. */ }
  if (!['horizontal', 'vertical'].includes(preferred)) {
    preferred = document.body.classList.contains('locale-zh') ? 'vertical' : 'horizontal';
  }
  if (['horizontal', 'vertical'].includes(requested)) preferred = requested;

  function apply() {
    const simple = root.hasAttribute('data-reading-simple');
    const layout = simple ? 'horizontal' : preferred;
    root.dataset.poetryLayout = layout;
    for (const record of records) {
      const {body, title, composition, text, hiddenTitle} = record;
      title.classList.toggle('visually-hidden', hiddenTitle && layout !== 'vertical');
      body.replaceChildren();
      if (layout === 'vertical') {
        text.split('\n\n').forEach((stanza, index) => {
          const paragraph = document.createElement('p');
          paragraph.className = 'poetry-stanza';
          paragraph.dataset.poetryStanza = String(index);
          paragraph.textContent = stanza;
          if (index) body.append(document.createTextNode('\n\n'));
          body.append(paragraph);
        });
      } else body.textContent = text;
      PoetryFlow.update(composition, title, body);
    }
    for (const button of controls.querySelectorAll('[data-poetry-layout]')) {
      button.setAttribute('aria-pressed', String(button.dataset.poetryLayout === layout));
      button.disabled = simple && button.dataset.poetryLayout === 'vertical';
      button.title = button.disabled ? controls.dataset.simpleLabel : '';
    }
  }
  controls.addEventListener('click', event => {
    const button = event.target.closest('[data-poetry-layout]');
    if (!button || button.disabled) return;
    preferred = button.dataset.poetryLayout;
    try { localStorage.setItem(key, preferred); } catch { /* Storage is optional. */ }
    const url = new URL(location.href);
    url.searchParams.set('layout', preferred);
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
