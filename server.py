#!/usr/bin/env python3
"""Development server for Tennis Player OS.

Serves the app locally and disables browser caching so HTML/CSS/JS changes
are visible immediately after reload. This file is intentionally version-agnostic.

Like the GitHub Pages deploy, every relative ?v= suffix in JS imports and HTML
assets is rewritten to APP_VERSION on the fly: with the mixed suffixes of the
sources the browser would load some modules (bootstrap.js, store.js) twice.
"""

from __future__ import annotations

import argparse
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlsplit

JS_IMPORT_PATTERNS = (
    re.compile(r"""(\bfrom\s*['"])(\.\.?/[^'"]+\.js(?:\?v=[^'"]*)?)(['"])"""),
    re.compile(r"""(\bimport\s*['"])(\.\.?/[^'"]+\.js(?:\?v=[^'"]*)?)(['"])"""),
    re.compile(r"""(\bimport\s*\(\s*['"])(\.\.?/[^'"]+\.js(?:\?v=[^'"]*)?)(['"]\s*\))"""),
)
HTML_ASSET_PATTERN = re.compile(
    r"""((?:src|href)=["'])(\./[^"'?#]+\.(?:js|css|webmanifest))(?:\?v=[^"']*)?(["'])""",
    re.IGNORECASE,
)
APP_VERSION_PATTERN = re.compile(r"""APP_VERSION\s*=\s*['"]([^'"]+)['"]""")


class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
    def app_version(self) -> str:
        source = (Path(self.directory) / "assets/js/version.js").read_text(encoding="utf-8")
        match = APP_VERSION_PATTERN.search(source)
        if not match:
            raise RuntimeError("APP_VERSION non trovato in assets/js/version.js")
        return match.group(1)

    def versioned_source(self, file_path: Path, suffix: str) -> str:
        source = file_path.read_text(encoding="utf-8")
        if file_path.suffix == ".js":
            def version_specifier(match: re.Match) -> str:
                specifier = re.sub(r"\?v=[^#]*", "", match.group(2)).split("#")[0]
                return match.group(1) + specifier + suffix + match.group(3)

            for pattern in JS_IMPORT_PATTERNS:
                source = pattern.sub(version_specifier, source)
        else:
            source = HTML_ASSET_PATTERN.sub(lambda m: m.group(1) + m.group(2) + suffix + m.group(3), source)
        return source

    def do_GET(self) -> None:
        file_path = Path(self.translate_path(urlsplit(self.path).path))
        if file_path.is_dir():
            file_path = file_path / "index.html"
        if file_path.suffix not in (".js", ".html") or not file_path.is_file():
            super().do_GET()
            return

        suffix = f"?v={quote(self.app_version())}"
        body = self.versioned_source(file_path, suffix).encode("utf-8")
        content_type = "text/javascript" if file_path.suffix == ".js" else "text/html"
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve Tennis Player OS locally without browser cache.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--directory", default=str(Path(__file__).resolve().parent))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    directory = str(Path(args.directory).resolve())
    handler = partial(NoCacheHTTPRequestHandler, directory=directory)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Tennis Player OS server: http://{args.host}:{args.port}/")
    print(f"Directory: {directory}")
    print("Cache: disabled (no-store)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
