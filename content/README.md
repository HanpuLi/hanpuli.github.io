# Portfolio content and localisation

This directory is the source of truth for all user-facing portfolio copy.

## Files

- `identity.json` — canonical identity data. `Hanpu Li` is the primary name; `李函璞` and `Caitlyn Lye` are alternate names.
- `shared.json` — language-independent project URLs, evidence values, technical stacks and site metadata.
- `languages.json` — supported locales and standards metadata.
- `locales/<locale>.json` — navigation, metadata, project copy, captions, accessibility text and profile copy.
- `ci-source.json` — canonical Chinese ci collection and established English reference translations: the sixteen-poem A/B cycle, its 1 July out-of-cycle A10 appendix, and the separate two-poem group dated 9 September 2026.
- `ci-translation-guidance.md` — semantic constraints distilled from the author's current annotations; use this during every literary translation review.
- `ci-translations/<locale>.json` — Japanese, German, French and Russian literary translations.
- `ci-simplified.json` — script-only Simplified Chinese mirror of the canonical ci source; its source hash is checked in CI.
- `shi-source.json` — canonical Chinese text of the poem and its two drafts.
- `shi-translations/<locale>.json` — non-Chinese translations.
- `shi-simplified.json` — script-only Simplified Chinese mirror of the canonical poem source; its source hash is checked in CI.
- `essays/trainspotting.inc` — English source fragment for the public <em>Trainspotting</em> essay.
- `essay-trainspotting.json` — per-locale metadata and the notice used by each language shell; the essay body itself remains English.
- `about-site.json` — localised implementation notes for the public About-this-site page, including architecture, typography, accessibility, performance and QA.
- `contexts.json` — localised catalogue back matter for credit-name mapping, selected professional contexts and clearly identified first-party public records.

