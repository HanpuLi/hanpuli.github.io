# Poetry catalogue and edition model

The poetry site is organised around works, not around the first collection that happened to be published on it. The existing static Python build remains in use.

## Authoritative records

`content/poetry/library.json` contains:

- **works**: stable semantic identities, literary form, first-date precision, narrator where applicable, related works and their versions;
- **collections**: an explicit ordered membership list, independent of the members’ narrator and form;
- **versions**: one work’s authored text versions, with their own dates and ordered parts;
- **texts**: one complete text or version-part, with the Chinese original and the translations belonging to that version;
- **offers**: the text parts currently available as paper editions;
- **legacy**: mappings for existing public fragments and catalogue identifiers.

Collection size is derived from membership, never imposed to preserve an old title. The A/B sequence includes A10 in its established final position. The first sixteen entries retain their collective date attribution; A10 has its own July date. The collection’s short title is A and B / 甲乙. A1, B1 and their Chinese forms remain meaningful authorial labels.

Roof is one two-part work with two retained drafts. Four paper options do not make it four independent works. The two 2026 rewritings of the 2022 Manjianghong share a work identity; the independent later response is linked to them without being labelled another draft. The 2017 Summer poem retains its bespoke mirrored layout. Its Chinese scripts and five published translations live in the same version record; each language page renders its own complete text and links to the Chinese original. Translations preserve stanza and line structure, including the repeated refrain and final break; the equal CJK-character counts apply only to the Chinese original. Paper-edition offers are registered separately, not inferred from the presence of translations.

`content/poetry/simplified.json` is a script mirror. Per-original hashes preserve previously reviewed conversions when unrelated metadata changes. `poetry/ui.json` contains seven-locale catalogue and navigation copy. `poetry/translation-guidance.md` records semantic editorial constraints.

## Routes and reading order

The catalogue is `/poetry/`; `/poetry/chronology/` is a date-based view of the same works. Each locale uses the same route slugs. Collections keep their reading order rather than being flattened into a chronological list of isolated texts.

Examples:

```text
/poetry/jia-yi/#jia-10
/poetry/queqiaoxian-20181222/
/poetry/roof-splits/#draft-2-part-1
/poetry/manjianghong-2022/#sewn
/poetry/manjianghong-2022/#echo
/poetry/manjianghong-rereading-202610/
```

Reader pages include original/translation pairs, version navigation, related-work links, collection navigation and the correct paper-edition selection link. Language switching preserves the current member or version fragment. The catalogue, reader links, sitemap and paper source links come from the same model.

`ci.html` and `shi.html` remain noindex recovery pages. Their old fragments map to canonical reading routes. The JavaScript enhancement changes location; named static links remain available when JavaScript is disabled. Existing identifiers are never reassigned to another poem.

## Poetry Voucher and historical data

The catalogue is generated from `offers`, not maintained as another literary database. Current offer IDs identify works and versions. Cards show titles, version information and collection membership instead of W counters. New paper receipts use descriptive edition codes; A/B labels are retained. Standalone voucher references use the existing receipt reference and unit suffix, not a global literary sequence number.

Unsettled legacy bag selections resolve through `legacy_ids`, retain quantity, script, translations, font and size, and use the current canonical offer. Unknown selections still fail validation. Previously consented custom text is not discarded or offered as a new authored poem.

Already issued orders are different: they keep their embedded work, title, text, source ID, source URL, price, receipt reference and text-snapshot hash. They are not passed through the current catalogue to relabel them. Existing W-labelled historic orders remain historically W-labelled. Their old source links still work through the recovery pages. A changed renderer is disclosed by the existing publication-build mechanism.

The catalogue is schema 2. Versioned client asset URLs isolate this schema-changing release from older cached scripts. Static documentation specimens may be explicitly regenerated; they are not user-issued orders. Photographs of earlier physical examples remain unchanged.

## Generated compatibility views

The `ci-source.json`, `ci-simplified.json`, `ci-translations/`, `shi-source.json`, `shi-simplified.json`, `shi-translations/` and `summer-poem.json` files under `content/` are generated compatibility views. They are not authoring inputs. The old `voice: separate` category and a hard-coded sixteen-member validator no longer determine publication structure.

The CLI names `update_simplified_literary.py` and `sync_voucher_translations.py` remain available but now read the canonical library. `build_site.py --check` checks the generated projections as well as the pages.

## Editing and verification

After an authorised content or version change:

```sh
uv run --with opencc-python-reimplemented python tools/update_simplified_literary.py
python3 tools/build_site.py
uv run --with fonttools --with brotli python tools/rebuild-fonts.py
uv run --with fonttools --with brotli python tools/rebuild-zh-hans-font.py
python3 tools/build_site.py
npm run build:design
python3 tools/build_site.py --check
python3 tools/i18ncheck.py
python3 tools/poetryarchitecturecheck.py
python3 tools/sitecheck.py
npm run qa
```

Generate pages before scanning them for font subsets. Never replace an old work’s ID to change display order. Add a collection membership, version or work record as appropriate. Do not infer a first composition date from a revision date.

`poetryarchitecturecheck.py` verifies the migration’s existing body hashes, ordered membership, work/version ownership, locale routes, script mirrors, old fragments and paper links. The fixtures pin already published text versions, not a maximum number of future poems. `poetrymigrationcheck.mjs` exercises real browser navigation, no-JavaScript recovery, legacy bag selection, immutable historical orders and a fresh virtual checkout. The normal HTML, accessibility, browser, shop, font, wrapping and privacy checks remain in the test suite. None of these tests contacts a printer or processes a payment.
