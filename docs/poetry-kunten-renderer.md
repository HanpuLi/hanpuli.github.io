# Japanese kanbun reading layer: independent viewer prototype

Status: experimental branch, not released. All 29 classical text versions
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
- tools/poetry_kunten.py builds one standalone, noindex HTML presentation
  document per reviewed work inside assets/kanbun-viewer/works/. It preserves
  paragraph and stanza source boundaries, and passes textual reading marks
  in the syntax understood by the upstream renderer.
- assets/kanbun-viewer/vendor/kanbun.js and vendor/kanbun.css are exact
  copies of untunt/kanbunHTML revision 814cb25. The isolated viewer uses
  its native betagumi (solid-setting) mode, including split-touching-kana.
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

## Licensing and deployment gate

kanbunHTML is AGPL-3.0. Exact upstream file SHA-256 hashes and its
licence are recorded in assets/kanbun-viewer/NOTICE.md. The isolated
viewer programs and generated structural template carry AGPL terms;
original Chinese poems, authored Japanese readings and editorial content
embedded as data retain their separate literary copyright. A generated
HTML file can contain code and literary material with different rights:
the reader must not infer that the author's text is newly AGPL-licensed.
The parent portfolio is not wholesale relicensed here.

Whether a distributed parent and frame are separate works, given their
particular communication and usage, is a legal conclusion rather than a
property established by sandbox. Do not publish the AGPL components
before compatibility with the site's existing licensed and unlicensed
parts has been reviewed. See the GNU licence FAQ on aggregations and
combining programs. The TeX alternative gckanbun is MIT licensed but
its SVG output is paths-only and requires a separate accessible text.

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

1. Complete philological review of all 29 annotated versions, including
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
