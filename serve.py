#!/usr/bin/env python3
"""Warehouse Blok O — local preview server.

Serves the viewer at http://127.0.0.1:8000 and accepts validated
CAM_*.png viewport captures from the batch "17 shots" workflow.

Usage:
    python serve.py [--port 8000]
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
SHOT_DIR = os.path.join(ROOT, "screenshots")
SHOT_RE = re.compile(r"^CAM_[A-Z0-9_]+\.(png|jpg|jpeg)$")
MAX_BYTES = 12_000_000


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        if self.path != "/capture":
            self.send_error(404, "not found")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400, "bad length")
            return
        if length <= 0 or length > MAX_BYTES:
            self.send_error(413, "payload too large")
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            name = str(payload.get("name", ""))
            data = str(payload.get("data", ""))
        except (ValueError, UnicodeDecodeError):
            self.send_error(400, "invalid JSON")
            return
        if not SHOT_RE.match(name):
            self.send_error(400, "name must match ^CAM_[A-Z0-9_]+\\.(png|jpg|jpeg)$")
            return
        if not data.startswith("data:image/"):
            self.send_error(400, "data must be a data URL")
            return
        blob = base64.b64decode(data.split(",", 1)[-1])
        os.makedirs(SHOT_DIR, exist_ok=True)
        out = os.path.join(SHOT_DIR, name)
        with open(out, "wb") as fh:
            fh.write(blob)
        body = json.dumps({"ok": True, "name": name, "bytes": len(blob)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        # keep the console quiet except for capture events
        if self.path.startswith("/capture"):
            super().log_message(fmt, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Warehouse Blok O preview server")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Warehouse Blok O viewer at http://{args.host}:{args.port}")
    print("Capture endpoint: POST /capture  (CAM_*.png payloads)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
