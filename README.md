# hanpuli.github.io

Personal portfolio and writing site for Hanpu Li, published with GitHub Pages at https://hanpuli.github.io/.

The site is deliberately static: handwritten HTML/CSS, local image/font assets, no JavaScript framework and no build-time dependency chain. The repository also hosts the public privacy/terms pages for the mail-assistant project.

## Local checks

Run the same integrity check used by CI:

```sh
python3 tools/sitecheck.py
```

The checker verifies local links and fragments, image/CSS assets, duplicate IDs, image alt text, document language, titles and responsive viewport metadata without making network requests.

For a local preview:

```sh
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/.

## Content and rights

The repository is public so the site can be served by GitHub Pages. Publication does **not** grant a blanket open-source licence over the photographs, poems, essays, translations or other creative work. Third-party reuse requires permission unless applicable law provides otherwise.
