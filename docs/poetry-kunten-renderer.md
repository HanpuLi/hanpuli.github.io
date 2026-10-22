# Japanese kanbun reading layer: independent viewer prototype

Status: experimental branch, not released. All 32 classical text versions
now have manually edited, source-anchored editorial pilot marks. The original
Chinese corpus and separate 書き下し文 are unchanged by the mark renderer.
A10 and 鵲橋仙 require explicit interpretative glosses rather than inventing
traditional points for modern expressions. Coverage does **not** amount to
an academically certified Japanese kanbun edition. See
poetry-kunten-collation.md for coverage, uncertainties and textual decisions.

## Source and presentation boundaries

- The original poem's Traditional Chinese text remains solely in
  content/poetry/library.json. The parent page contains its complete and
  exactly copyable Unicode body, normal headings and stanza boundaries.
- Reviewed additions in content/poetry/kunten.json are keyed by each
  source-text SHA-256 and zero-based Unicode codepoint positions, not visual
  layout coordinates. A stale source, unsupported annotation or misplaced
  marker causes the generator to fail.
- Titles are read text too (2026-10-14). Each manuscript and 書き下し
  entry carries a `title` list, one item per part of the 《…》 title
  (tune name, preface, version note; a sequence label such as 甲四 is
  navigation and is not read). The 書き下し disclosure prints the read
  title above the body.
- Layout (2026-10-14): as in a Japanese 漢文 textbook. Each 句 is one
  column from the top, broken after every clause-ending mark (，。、！？；：,
  the mark staying with its character); there is no fixed column length.
  One blank column separates stanzas (上下片). The title is a right-hand
  block: the tune name in its own column (a short unpunctuated part such
  as 無題 · 臨江仙 or 滿庭芳 · 遙思楚潭 shares it, ≤12 Han); a preface
  set 低二格 in smaller type with proportionally shorter cells, a clause
  a column, a clause of one or two characters joining the column before.
  On narrow frames the body wraps into bands only between columns; every
  band starts at the body's right edge, beside the title block, or below
  it when fewer than four columns fit beside it; bands are separated by
  space and a hairline, and a band ends at a stanza break when that costs
  at most two columns. A cell is as tall as its own readings plus a gap,
  so every reading stays beside its own character. The generated page
  keeps the source title parts, stanzas and lines; kanbun-render.js
  (flowKanbunColumns, bandKanbunColumns) sets them.
- tools/poetry_kunten.py builds one standalone, noindex HTML presentation
  document per reviewed work inside assets/kanbun-viewer/works/. It preserves
  paragraph and stanza source boundaries, and passes textual reading marks
  in the manuscript syntax of tools/poetry_kunten_manuscript.py.
- assets/kanbun-viewer/kanbun-render.js and kanbun-render.css are the
  site's own vertical typesetter (2026-10-14; it replaced a vendored
  third-party renderer). Each Han character is one .unit with a fixed
  three-track grid: left side (再読 reading, return mark), character and
  punctuation, right side (furigana, okurigana sinking into the lower
  half). Tracks never share horizontal space and rows are auto-sized, so
  readings cannot be drawn over a character or each other.
- assets/kanbun-viewer/viewer.js is a separately sandboxed document
  controller. It sends only the manuscript ID, source checksum and measured
  viewport dimensions to the host. There are no third-party network calls.
- assets/poetry-kunten-host.js connects the iframe through postMessage,
  checking WindowProxy identity, exact text ID, source SHA-256, numeric
  dimensions and bounded ranges before showing its output. The iframe
  deliberately has sandbox=allow-scripts without allow-same-origin.
  If it fails, the parent continues showing the canonical original.
- The original remains the accessible text when the visual reader is on:
  its source composition is visually clipped, not removed from the
  accessibility tree. The framed visual rendition is aria-hidden. An
  explicit copy button and the viewer's own copy event put only the
  unmodified Chinese characters on the clipboard.

The Japanese user interface initially requests marked reading *for reviewed
texts only*, but a reader may select 白文, switch to horizontal layout, or
enable simplified reading. No-script browsers always see the original.

## Licensing

All renderer code (kanbun-render.js/.css, viewer.js/.css, the generated
page template) is the site's own code; no third-party renderer is
distributed. The poems, Japanese readings and editorial marks embedded
as data are the author's literary works; see README.md.

## Tested locally

- python3 tools/build_site.py --check
- python3 tools/poetryarchitecturecheck.py
- python3 tools/i18ncheck.py
- python3 tools/a11ycheck.py
- python3 tools/sitecheck.py
- npm run qa:poetry-layout (Chromium and the WebKit environment variant)
- npm run qa:poetry-kunten
- npm run qa:poetry-kunten-multiline
- npm run qa:poetry-kunten-zoom

The dedicated browser test checks widths 320/390/1280 in both engines,
the exact original text, source selection/copy, responsive overflow,
return-mark count, clipboard contents, dark/high-contrast colour
transmission, keyboard controls, disabled JavaScript, loss of the iframe
URL, sandbox isolation and the axe WCAG A/AA audit. The current test
also checks the actual bounding rectangles of the kanji, furigana,
okurigana, and return marks, rejecting clipping and overlapping glyph
boxes. The no-script source retains its text but does not show an inert
toggle.

The initial browser-independent sizing was insufficient: WebKit sometimes
reported a 17 px overflow, while moving the frame completely offscreen
could suspend its animation frames and prevent its initial ready message.
The frame synchronously measures the union of rendered mark and kanji
boxes at first load and after font/column updates. ResizeObserver also
measures directly: animation frames can be suspended in offscreen frames.
Observed scrolling is included, and the frame does not shrink beneath a
previously confirmed width at the same column cap. This avoids using
guessed per-character padding.

The original host rejected a legitimate iframe height above 3000px when
五段乙六 was enlarged to 200%, leaving most of the poem clipped. The
verified five-stanza rendering exceeds 4200px at the largest tested
font; the host now accepts source-matched dimensions up to 20000px.
This threshold is a resource bound, not a fixed poem line limit.

A second fault was in the inherited PoetryFlow band splitter: after it
moved original stanza elements out of the document and rendered cloned
bands, the next reflow checked computed writing-mode on the detached
originals. Browsers report these as horizontal, so repeated reflows
alternated between split and unsplit stanzas. It now checks the attached
displayed stanza. The dedicated zoom regression repeatedly reflows
both marked and unmarked poems in Chromium and WebKit at 320/390px,
with 200% text scaling; no width overflow or poem truncation remains.
Five consecutive six-viewport Chromium/WebKit regression runs passed
on the 2026-10-13 developer build, followed by a complete npm run qa
and a final targeted rerun for the no-JS toggle. An executable test
result does not certify the linguistic correctness of the markings.

## Next work

1. Complete philological review of all 32 annotated versions, including
   modern/colloquial particles, nested returns, 再読文字 and variant glyphs.
   All manuscripts now have source-aligned pilot marks; no historical
   authenticity is implied by the completed structural coverage.
2. Test independently authored multiline and multistanza examples at
   narrow widths before enabling them. Preserve authored stanza boundaries;
   a wide stanza must split only at source line boundaries.
3. Review the licence boundary and the Japanese serif webfont behaviour
   within a sandboxed frame on real iOS. The iframe currently uses
   system serif fallbacks when the local Shippori webfont is unavailable.
4. Perform human screenshot signoff before deploying. Keep this branch
   isolated from the author's unrelated source changes.
