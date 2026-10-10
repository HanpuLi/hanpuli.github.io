# hanpuli.github.io

Personal portfolio and writing site for Hanpu Li, published with GitHub Pages at https://hanpuli.github.io/.

The site is deliberately static: editorial HTML/CSS, local image/font assets and no client-side application framework. A small standard-library Python generator produces complete static English, Traditional Chinese (Hong Kong), Simplified Chinese, Japanese, German, French and Russian editions from structured content. A quiet `Credits & contexts` back-matter page keeps credit names and selected professional records separate from the work pages. Ordinary pages have no runtime translation layer; the root custom 404 carries a small path-aware locale router because GitHub Pages serves the same root 404 document for real missing URLs in every language tree. The repository also hosts the public privacy/terms pages for the mail-assistant project.

Traditional and Simplified Chinese use locally hosted subsets derived from
I.MingCP 8.10, including Chinese names on other language editions and the
Poetry Voucher website-font option. Japanese retains Shippori, Latin retains
EB Garamond / Courier Prime, Russian retains the existing Cyrillic faces, and
accessibility reading preferences retain their alternative fonts. The original
bitmap voucher option remains available. Subsets have distinct internal names
and preserve copyright/licence metadata. See
`assets/fonts/CHINESE_FONT_LICENSES.txt` for the IPA licence, materials and
original-font replacement instructions. Rebuild with
`uv run --with fonttools --with brotli python tools/rebuild-chinese-fonts.py`;
`--check` verifies coverage, hashes and both CSS unicode ranges.


## Poetry catalogue

`/poetry/` is the shared entrance for poems, sequences and retained versions. Each language has the same work routes. `/poetry/chronology/` indexes first dates without splitting a sequence into unrelated entries. The A/B sequence contains its seventeen author-confirmed members, including A10. Roof remains one two-part work in two drafts; the two Manjianghong rewritings share one work, while the later response has its own identity.

All literary content is authored in `content/poetry/library.json`. The simplified mirror, old ci/shi JSON files, canonical readers, old-route recovery pages and Poetry Voucher catalogue are generated views. See `docs/poetry-architecture.md` for editing and compatibility contracts.

Traditional Chinese classical originals default to vertical text and titles in
every interface language. A horizontal/vertical control remembers the reader's
choice locally; Simplified Chinese originals default to horizontal text, and
translations retain their horizontal layout.
The A/B labels remain horizontal metadata. Short titles stay in one vertical
column; narrow screens place complete stanzas in successive bands and divide an
oversized stanza only between authored lines. Modern poems retain their authored
horizontal lines. Simple reading uses horizontal text. With scripts disabled, the
complete original and translations remain available horizontally. Poem blocks
are centred without centring or rewriting the individual authored lines.
`npm run qa:poetry-layout` exercises these behaviours in Chromium;
`POETRY_LAYOUT_ENGINE=webkit npm run qa:poetry-layout` checks WebKit as well.

## Local checks

Regenerate pages after editing structured copy, then run the dependency-free checks used by the first CI job:

```sh
python3 tools/build_site.py
python3 tools/build_site.py --check
python3 tools/i18ncheck.py
python3 tools/poetryarchitecturecheck.py
python3 tools/a11ycheck.py
node --check assets/accessibility.js
python3 tools/sitecheck.py
python3 tools/firstlovecheck.py
node tools/poetrycheck.mjs
```

The localisation checker enforces locale-schema parity, the complete literary corpus, Simplified-Chinese script data and line/stanza parity, generated `hreflang` metadata and the shared social/structured-data contract. The accessibility checker covers landmark and heading structure, accessible names, labelled controls, skip-link targets, keyboard-order hazards and reading-preference controls. The site checker verifies local links and fragments, image/CSS assets, duplicate IDs, image alt text, document language, titles, viewport metadata and valid JSON-LD without making network requests.

Browser QA is pinned in `package-lock.json`. After `npm ci`, run:

```sh
npm run qa
```

## First Love public abstract

The seven-language First Love abstract and the former `/status/` and `/read/` URLs are generated from `content/first-love-public.json` by `tools/first_love_public_pages.py`. Home-page links lead to the abstract; the legacy URLs remain as noindex landing pages that point there. `tools/firstlovecheck.py` verifies that no page links to the retired full reader, that the abstracts are present, and that the page CSP and public-file boundary remain intact. The full reader was public on 24 September 2026 and was withdrawn the same day while journal options were considered. Its old URL redirects to the abstract through a separate process that does not load the manuscript; all former page, figure, search and session routes return 404. The old whole-PDF service remains retired.