English is the default site at `/`. Traditional Chinese (Hong Kong), Simplified Chinese, Japanese, German, French and Russian are emitted at
`/zh/`, `/zh-hans/`, `/ja/`, `/de/`, `/fr/` and `/ru/`. Ordinary language switching is static navigation. Two interactive exceptions select already-authored copy at runtime: the root custom 404 router (preserving the 404 response), and the Poetry Voucher shop (preserving the visitor's selection while changing interface language).

## Editing

Do not hand-edit generated locale pages. Change the structured source, then run:

```sh
python3 tools/build_site.py
python3 tools/i18ncheck.py
python3 tools/a11ycheck.py
python3 tools/sitecheck.py
```

`tools/build_site.py --check` fails if generated HTML or the sitemap is stale. CI runs this
check on every push. The generated head contract also includes locale alternates, Open Graph/Twitter metadata, shared icons and JSON-LD; the localisation and site checks guard those outputs.

For browser-level geometry, HTML and accessibility QA, install the pinned development dependencies with `npm ci` and run `npm run qa`. Social preview cards and the Apple touch icon are rebuilt separately with:

```sh
uv run --with fonttools --with brotli --with pillow python tools/build_social_cards.py
```

Literary translations are structurally constrained: the checker verifies the complete poem
set and preserves the source/reference line and stanza structure. Traditional Chinese remains
the canonical literary source. After changing it, regenerate only the script mirrors with:

```sh
uv run --with opencc-python-reimplemented python tools/update_simplified_literary.py
```

Editorial Simplified Chinese in `locales/zh-hans.json` is maintained independently; the helper
never overwrites it.

After changing CJK copy, rebuild the Traditional/Japanese and Simplified-Chinese subsets with:

```sh
uv run --with fonttools --with brotli python tools/rebuild-fonts.py
uv run --with fonttools --with brotli python tools/rebuild-zh-hans-font.py
```

Never add Garamond Premier Pro or another licensed local font to the repository.

## Poetry Voucher

The public project has seven static `/poetry-voucher/` overview editions, a
browser-only `/poetry-voucher/shop.html?lang=…` shop, and an order page. The former
`/poetry-voucher/make.html?lang=…` Studio redirects to the same-language shop.
Edit overview copy in `poetry-voucher.json`, the shop template in
`../templates/poetry-voucher-shop.html`, and its JavaScript, data and CSS in
`poetry-voucher-app/`. Run `python3 tools/build_site.py` to publish those sources
to the generated routes. Do not edit the generated copies independently.

The shop offers the five published literary translations (English, Japanese,
German, French and Russian) and a choice of original Chinese script,
independently of its interface language. The Simplified edition mirrors the
canonical text rather than translating it. Their authoritative text is in
`ci-source.json`, `ci-simplified.json`, `ci-translations/`, `shi-simplified.json`,
`shi-translations/` and the translated `shi.heading` values in `locales/`.
Run `python3 tools/sync_voucher_translations.py` after editing those sources;
`node tools/poetrycheck.mjs` verifies the offline catalogue is in sync.

Renderer policy and artwork constants have one source in `gallery.js`: `TARIFF`,
`PAYMENT_SCENE`, `RECEIPT_CONFIG`, `PAPER_CONFIG`, `TYPE_CONFIG` and
`SKU_DEFINITIONS`. Do not duplicate their numeric values in the studio template
or translated copy; dynamic pricing/type/payment notes are formatted from those
objects. The stable documentation fixtures are named separately as
`BASIC_SPECIMEN` in `tools/vouchertypecheck.mjs` and `EDITORIAL_SPECIMEN` in
`tools/build_poetry_voucher_editorial.mjs`. The overview shows B3 as an
original-text, cash-payment basic specimen; the homepage shows B3 with the
published English translation and a simulated card-payment editorial specimen.
Both are frozen documentation scenes, not two views of one transaction. The
CUSTOM prefix remains only for frozen historical reader editions and internal tests;
the public shop cannot issue new custom or edited-author texts.

The shop reuses `/assets/fonts/`; run both font-subsetting helpers after CJK
copy changes. `node tools/poetrycheck.mjs` checks pricing, payment denominations,
line breaking, translation completeness and the public-data boundary. The
same check compares the voucher catalogue's original text and paired
language editions with those literary sources so the copies cannot silently drift. The ordinary
site checks cover links, metadata, HTML and overview accessibility.
The GitHub browser suite includes all seven overview routes. After renderer or
specimen changes, refresh the public documentation assets explicitly with
`npm run qa:voucher -- --write-samples` and
`npm run build:voucher-editorial`; ordinary QA never rewrites those images.

The default voucher typefaces are language-specific Fusion Pixel 12px Mono
builds fetched from the upstream live preview on 2026-09-22 and pinned locally
by SHA-256 (see `assets/fonts/LICENSES.md`):
`zh_hk` for Traditional Chinese (Hong Kong), `zh_hans` for Simplified Chinese,
`ja` for Japanese, and `latin` for English, German, French and Russian.
Catalogue works keep their source language (Hong Kong Traditional Chinese)
regardless of the studio UI locale; paired editions use their own language's
pixel build. Historical custom text follows its recorded locale. The 12-dot native grid
uses 24/36-dot body sizes; small metadata stays at 12 dots. The optional
website typeface edition adds £1.99 regardless of script: EB Garamond for Latin
and Cyrillic alongside the site's CJK fonts, with 22/24/26-dot body sizes. This
is not a Mincho-only surcharge. The Latin author masthead follows the selected edition typeface; it is not a
separately charged option. Switching fonts keeps a compatible
size or resets to 24 and invalidates stale downloads. The generated pixel
webfonts and their upstream OFL notices are bundled under assets/fonts; catalogue
works do not depend on system fonts.

There is no payment service, text upload or physical printer API in this public
app. The shop persists validated catalogue selections locally. Previously consented
custom selections are moved to the retained `retiredCustom` storage field, not
deleted or added to new orders. Do not copy private device configuration,
identifiers, credentials or print-service code into it. The receipt deliberately
uses a plausible UK POS information hierarchy (store/till/transaction fields,
item tax codes, subtotal/total, VAT analysis and cash/card detail), but every
transaction and tax classification is fictional display data: the receipt says
that no payment was processed, is not proof of purchase and is not a VAT invoice.
The specimen models every displayed SKU at an illustrative 20% VAT-inclusive
rate; this is not a determination of the VAT treatment of an actual supply.
The item-level `RSP` and `AMT` columns show VAT-inclusive prices; `NET` in the
VAT summary is the pre-tax amount derived from those displayed prices.
Each distinct add-on is its own receipt line. `QTY` counts units of that line,
`RSP` is its unit price, and `AMT` is `QTY × RSP`; the subtotal and VAT summary
use those calculated line amounts. `NUMBER OF ITEMS` sums unit quantities across
all lines. Selecting several different add-ons therefore increases the item
count while each one-unit line correctly has the same `RSP` and `AMT`.
Public store, till and terminal values are stable display aliases, not hardware
or merchant identifiers. Operator number, fictional card ending, entry mode and
authorization code are derived deterministically from the local receipt reference;
they never come from a user, card or payment service. Each generated specimen gets
a local 12-digit receipt reference made from the London calendar date (`YYMMDD`)
plus six digits of browser-generated entropy; the voucher and barcode reuse that
reference, but it is not a server-backed or sequential transaction ID.
Custom glyphs missing from the bundled fonts fall back to device fonts. Physical
print calibration is separate from digital proofing.

### Shop authoring and order boundaries

Edit the shop shell in `templates/poetry-voucher-shop.html`, authored interface
translations in `poetry-voucher-app/shop-copy.js`, and behaviour/styles in
`shop.js` / `shop.css`. The build copies an explicit allowlist of app files.
The shop reuses the studio's catalogue, tariff, receipt math, type policy and
`renderVoucherBody()`; it does not maintain a second literary corpus.

A new cart line holds an unchanged catalogue work, original-script locale, any
selected published translations, font, size and quantity. Catalogue originals
can use Traditional or Simplified Chinese at the same base price; English,
Japanese, German, French and Russian translations are independent add-ons and
can be combined. Exact configurations merge. Editing is transactional;
cancel leaves the original intact. Restored lines are validated and repriced.
Orders freeze their texts, quantities, tariff, total and one payment scene.
Each voucher gets an order-linked suffix; receipt SKU counts and voucher counts
are separate. No order is cleared from the bag until its downloads are ready.
A failed export leaves the bag and the pending payment scene intact for retry.
Earlier orders remain available for the life of the tab.

Orders support up to 24 vouchers. Long receipts and poems paginate, using the
same 58 mm paper geometry and lossless one-bit PDF encoding. There is no claim
of stock scarcity, fulfilment by post, live merchant authorization or actual
payment. The catalogue, editor, bag and checkout retain seven-language keyboard
and screen-reader support. Run `npm run qa:shop` for the complete browser flow.

### Publication completeness and historic compatibility

`order-reading.js` builds the complete on-screen and offline HTML counterpart from
the frozen order. Its receipt transcription is captured from the same receipt
rendering calls, not a second pricing calculation. The HTML includes all issued
poems, translations, quantities, identities and fictional transaction fields. It
uses no external resources or scripts. The PDF remains a one-bit image document.

`tools/voucher_publication.py` generates `publication-build.js` from an explicit
list of public renderer sources and their referenced fonts. New orders record this
build and a text-snapshot hash. Old orders without this metadata remain readable;
never backfill a supposed original renderer. Changed renderers are disclosed. A
build fingerprint does not promise identical rasterisation across browsers.

`PagedPaper` adds document identity on continuation pages and page counts to all
pages of a multipage document. Single-page objects remain unchanged in this respect.

The retired Studio template is an internal optical-regression fixture only.
`tools/studio-test-fixture.mjs` serves it only by intercepting local test requests;
`make.html` in the public build is always the retirement redirect. Preserve the
old renderer coverage without reintroducing a public custom-text interface.
