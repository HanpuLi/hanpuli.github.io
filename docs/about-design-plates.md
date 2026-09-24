# Measured About plates — 24 September 2026

Replaces the abstract box diagrams and the Courier receipt imitation with
current-renderer specimens and measured page anatomy. The older project
specimen at the top of its essay remains separately dated and unchanged.

- Site: the actual research entry in seven languages, measured at 1440 and
  390 CSS px. The parent grid supplies inherited subgrid track sizes; they
  are not twelve equal tracks. Overlay positions use measured DOM rectangles.
- Typography: real text, computed size/leading/tracking, and Chromium's painted
  font faces. The lower samples retain the typeface, size and tracking but reflow locally.
  Their unitless leading has a 1.3 minimum; source and sample leading are
  labelled separately when different, to avoid cramped CJK lines after reflow.
- Voucher: one B3 order rendered with the real shop, including its current
  order header, item columns, cash details, limitations and copy identifier.
- Dimensions: 58 mm PDF paper; 384-dot / 48 mm image; 360-dot till line with
  12-dot insets; 352-dot poem measure with 16-dot insets. Only the PDF model
  guarantees the indicated 5 mm paper-side margins.
- Receipt letters use the renderer's own 5×7 patterns with 2×2 dot cells;
  Fusion Pixel is the base poem face. The total uses 2×4 cells, not bold Courier.
- The comparison uses the same poem and 24-dot setting, without translations.
  Pixel and website typefaces have different line advances (32 and 31 dots).

No literary text, pricing rule, purchase flow, or real printing behavior changes.
There is no simulated paper grain or invented physical-print measurement.

The Chinese source feature title now uses 1.3 leading before capture, not only
in the explanatory sample. Capture and About QA check its glyph clearance.
Chinese prose in both About essays uses ordinary wrapping and strict CJK
punctuation rules: WebKit pretty wrapping was verified to reshape the three
origin paragraphs differently, including sentence-like short lines. The same
393 px specimen now has identical line text in Chromium and WebKit.
