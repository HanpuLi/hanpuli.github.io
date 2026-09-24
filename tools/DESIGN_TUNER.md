# Local Design Tuner

This tool is deliberately local-only. It is injected by `tools/serve_site.py` only when the request has `?tune=1`; no production HTML references it.

## Start

```sh
npm run tune
```

This starts the site on `http://127.0.0.1:8766/?tune=1` and opens the default browser.

The ordinary preview remains:

```sh
npm run serve
```

which uses port 8765 and does not inject the tuner.

## Element mode

Element mode is the default.

1. Click **Pick element**, then click any element on the page. You can also Option-click an element directly, or press Option-E to enter pick mode.
2. The selected element gets a blue outline and a stable CSS selector. The inspector shows its rendered dimensions, margins and padding.
3. Edit that element only:
   - display / position
   - width, min/max width, height and min height
   - gap
   - grid column, grid row and grid-template-columns
   - individual margins and paddings
   - top/right/bottom/left offsets
   - font size, line height, letter spacing and text alignment
4. **Replace text** replaces the selected element's contents with plain text. This deliberately removes inline markup inside that element.
5. **Edit on page** makes the selected element contenteditable so text can be changed directly in context while existing markup is preserved unless you explicitly overwrite it.
6. **Reset selected** restores both the element's original markup and its element-specific CSS overrides.

Element changes are stored only in localStorage. They are reapplied when the same local tuned page is reopened.

## Global mode

Global mode retains the site-wide controls for canvas width, gutters, column gap, section spacing, copy measure, hero typography, vertical rhythm and selected 12-column grid positions.

It also provides:

- **12-column grid** overlay
- **8px baseline** overlay
- **Layout boxes** overlay
- **Option-G** toggles the grid
- **Option-T** hides/shows the whole tuner panel

## Export and reset

- **Copy CSS** copies the generated CSS overrides, including element-specific rules.
- **Copy patch** copies a JSON patch containing the page path, selectors, CSS properties, original HTML and locally edited HTML. This is the safer hand-off for converting a visual experiment into real source edits.
- **Reset all** restores all local content and style changes made by the tuner.

The tuner never writes directly to `assets/site.css` or production HTML. Treat copied fixed values as visual evidence: before committing, translate them into the appropriate responsive grid, `clamp()`, breakpoint and source-content rules, then run QA.