This validates tracked public HTML, then uses Chromium to exercise the seven portfolio locales at 320, 390, 520, 640, 768, 900, 1024, 1440 and 1728 px across the home, ci, poem, About, Credits & contexts, essay, Poetry Voucher and 404 page types. Each page is loaded once and resized through the matrix so intermediate-width regressions are covered without multiplying network waits. It checks page-level overflow, clipped navigation labels, overlapping interactive targets and wide-screen 404 quotation wrapping across every locale. Since the dependency-free accessibility checker already inspects every generated page structurally, axe-core runs the eight page types in representative English and Simplified-Chinese editions at narrow and wide widths rather than repeating the same DOM audit seven times. A second browser pass serves real missing URLs with GitHub Pages-style custom-404 semantics and verifies the 404 status, path-based locale selection, root-relative stylesheet loading, language switching and axe results at phone and desktop widths. The same suite runs in the `browser-qa` CI job after the dependency-free checks pass. `npm run qa:wrap` also reads the computed text wrapping of every published HTML page at phone width; the local `WRAP_ENGINE=webkit npm run qa:wrap` variant checks the same contract in WebKit.

The Traditional Chinese literary source remains canonical. After changing `content/poetry/library.json`, regenerate only its script mirrors and compatibility views before building:

```sh
uv run --with opencc-python-reimplemented python tools/update_simplified_literary.py
```

The mirrors record the source SHA-256 and CI fails if they become stale. Editorial Simplified-Chinese UI copy in `content/locales/zh-hans.json` is maintained separately and is not overwritten by that helper.

## Poetry Voucher

