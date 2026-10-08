# Site icon vector sources

`site-mark-web.svg` is the source for `tools/build_site_icon.mjs`. It has no paper layer, embedded bitmap, font dependency or external resource. Light mode retains the original pigment colours; dark mode adapts the pigment colours to the site's `#e8e4dc` ink and `#cf765e` accent.

`site-mark-layered.svg` is the editable master in the original palette. Its independent paper layer is hidden by default. The ink group contains the dark strokes, red stroke and contact underpaint, with one shared vector coverage mask. Turning on the paper layer restores the paper reference without changing the ink geometry.

Both files use a 900 by 900 coordinate system. The red outer contour has 63 cubic Bézier segments; the four visible dark-stroke components use 140. Pigment variation and dry-brush flecks are retained as vector paths and coverage masks. The source RGB bitmap has no original alpha channel, so flywhite transparency is inferred from its brightness and measured paper colour. The narrow sampled outer fringe is reconstructed to let the Bézier contours control antialiasing. Paper hidden beneath the source ink is filled with the measured source-paper median, rather than claiming to recover an invisible texture.

The original bitmap reference remains in `assets/site-mark.svg`; its embedded WebP SHA-256 is `cb0cbb701055e2042d6b9bb2f53b63844d3de48026e8d5b6dbd39add4dd94eee`.

These detailed source files contain many paths. GitHub Pages excludes `docs/`, so visitors receive the small rendered PNG/ICO files. Rebuild with `node tools/build_site_icon.mjs`; after changing an icon, update the shared icon cache version, manifest icon URLs and all page-head sources, then regenerate the multilingual pages.
