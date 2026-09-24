"""Deterministic publication identity for the public Poetry Voucher bundle.

A fingerprint identifies build inputs, not a promise of pixel-identical rendering
across browsers. No private files or device configuration are included.
"""
import hashlib
import json
import re


def build_publication(root, *, check=False):
    app = root / "content" / "poetry-voucher-app"
    paths = [app / name for name in (
        "gallery.js", "shop.js", "order-reading.js", "shop-copy.js", "i18n.js",
        "studio.css", "shop.css", "accessibility.css",
    )]
    paths.append(root / "templates" / "poetry-voucher-shop.html")
    css = (app / "studio.css").read_text(encoding="utf-8")
    for relative in sorted(set(re.findall(r"/assets/fonts/[^\s)'\"]+", css))):
        paths.append(root / relative.lstrip("/"))
    hashes = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
              for path in sorted(set(paths))}
    fingerprint = hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()
    data = {
        "schema": 1,
        "renderer": "pv-render-" + fingerprint[:16],
        "renderer_sha256": fingerprint,
        "catalogue_sha256": hashlib.sha256((app / "editions.json").read_bytes()).hexdigest(),
        "files": hashes,
    }
    content = "'use strict';\nconst PUBLICATION_BUILD = Object.freeze(" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ");\n"
    target = root / "poetry-voucher" / "publication-build.js"
    if target.exists() and target.read_text(encoding="utf-8") == content:
        return []
    if not check:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return [target]