The portfolio includes [Poetry Voucher](https://hanpuli.github.io/poetry-voucher/),
a seven-language project overview and an author-only poetry shop. The former
open-text Studio is retired; its old URL redirects to the same-language shop.
The shop offers registered paper editions with Traditional or Simplified Chinese
originals, optional published translations, typeface and size choices, quantities,
a local bag, fictional checkout, image PDFs and a complete offline HTML reading copy.
There is no real payment, upload or delivery. The order page can hand its receipt and all poem vouchers to an H10S only when it is open inside that device's paired local wrapper and the user taps the print button; the public site has no remote print endpoint.

The work is intended to be encountered on paper. The project overview now shows
scans of two actual B3 and B4 thermal-paper editions printed on 26 September 2026,
alongside the separately labelled, historical digital specimen. Scan geometry is
corrected without reconstructing printed text. These two objects do not establish
physical calibration of every output configuration.
Production decisions and the boundary between the author's intention and untested
audience interpretations are recorded in [the publication note](docs/poetry-voucher-publication.md).

New orders have a UUID distinct from the displayed receipt number, so a number collision cannot replace another order or share its print identity. Legacy order URLs and H10 identities are preserved. Frozen snapshots are validated before rendering; recovery never reprices their contents from the current catalogue.

Orders freeze their contents, prices, payment scene and, for new orders, text and
render-build identities. Long outputs retain continuation numbers. Reopening an
old order with another renderer is disclosed as re-rendering; earlier orders with
no recorded build are not assigned an invented one. Previously consented custom
text is retained locally, but no new custom editions can be ordered. Frozen old
reader-edition orders remain readable.

The authoring map is in `content/README.md`. Run `npm run qa:shop`,
`npm run qa:shop-locales` and `npm run qa:author-shop` for transaction, locale,
offline-reading, author-boundary and historical-order checks. The older Studio
renderer tests use a request-intercepted local fixture, not the public Studio URL.
Ordinary checks do not overwrite historical specimens.

## Accessibility

The portfolio, literary pages and mail-assistant policy pages provide persistent, local-only reading preferences for sans-serif or OpenDyslexic text, larger type, increased text spacing, shorter line length, a simplified one-column layout, reduced motion and higher contrast. The settings open in an anchored panel and remain progressive enhancement: core reading content stays available when JavaScript or storage is unavailable, while optional runtime enhancements may be absent. System `prefers-reduced-motion`, `prefers-contrast` and forced-colours settings are respected independently of the manual controls.

The default presentation retains the editorial design but is built to reflow without horizontal scrolling at narrow/zoomed viewports, preserve visible keyboard focus and real skip-link focus, avoid forced new windows, expose full language names to assistive technology, and keep standalone interactive targets comfortably sized. Do not remove these behaviours when changing the visual design. The Poetry Voucher shop and studio use the same eight local reading preferences, with labelled controls, keyboard operation and text readings alongside the voucher image proofs.

User-facing copy is maintained under `content/`; `templates/` contains layout only. Do not hand-edit generated language pages.

## Responsive layout

The default layout uses progressive enhancement rather than device-specific templates. Keep the existing viewport media queries as conservative fallbacks, but prefer content-responsive CSS for new work:

- section and project alignment uses `subgrid` where available;
- project-number rails and chronology dates use intrinsic sizing (`max-content` / `minmax()`) instead of fixed character assumptions;
- Writing, Research, Photography, Profile and the long-form essay use named size containers and `@container` rules for reflow;
- component type and spacing can use `cqi` so they respond to the component's own width rather than the browser viewport;
- titles and display decks use balanced wrapping, prose follows natural line filling, source poem lines retain their explicit breaks, and German/French/Russian prose may hyphenate automatically while headings and metadata do not;
- directional spacing uses logical properties (`inline-start` / `inline-end`);
- `:has()` is used only as progressive enhancement for content-aware spacing;
- below-the-fold sections use `content-visibility: auto` with generic remembered intrinsic sizes, not locale-specific height equations;
- cross-document View Transitions are optional progressive enhancement and must remain disabled by `prefers-reduced-motion` and the site's reduced-motion reading preference.

When a component breaks at a particular width, first fix its intrinsic/container rules. Do not add a new viewport breakpoint unless the fallback layout genuinely needs one. Preserve the photography sequence order; responsive reflow may change column count, but must not use masonry or reorder the images.

For a local preview:

```sh
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/.

## Social previews and link health

The index and portfolio pages use repository-local 1200×630 Open Graph cards carrying the shared site mark. Social platforms use these cards rather than the favicon, so the mark is composed into the card artwork itself. The site icon sets a red ink stroke across two dark editorial rules, echoing the home page’s question of whether evidence supports a claim.

`docs/site-icon/site-mark-web.svg` is the paper-free vector source, preserving the original mark's curved contours, ink variation and dry-brush texture. `docs/site-icon/site-mark-layered.svg` keeps the independently editable paper layer hidden by default. These full-detail SVG sources are excluded from GitHub Pages; `assets/site-mark.svg` retains the original bitmap reference.

The icon build produces 16/32/48/64 px browser PNGs, 32/64 px dark-mode variants, the root `favicon.ico` fallback, a 180 px Apple touch icon, 192/512 px web-app icons and a padded 512 px maskable icon. Browser icons use the website's plain light or dark background without paper texture. `site.webmanifest` supplies the installable-web-app identity. Rebuild the icons with the pinned browser dependencies after `npm ci`:

```sh
node tools/build_site_icon.mjs
```

Rebuild the social cards from the self-hosted fonts with:

```sh
uv run --with fonttools --with brotli --with pillow python tools/build_social_cards.py
```

A separate scheduled workflow runs `tools/linkcheck_external.py` weekly against external links in the generated personal-site pages. It is intentionally independent of deployment: genuine 404/410 responses fail that audit, while rate limits, bot blocks, timeouts and 5xx responses are reported as indeterminate instead of breaking ordinary site publication.

`tools/build_site.py` also generates `sitemap.xml` for every indexable canonical portfolio route. Each localized URL carries the complete reciprocal `hreflang` family plus `x-default`; `robots.txt` advertises the sitemap. `tools/sitecheck.py` verifies sitemap membership, reciprocal locale mappings, canonical URLs, the absence of `noindex` on sitemap entries, descriptions, social metadata, JSON-LD, manifest fields and install-icon dimensions so discovery and app identity cannot silently drift from generated pages. GitHub Pages is configured through `_config.yml` to exclude the source-only `content/`, `docs/`, `templates/`, `tools/`, package metadata and repository documentation from the deployed site; those files remain available in the repository but are not part of the public web tree.

## Content and rights

The repository is public so the site can be served by GitHub Pages. Publication does **not** grant a blanket open-source licence over the photographs, poems, essays, translations or other creative work. Third-party reuse requires permission unless applicable law provides otherwise.
