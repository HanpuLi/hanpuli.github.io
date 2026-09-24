#!/usr/bin/env python3
"""Serve the static site with GitHub Pages-style 404s and an optional local design tuner."""
from __future__ import annotations

import argparse
import errno
import os
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
TUNER_SNIPPET = b"""
<link rel="stylesheet" href="/tools/design_tuner.css" data-design-tuner>
<script defer src="/tools/design_tuner.js" data-design-tuner></script>
"""


class SiteHandler(SimpleHTTPRequestHandler):
    def _tuned_target(self) -> tuple[Path, int] | None:
        parsed = urlsplit(self.path)
        if parse_qs(parsed.query).get("tune") != ["1"]:
            return None

        target = Path(self.translate_path(parsed.path))
        if target.is_dir():
            target /= "index.html"

        status = 200
        if not target.exists():
            target = ROOT / "404.html"
            status = 404

        if target.suffix.lower() != ".html":
            return None
        return target, status

    def do_GET(self):
        tuned = self._tuned_target()
        if tuned is None:
            return super().do_GET()

        target, status = tuned
        data = target.read_bytes()
        if b"</body>" in data:
            data = data.replace(b"</body>", TUNER_SNIPPET + b"\n</body>", 1)
        else:
            data += TUNER_SNIPPET

        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if not path.exists():
            error_page = ROOT / "404.html"
            handle = error_page.open("rb")
            stat = error_page.stat()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(stat.st_size))
            self.end_headers()
            return handle
        return super().send_head()

    def log_message(self, _format, *_args):
        pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", nargs="?", type=int, default=8765)
    parser.add_argument(
        "--tune",
        action="store_true",
        help="print the Design Tuner URL instead of the plain preview URL",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        dest="open_browser",
        help="open the preview URL in the default browser",
    )
    return parser.parse_args()


def bind_server(preferred_port: int) -> tuple[ThreadingHTTPServer, int]:
    """Bind the requested port, falling forward when another preview already owns it."""
    for port in range(preferred_port, preferred_port + 20):
        try:
            return ThreadingHTTPServer(("127.0.0.1", port), SiteHandler), port
        except OSError as exc:
            if exc.errno not in {errno.EADDRINUSE, 48, 98}:
                raise
    raise OSError(
        errno.EADDRINUSE,
        f"No free preview port in range {preferred_port}-{preferred_port + 19}",
    )


def main() -> int:
    args = parse_args()
    os.chdir(ROOT)
    server, port = bind_server(args.port)
    suffix = "/?tune=1" if args.tune else "/"
    url = f"http://127.0.0.1:{port}{suffix}"
    print(f"Serving {ROOT}")
    if port != args.port:
        print(f"Port {args.port} is already in use; using {port} instead.")
    print(url)
    if args.open_browser:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
