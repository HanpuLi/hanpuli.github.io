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
 *
 * flowKanbunColumns then sets the units as in a Japanese 漢文 textbook:
 * one 句 per column, broken after each clause-ending mark, every column
 * from the top; one blank column between stanzas (上下片). The title
 * block keeps the top right: the tune name (詞牌) in its own column, a
 * preface (小序) set 低二格 in smaller type, a clause a column (a clause
 * of one or two characters joins the column before). bandKanbunColumns
 * lays the body columns into bands, wrapping only between columns: every
 * band shares the body's right edge, beside the title block or, when
 * fewer than four columns fit there, below it.
 *
 * A cell is as tall as its own readings and keeps a gap below them, so
 * every reading stays beside its own character.
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

  const INDENT = 2;
  const MIN_BODY_BAND = 4;
  // A 句 longer than this wraps within itself (none does at present).
  const LONGEST = 14;
  // A band may end this many columns early to end at a stanza break.
  const STANZA_PULL = 2;

  function column(kind, part) {
    const node = document.createElement('div');
    node.className = 'kanbun-column' + (kind === 'title' ? ' kanbun-title'
      : kind === 'preface' ? ' kanbun-title kanbun-preface' : '');
    node.dataset.kanbunColumn = kind;
    if (part !== undefined) node.dataset.kanbunPart = String(part);
    return node;
  }

  const ends = unit => !!unit.querySelector(':scope > .punctuation');
  const han = units => units.filter(u => u.querySelector(':scope > .kanji')).length;

  // Units into clauses: a clause ends with the unit carrying a mark.
  function clauses(units) {
    const out = [];
    let current = [];
    for (const unit of units) {
      current.push(unit);
      if (ends(unit) || current.length === LONGEST) {
        out.push(current);
        current = [];
      }
    }
    if (current.length) out.push(current);
    return out;
  }

  // Replaces the converted heading and stanzas in root with a title block
  // (.kanbun-head) and a body block (.kanbun-text); the body's columns
  // are made here and laid into bands by bandKanbunColumns.
  function flowKanbunColumns(root) {
    const parts = [];
    const heading = root.querySelector('[data-kanbun-heading]');
    if (heading) {
      [...heading.children].filter(p => p.tagName === 'P').forEach(p => {
        const units = [...p.children].filter(n => n.classList.contains('unit'));
        parts.push({preface: p.classList.contains('kanbun-preface'),
                    clauses: p.classList.contains('kanbun-preface') ? clauses(units) : [units]});
      });
    }
    root.kanbunTitle = parts;
    const body = [];
    root.querySelectorAll('[data-kanbun-stanza]').forEach((stanza, s) => {
      const units = [...stanza.querySelectorAll(':scope > p > .unit')];
      if (!units.length) return;
      if (s) units[0].dataset.kanbunStanzaStart = '';
      if (s && body.length) {
        const gap = column('gap');
        gap.setAttribute('aria-hidden', 'true');
        body.push(gap);
      }
      for (const cells of clauses(units)) {
        const node = column('body');
        node.dataset.kanbunStanza = String(s);
        node.append(...cells);
        body.push(node);
      }
    });
    const text = document.createElement('div');
    text.className = 'kanbun-text';
    root.kanbunBody = body;
    root.replaceChildren(...(parts.length ? [setHead(parts, PACK[0])] : []), text);
    bandKanbunColumns(root);
  }

  // Han characters a packed preface column may reach: a clause a column
  // when there is room, short clauses sharing a column when the frame is
  // too narrow for the title block in one row.
  const PACK = [2, 10, 12, 14];

  // The title block: the tune name (one column; the generator keeps it to
  // twelve) and preface columns set 低二格, a clause a column, clauses
  // packed together up to `pack` characters; a clause of one or two
  // characters always joins the column before.
  function setHead(parts, pack) {
    const head = document.createElement('div');
    head.className = 'kanbun-head';
    parts.forEach(({preface, clauses}, part) => {
      const groups = [];
      for (const clause of clauses) {
        const last = groups[groups.length - 1];
        if (preface && last && (han(clause) <= 2 || han(last) + han(clause) <= pack))
          last.push(...clause);
        else groups.push([...clause]);
      }
      if (groups.length > 1 && han(groups[0]) <= 2) groups[1].unshift(...groups.shift());
      for (const cells of groups) {
        const node = column(preface ? 'preface' : 'title', part);
        if (preface)
          for (let k = 0; k < INDENT; k++) node.append(span('kanbun-indent'));
        node.append(...cells);
        head.append(node);
      }
    });
    return head;
  }

  // Lays the body columns into bands right to left for root's current
  // font size and width cap, wrapping only between columns. A band ends
  // at a stanza break when that costs at most STANZA_PULL columns; a
  // blank stanza column is not set at the edge of a band. No band is
  // left holding a single column (2026-10-22): when a full band would
  // leave one column over, the band ends at its stanza break, or, with
  // no stanza break in it, hands one column on to the last band.
  function bandKanbunColumns(root) {
    const body = root.kanbunBody;
    const text = root.querySelector(':scope > .kanbun-text');
    if (!body || !text) return;
    const size = parseFloat(getComputedStyle(root).fontSize) || 23;
    const cap = parseFloat(root.style.getPropertyValue('--kanbun-content-cap')) || 1000;
    const pitch = 2.15 * size; // column width 2.03em + gap .12em
    let head = root.querySelector(':scope > .kanbun-head');
    const fullWidth = Math.max(1, Math.floor((cap + .12 * size) / pitch));
    if (head) {
      // Keep the title block to one row where packing the preface can.
      const parts = root.kanbunTitle;
      let packed = setHead(parts, PACK[0]);
      for (const pack of PACK.slice(1)) {
        if (packed.children.length <= fullWidth) break;
        packed = setHead(parts, pack);
      }
      head.replaceWith(packed);
      head = packed;
    }
    const headColumns = head ? head.children.length : 0;
    const headWidth = headColumns ? headColumns * pitch + .8 * size : 0;
    const besideHead = Math.floor((cap - headWidth + .12 * size) / pitch);
    const side = !headColumns || besideHead >= MIN_BODY_BAND;
    const perBand = Math.max(1, side ? besideHead
      : Math.floor((cap + .12 * size) / pitch));
    root.dataset.kanbunLayout = side ? 'beside' : 'below';
    const bands = [];
    let start = 0;
    while (start < body.length) {
      while (body[start]?.dataset.kanbunColumn === 'gap') start++;
      if (start >= body.length) break;
      let take = Math.min(perBand, body.length - start);
      if (start + take < body.length && body[start + take].dataset.kanbunColumn !== 'gap') {
        for (let t = take - 1; t >= Math.max(1, take - STANZA_PULL); t--) {
          if (body[start + t].dataset.kanbunColumn === 'gap') { take = t; break; }
        }
      }
      if (body.slice(start + take).filter(c => c.dataset.kanbunColumn !== 'gap').length === 1) {
        let broken = false;
        for (let t = take - 1; t >= 2; t--) {
          if (body[start + t].dataset.kanbunColumn === 'gap') { take = t; broken = true; break; }
        }
        if (!broken && take > 1) take -= 1;
      }
      let list = body.slice(start, start + take);
      while (list.length && list[list.length - 1].dataset.kanbunColumn === 'gap') list.pop();
      const band = document.createElement('div');
      band.className = 'kanbun-band';
      band.append(...list);
      bands.push(band);
      start += take;
    }
    const widest = Math.max(1, ...bands.map(b => b.children.length));
    text.style.width = Math.ceil(widest * pitch - .12 * size) + 'px';
    text.replaceChildren(...bands);
  }

  window.convertKanbunDiv = convertKanbunDiv;
  window.flowKanbunColumns = flowKanbunColumns;
  window.bandKanbunColumns = bandKanbunColumns;
})();
