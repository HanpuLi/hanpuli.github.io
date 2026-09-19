# Portfolio content and localisation

This directory is the source of truth for all user-facing portfolio copy.

## Files

- `identity.json` — canonical identity data. `Hanpu Li` is the primary name; `李函璞` and `Caitlyn Lye` are alternate names.
- `shared.json` — language-independent project URLs, evidence values, technical stacks and site metadata.
- `languages.json` — supported locales and standards metadata.
- `locales/<locale>.json` — navigation, metadata, project copy, captions, accessibility text and profile copy.
- `ci-source.json` — canonical Chinese text of the ci cycle and the established English reference translation.
- `ci-translation-guidance.md` — semantic constraints distilled from the author's current annotations; use this during every literary translation review.
- `ci-translations/<locale>.json` — Japanese, German and French literary translations.
- `shi-source.json` — canonical Chinese text of the poem and its two drafts.
- `shi-translations/<locale>.json` — non-Chinese editions.

English is the default site at `/`. Chinese, Japanese, German and French are emitted at
`/zh/`, `/ja/`, `/de/` and `/fr/`. Language switching is ordinary static navigation:
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
set and preserves the source/reference line and stanza structure. The canonical Chinese
source is never generated from a translation.

After adding or changing CJK copy, rebuild the open-font subsets with
`python3 tools/rebuild-fonts.py`. Never add Garamond Premier Pro or another licensed local
font to the repository.
