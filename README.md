# hanpuli.github.io

Personal portfolio and writing site for Hanpu Li, published with GitHub Pages at https://hanpuli.github.io/.

The site is deliberately static: editorial HTML/CSS, local image/font assets and no client-side application framework. A small standard-library Python generator produces complete static English, Chinese, Japanese, German, French and Russian editions from structured content; there is no runtime translation layer. The repository also hosts the public privacy/terms pages for the mail-assistant project.

## Local checks

Regenerate pages after editing structured copy, then run the same checks used by CI:

```sh
python3 tools/build_site.py
python3 tools/build_site.py --check
python3 tools/i18ncheck.py
python3 tools/a11ycheck.py
node --check assets/accessibility.js
python3 tools/sitecheck.py
```

The localisation checker enforces locale-schema parity, the complete literary corpus, line/stanza structure and generated `hreflang` metadata. The accessibility checker covers landmark and heading structure, accessible names, labelled controls, skip-link targets, keyboard-order hazards and the reading-preference controls across the generated portfolio, mail-assistant and fridge pages. The site checker verifies local links and fragments, image/CSS assets, duplicate IDs, image alt text, document language, titles and responsive viewport metadata without making network requests.

## Accessibility

The portfolio, literary pages and mail-assistant policy pages provide persistent, local-only reading preferences for sans-serif text, larger type, increased text spacing, shorter line length, a simplified one-column layout, reduced motion and higher contrast. The fridge guide has its own large-text and high-contrast controls. These controls are progressive enhancement: the content remains complete when JavaScript or storage is unavailable. System `prefers-reduced-motion`, `prefers-contrast` and forced-colours settings are respected independently of the manual controls.

The default presentation retains the editorial design but is built to reflow without horizontal scrolling at narrow/zoomed viewports, preserve visible keyboard focus and real skip-link focus, avoid forced new windows, expose full language names to assistive technology, and keep standalone interactive targets comfortably sized. Do not remove these behaviours when changing the visual design.

User-facing copy is maintained under `content/`; `templates/` contains layout only. Do not hand-edit generated language pages.

For a local preview:

```sh
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/.

## Content and rights

The repository is public so the site can be served by GitHub Pages. Publication does **not** grant a blanket open-source licence over the photographs, poems, essays, translations or other creative work. Third-party reuse requires permission unless applicable law provides otherwise.
