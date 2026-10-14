# 漢文訓点表示エンジン / Kanbun visual renderer

This directory is a standalone sandboxed visual reading component. This is
not a licence declaration for the site's poetry, translation, photographs
or other independent works.

Upstream: https://github.com/untunt/kanbunHTML
Commit: 814cb25 (2026-01-25)
Licence: GNU Affero General Public License v3.0 (LICENSE-AGPL-3.0)

Unmodified vendored files:
- vendor/kanbun.js SHA-256 31fdf238b8a46f0505bd4e3af5d8ef98598e835b4ca8d3e9e512329d4a09b802
- vendor/kanbun.css SHA-256 3d87ff83120ca78fc0d589241ac5789393080e21a22b26100ee74a15d38d94ce

The renderer programs (vendor/kanbun.js, vendor/kanbun.css, viewer.js,
viewer.css) and the original structural template used for generated viewer
pages are made available under AGPL-3.0-or-later, subject to the upstream
files' original notices. Human-editable build source is in
tools/poetry_kunten.py and the distributed site repository.

The generated works/*.html contain independently authored literary input,
including the Traditional Chinese poems, title data and editorial kanbun
annotations. Those literary texts are copyright Hanpu Li and are **not**
licensed under AGPL merely because they are displayed by the program.
The code and content are separately identifiable parts of the generated
document. See the site's copyright statement in README.md.

The host exchanges declarative data and dimensions with a sandboxed iframe.
Whether that implementation is legally an aggregate or a combined covered
work cannot be decided by the iframe boundary alone. Public deployment
requires review of the resulting distribution, notices and Corresponding
Source. GNU's GPL FAQ on output licensing distinguishes code copied from
a generator from independently supplied input:
https://www.gnu.org/licenses/gpl-faq.en.html#GPLOutput

All 29 classical texts have source-anchored pilot character-level marks,
including explicit treatment of modern idioms. Their inclusion is not a
claim of specialist certification or historical manuscript transmission.
