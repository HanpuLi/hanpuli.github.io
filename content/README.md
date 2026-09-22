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

English is the default site at `/`. Traditional Chinese (Hong Kong), Simplified Chinese, Japanese, German, French and Russian are emitted at
`/zh/`, `/zh-hans/`, `/ja/`, `/de/`, `/fr/` and `/ru/`. Ordinary language switching is static navigation. Two interactive exceptions select already-authored copy at runtime: the root custom 404 router (preserving the 404 response), and the Poetry Voucher studio (preserving the visitor's unsaved text while changing interface language).

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

The public project has two surfaces: seven static `/poetry-voucher/` overview
editions and one browser-only `/poetry-voucher/make.html?lang=…` studio.
Edit overview copy in `poetry-voucher.json`, the studio template in
`../templates/poetry-voucher-studio.html`, and its JavaScript, data and CSS in
`poetry-voucher-app/`. Run `python3 tools/build_site.py` to publish those sources
to the generated routes. Do not edit the generated copies independently.

The studio reuses `/assets/fonts/`; run both font-subsetting helpers after CJK
copy changes. `node tools/poetrycheck.mjs` checks pricing, payment denominations,
line breaking, translation completeness and the public-data boundary. The
ordinary site checks cover links, metadata, HTML and overview accessibility.
The GitHub browser suite includes all seven overview routes.

The default voucher typeface is Fusion Pixel, included for every supported
language (the bundled Traditional-Chinese variant also contains Latin accents,
Cyrillic, kana and Simplified-Chinese glyphs). Its 12-dot native grid uses
24/36-dot body sizes; small metadata stays at 12 dots. The optional website
typeface edition adds £1.99 regardless of script: EB Garamond for Latin and
Cyrillic alongside the site's CJK fonts, with 22/24/26-dot body sizes. This
is not a Mincho-only surcharge. The Latin author masthead is
fixed identity typography, not a separately charged option. Switching fonts
keeps a compatible size or resets to 24 and invalidates stale downloads.
The full unmodified pixel webfont and its upstream OFL notices are bundled
under assets/fonts; it is not dependent on system fonts for catalogue works.

There is no payment service, text upload, persistent text storage or physical
printer API in this public app. Do not copy private device configuration,
identifiers, credentials or print-service code into it. Public `TILL` and `PRN`
values are display aliases, not hardware serial numbers. Custom glyphs
missing from the bundled fonts fall back to device fonts. Physical print calibration
is separate from digital proofing.
