'use strict';
// The authored lines remain intact. Bands break at stanza or complete-line boundaries.
window.PoetryFlow = (() => {
  const records = new Map();
  let frame = 0;
  const px = value => Number.parseFloat(value) || 0;

  function withBreaks(stanzas, state = {previous:null}) {
    return stanzas.flatMap(stanza => {
      const id = stanza.dataset.poetryStanza;
      const nodes = state.previous === null ? [stanza] :
        [document.createTextNode(state.previous === id ? '\n' : '\n\n'), stanza];
      state.previous = id;
      return nodes;
    });
  }

  function titlePhrases(text) {
    const phrases = text.match(/[^，。；：、·]*[，。；：、·][ \u00a0]*|[^，。；：、·]+$/gu) || [text];
    return phrases.join('') === text ? phrases : [text];
  }

  function titleColumn(text) {
    const span = document.createElement('span');
    span.className = 'flow-title-column';
    span.textContent = text;
    return span;
  }

  function packTitle(phrases, heights, limit) {
    const columns = [];
    let text = '', height = 0;
    phrases.forEach((phrase, index) => {
      if (text && height + heights[index] > limit + 0.25) {
        columns.push({text, height}); text = ''; height = 0;
      }
      text += phrase; height += heights[index];
    });
    if (text) columns.push({text, height});
    return columns;
  }

  function packStanzas(stanzas, boxes, capacity, gap) {
    const bands = [];
    let band = [], width = 0, height = 0;
    stanzas.forEach((stanza, index) => {
      if (band.length && width + gap + boxes[index].width > capacity + 0.25) {
        bands.push({stanzas:band, width, height}); band = []; width = 0; height = 0;
      }
      if (band.length) width += gap;
      band.push(stanza); width += boxes[index].width;
      height = Math.max(height, boxes[index].height);
    });
    if (band.length) bands.push({stanzas:band, width, height});
    return bands;
  }

  function clear(record) {
    const {composition, title, body, stanzas, titleText} = record;
    if (body.querySelector('.flow-row')) body.replaceChildren(...withBreaks(stanzas));
    body.classList.remove('flow-poem-body');
    body.style.removeProperty('width');
    delete body.dataset.flowRows;
    delete composition.dataset.flowActive;
    delete composition.dataset.flowTitlePosition;
    delete title.dataset.flowTitle;
    if (title.querySelector('.flow-title-column')) title.textContent = titleText;
  }

  function layout(record) {
    const {composition, title, body, titleText} = record;
    let stanzas = record.stanzas;
    if (!stanzas.length || getComputedStyle(stanzas[0]).writingMode !== 'vertical-rl') {
      clear(record); return;
    }
    const verticalTitle = getComputedStyle(title).writingMode === 'vertical-rl';
    const parent = composition.parentElement;
    const parentStyle = getComputedStyle(parent);
    const available = parent.clientWidth - px(parentStyle.paddingLeft) - px(parentStyle.paddingRight);
    if (available <= 0) return;

    composition.dataset.flowActive = 'true';
    body.classList.add('flow-poem-body');
    body.style.removeProperty('width');
    body.replaceChildren(...withBreaks(stanzas));
    const style = getComputedStyle(composition);
    const stanzaGap = px(style.getPropertyValue('--flow-stanza-gap'));
    const titleGap = px(style.getPropertyValue('--flow-title-gap'));
    const bandGap = px(style.getPropertyValue('--flow-band-gap'));
    // A stanza wider than the reader can fit is divided only between complete
    // authored lines. Resize starts again from the original stanza nodes.
    stanzas = stanzas.flatMap(stanza => {
      const box = stanza.getBoundingClientRect();
      if (box.width <= available + 0.25) return [stanza];
      const lines = stanza.textContent.split('\n');
      const columns = Math.max(1, Math.floor(available / (box.width / lines.length)));
      const parts = [];
      for (let start = 0; start < lines.length; start += columns) {
        const part = stanza.cloneNode(false);
        part.dataset.flowContinuation = String(start);
        part.textContent = lines.slice(start, start + columns).join('\n');
        parts.push(part);
      }
      return parts;
    });
    body.replaceChildren(...withBreaks(stanzas));
    const boxes = stanzas.map(stanza => stanza.getBoundingClientRect());
    const widest = Math.max(...boxes.map(box => box.width));
    const tallest = Math.max(...boxes.map(box => box.height));
    let titleWidth = 0, titlePosition = 'horizontal';

    if (verticalTitle) {
      title.dataset.flowTitle = 'true';
      // A short title should read as one column even when the verses are shorter.
      // Measure the complete title first; punctuation is only a fallback for long titles.
      title.replaceChildren(titleColumn(titleText));
      const wholeHeight = title.firstElementChild.getBoundingClientRect().height;
      const shortTitle = wholeHeight <= px(getComputedStyle(title).fontSize) * 20 + 0.25;
      const phrases = shortTitle ? [titleText] : titlePhrases(titleText);
      title.replaceChildren(...phrases.map(titleColumn));
      const phraseBoxes = [...title.children].map(span => span.getBoundingClientRect());
      const heights = phraseBoxes.map(box => box.height);
      const columnWidth = Math.max(...phraseBoxes.map(box => box.width));
      const baseline = Math.max(tallest, ...heights);
      const limits = new Set([baseline]);
      for (let start = 0; start < heights.length; start++) {
        let sum = 0;
        for (let end = start; end < heights.length; end++) {
          sum += heights[end];
          if (sum >= baseline) limits.add(sum);
        }
      }
      // Compare actual phrase boundaries. Avoid adding a whole verse band merely
      // to keep a short title column, but do not create an excessively tall title.
      let best = null;
      for (const limit of [...limits].sort((a,b) => a-b)) {
        const columns = packTitle(phrases, heights, limit);
        const width = columns.length * columnWidth;
        const side = width + titleGap + widest <= available + 0.25;
        const rows = packStanzas(stanzas, boxes, side ? available-width-titleGap : available, stanzaGap);
        const bodyHeight = rows.reduce((sum, row) => sum + row.height, 0) + bandGap * (rows.length-1);
        const titleHeight = Math.max(...columns.map(column => column.height));
        const height = side ? Math.max(bodyHeight,titleHeight) : bodyHeight+bandGap+titleHeight;
        if (!best || height < best.height-0.25 || (Math.abs(height-best.height)<=0.25 && rows.length<best.rows)) {
          best = {columns, height, rows:rows.length};
        }
      }
      title.replaceChildren(...best.columns.map(column => titleColumn(column.text)));
      titleWidth = title.getBoundingClientRect().width;
      titlePosition = titleWidth + titleGap + widest <= available + 0.25 ? 'side' : 'top';
    } else {
      delete title.dataset.flowTitle;
      if (title.querySelector('.flow-title-column')) title.textContent = titleText;
    }

    composition.dataset.flowTitlePosition = titlePosition;
    const capacity = titlePosition === 'side' ? available - titleWidth - titleGap : available;
    const bands = packStanzas(stanzas, boxes, capacity, stanzaGap);
    stanzas.forEach((stanza,index) => {stanza.dataset.flowStanza = String(index);});
    body.style.width = `${Math.max(...bands.map(row => row.width))}px`;
    const breaks = {previous:null};
    body.replaceChildren(...bands.map(row => {
      const element = document.createElement('div');
      element.className = 'flow-row';
      element.dataset.flowStanzas = row.stanzas.map(stanza => stanza.dataset.flowStanza).join(',');
      element.append(...withBreaks(row.stanzas, breaks));
      return element;
    }));
    body.dataset.flowRows = String(bands.length);
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      records.forEach(layout);
    });
  }

  const observer = new ResizeObserver(entries => {
    let changed = false;
    for (const entry of entries) {
      const old = entry.target.dataset.flowObservedWidth;
      const width = String(entry.contentRect.width);
      if (old !== width) {entry.target.dataset.flowObservedWidth = width; changed = true;}
    }
    if (changed) schedule();
  });
  new MutationObserver(schedule).observe(document.documentElement, {attributes:true});
  document.fonts.ready.then(schedule);
  document.fonts.addEventListener('loadingdone', schedule);

  function update(composition, title, body) {
    const stanzas = [...body.querySelectorAll('.poetry-stanza')];
    records.set(composition, {composition, title, body, stanzas, titleText:title.textContent});
    observer.observe(composition.parentElement);
    schedule();
  }
  return {update, schedule};
})();
