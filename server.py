#!/usr/bin/env python3
"""Development server for Tennis Player OS.

Serves the app locally and disables browser caching so HTML/CSS/JS changes
are visible immediately after reload. This file is intentionally version-agnostic.
"""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
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
