/* Vertical kanbun typesetter for the poetry edition.
 * Copyright 2026 Hanpu Li. Part of the hanpuli.github.io site code.
 *
 * Input: each direct <p> child of a stanza holds one authored line as
 * plain text in the manuscript syntax compiled by
 * tools/poetry_kunten_manuscript.py:
 *   字(furigana){okurigana}‹saidoku-furigana›«saidoku-okurigana»[kaeriten]
 * Every Han character becomes one .unit; punctuation joins the unit of
 * the character it follows. Readings sit in fixed side columns, so no
 * annotation can be laid over a character or another annotation; a unit
 * grows downward when its readings are longer than the character cell.
 */
(() => {
  'use strict';
  const OPEN = {
    '(': [')', 'furigana'], '{': ['}', 'okurigana'], '[': [']', 'kaeriten'],
    '‹': ['›', 'saidokuFurigana'], '«': ['»', 'saidokuOkurigana'],
  };
  const HAN = /\p{Script=Han}/u;

  function parse(text) {
    const units = [];
    let current = null;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (OPEN[ch]) {
        const [closer, key] = OPEN[ch];
        const end = text.indexOf(closer, i + 1);
        if (!current || !current.kanji || end < i + 2 || current[key])
          throw Error('Malformed kanbun annotation at ' + i);
        current[key] = text.slice(i + 1, end);
        i = end;
      } else if (HAN.test(ch)) {
        current = {kanji: ch, punctuation: ''};
        units.push(current);
      } else if (!/\s/.test(ch)) {
        if (!current) {
          current = {kanji: '', punctuation: ''};
          units.push(current);
        }
        current.punctuation += ch;
      }
    }
    return units;
  }

  function span(className, text) {
    const node = document.createElement('span');
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function render(unit) {
    const node = span('unit');
    if (unit.kanji) node.append(span('kanji', unit.kanji));
    if (unit.punctuation) node.append(span('punctuation', unit.punctuation));
    if (unit.furigana || unit.okurigana) {
      const right = span('side side-right' + (unit.furigana ? '' : ' side-sunk'));
      if (unit.furigana) right.append(span('furigana', unit.furigana));
      if (unit.okurigana) right.append(span('okurigana', unit.okurigana));
      node.append(right);
    }
    if (unit.saidokuFurigana || unit.saidokuOkurigana || unit.kaeriten) {
      const saidoku = unit.saidokuFurigana || unit.saidokuOkurigana;
      const left = span('side side-left' + (saidoku ? '' : ' side-gap'));
      if (unit.saidokuFurigana) left.append(span('saidoku', unit.saidokuFurigana));
      if (unit.saidokuOkurigana)
        left.append(span('saidoku saidoku-okurigana', unit.saidokuOkurigana));
      if (unit.kaeriten) left.append(span('kaeriten', unit.kaeriten));
      node.append(left);
    }
    return node;
  }

  function convertKanbunDiv(container) {
    for (const line of [...container.children]) {
      if (line.tagName !== 'P') continue;
      const units = parse(line.textContent);
      line.replaceChildren(...units.map(render));
      line.classList.add('kanbun-line');
    }
  }

  window.convertKanbunDiv = convertKanbunDiv;
})();
