/* Vertical kanbun typesetter for the poetry edition.
 * Copyright 2026 Hanpu Li. Part of the hanpuli.github.io site code.
 *
 * Input: each direct <p> child of a stanza holds one authored line as
 * plain text in the manuscript syntax compiled by
 * tools/poetry_kunten_manuscript.py:
 *   字(furigana){okurigana}‹saidoku-furigana›«saidoku-okurigana»[kaeriten]‐
 * where a trailing ‐ (U+2010) is a 合符 joining the character to the next.
 * Every Han character becomes one .unit; punctuation joins the unit of
 * the character it follows. Readings sit in fixed side columns, so no
 * annotation can be laid over a character or another annotation.
 *
 * flowKanbunColumns then sets the units in the fixed 行款 of a printed
 * 詞集 / 和刻訓点本: every column holds COLUMN cells whatever the screen
 * width; the title (詞牌) has its own first column(s); a preface (小序)
 * is set 低二格 (INDENT empty cells, then COLUMN - INDENT cells) and runs
 * on; the body begins in a fresh column and runs on, an authored line
 * break being no column break; a new stanza (上下片) is marked by one
 * empty cell (空一格), or by the top of a column if it falls there.
 *
 * settleKanbunColumns keeps the grid: cells have one fixed pitch, and a
 * reading longer than its cell continues beside the next character, as
 * on a printed page. Only when it would meet that character's own reading
 * (or a full-size mark) is the next cell moved down, by just that much.
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
      if (ch === '\u2010') {
        if (!current || !current.kanji || current.gofu)
          throw Error('Malformed 合符 at ' + i);
        current.gofu = true;
      } else if (OPEN[ch]) {
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
    const node = span(unit.gofu ? 'unit gofu' : 'unit');
    if (unit.kanji) node.append(span('kanji', unit.kanji));
    if (unit.punctuation)
      node.append(span(/^[·・]+$/.test(unit.punctuation) ? 'punctuation dot' : 'punctuation',
                       unit.punctuation));
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

  const COLUMN = 12;
  const INDENT = 2;

  function column(kind, part) {
    const node = document.createElement('div');
    node.className = 'kanbun-column' + (kind === 'title' ? ' kanbun-title'
      : kind === 'preface' ? ' kanbun-title kanbun-preface' : '');
    node.dataset.kanbunColumn = kind;
    if (part !== undefined) node.dataset.kanbunPart = String(part);
    return node;
  }

  // Replaces the converted heading and stanzas in root with one stream of
  // .kanbun-column elements, right to left in reading order.
  function flowKanbunColumns(root) {
    const columns = [];
    const heading = root.querySelector('[data-kanbun-heading]');
    if (heading) {
      [...heading.children].filter(p => p.tagName === 'P').forEach((p, part) => {
        const preface = p.classList.contains('kanbun-preface');
        const length = preface ? COLUMN - INDENT : COLUMN;
        const units = [...p.children].filter(n => n.classList.contains('unit'));
        for (let i = 0; i < units.length; i += length) {
          const node = column(preface ? 'preface' : 'title', part);
          if (preface)
            for (let k = 0; k < INDENT; k++) node.append(span('kanbun-indent'));
          node.append(...units.slice(i, i + length));
          columns.push(node);
        }
      });
    }
    let current = null;
    let fill = 0;
    root.querySelectorAll('[data-kanbun-stanza]').forEach((stanza, s) => {
      const units = [...stanza.querySelectorAll(':scope > p > .unit')];
      units.forEach((unit, i) => {
        if (s && !i) {
          unit.dataset.kanbunStanzaStart = '';
          if (fill > 0 && fill < COLUMN) {
            current.append(span('kanbun-space'));
            fill++;
          }
        }
        if (!current || fill === COLUMN) {
          current = column('body');
          columns.push(current);
          fill = 0;
        }
        current.append(unit);
        fill++;
      });
    });
    root.replaceChildren(...columns);
  }

  // How far down its own em box a mark is inked in vertical text:
  // 。，、 sit in the upper half, a middle dot at the centre.
  const inked = text => /^[。，、．]+$/.test(text) ? .5 : /^[·・]+$/.test(text) ? .56 : 1;

  function settleKanbunColumns(root) {
    const columns = [...root.querySelectorAll('.kanbun-column')];
    for (const node of columns)
      for (const cell of node.children) cell.style.marginTop = '';
    // One read pass, then arithmetic: pushing a cell down moves every
    // later cell of its column by the same amount.
    const plans = columns.map(node => [...node.children].map(cell => {
      const top = cell.getBoundingClientRect().top;
      const extent = elements => {
        let a = Infinity, b = -Infinity;
        for (const element of elements) {
          const r = element.getBoundingClientRect();
          if (!r.height) continue;
          a = Math.min(a, r.top - top);
          b = Math.max(b, r.bottom - top);
        }
        return a < b ? [a, b] : null;
      };
      const centre = [...cell.querySelectorAll(':scope > .kanji')];
      const mark = cell.querySelector(':scope > .punctuation');
      const tracks = [
        extent(cell.querySelectorAll(':scope > .side-right > *')),
        extent(cell.querySelectorAll(':scope > .side-left > *')),
        extent(centre),
      ];
      if (mark) {
        const r = mark.getBoundingClientRect();
        const bottom = r.top + r.height * inked(mark.textContent) - top;
        tracks[2] = tracks[2] ? [tracks[2][0], Math.max(tracks[2][1], bottom)]
                              : [r.top - top, bottom];
      }
      return {cell, top, size: parseFloat(getComputedStyle(cell).fontSize) || 16, tracks};
    }));
    for (const plan of plans) {
      let shift = 0;
      const last = [-Infinity, -Infinity, -Infinity];
      for (const {cell, top, size, tracks} of plan) {
        // Readings keep a hairline apart; a character's own side bearing
        // already separates it from the mark above it.
        const gap = .06 * size;
        let push = 0;
        tracks.forEach((t, k) => {
          if (t) push = Math.max(push, last[k] + (k < 2 ? gap : 0) - (top + shift + t[0]));
        });
        if (push > .5) {
          shift += push;
          cell.style.marginTop = (push / size).toFixed(4) + 'em';
        }
        tracks.forEach((t, k) => {
          if (t) last[k] = Math.max(last[k], top + shift + t[1]);
        });
      }
    }
  }

  window.convertKanbunDiv = convertKanbunDiv;
  window.flowKanbunColumns = flowKanbunColumns;
  window.settleKanbunColumns = settleKanbunColumns;
})();
