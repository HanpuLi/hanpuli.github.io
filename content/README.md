# Portfolio content and localisation

This directory is the source of truth for all user-facing portfolio copy.

## Files

- `identity.json` — canonical identity data. `Hanpu Li` is the primary name; `李函璞` and `Caitlyn Lye` are alternate names.
- `shared.json` — language-independent project URLs, evidence values, technical stacks and site metadata.
- `languages.json` — supported locales and standards metadata.
- `locales/<locale>.json` — navigation, metadata, project copy, captions, accessibility text and profile copy.
- `ci-source.json` — canonical Chinese text of the ci cycle and the established English reference translation.
- `ci-translation-guidance.md` — semantic constraints distilled from the author's current annotations; use this during every literary translation review.
- `ci-translations/<locale>.json` — Japanese, German, French and Russian literary translations.
- `ci-simplified.json` — script-only Simplified Chinese mirror of the canonical ci source; its source hash is checked in CI.
- `shi-source.json` — canonical Chinese text of the poem and its two drafts.
- `shi-translations/<locale>.json` — non-Chinese translations.
- `shi-simplified.json` — script-only Simplified Chinese mirror of the canonical poem source; its source hash is checked in CI.
- `essays/trainspotting.inc` — English source fragment for the public <em>Trainspotting</em> essay at `/writing/trainspotting/`.

English is the default site at `/`. Traditional Chinese (Hong Kong), Simplified Chinese, Japanese, German, French and Russian are emitted at
`/zh/`, `/zh-hans/`, `/ja/`, `/de/`, `/fr/` and `/ru/`. Language switching is ordinary static navigation:
there is no runtime translation layer and no language-selection JavaScript.

## Editing

Do not hand-edit generated locale pages. Change the structured source, then run:

```sh
python3 tools/build_site.py
python3 tools/i18ncheck.py
python3 tools/sitecheck.py
```

`tools/build_site.py --check` fails if generated HTML or the sitemap is stale. CI runs this
check on every push.

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
