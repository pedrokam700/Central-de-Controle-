from __future__ import annotations

import argparse
import json
import mimetypes
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

STAGE_SCHEMA = "central-local-frontend-stage-v1"
MARKER = "_CENTRAL_FRONTEND_STAGE.json"
HOST = "127.0.0.1"


class StagedFrontendHandler(SimpleHTTPRequestHandler):
    server_version = "CentralLocalFrontend/0.1"

    def log_message(self, fmt, *args):
        # Keep workstation output concise and never log query fragments/tokens.
        path = urlsplit(self.path).path
        print(f"[frontend-local] {self.command} {path} -> {args[1] if len(args) > 1 else ''}")

    def list_directory(self, path):
        self.send_error(404, "Directory listing disabled")
        return None

    def _blocked_api(self):
        body = json.dumps({
            "ok": False,
            "error": "cora_backend_not_configured_for_local_origin",
            "message": "CORA/API externa permanece desativada nesta origem local até contrato/backend serem validados."
        }, ensure_ascii=False).encode("utf-8")
        self.send_response(503)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/Central-de-Controle-/")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        if path == "/api" or path.startswith("/api/"):
            self._blocked_api()
            return
        return super().do_GET()

    def do_HEAD(self):
        path = urlsplit(self.path).path
        if path == "/api" or path.startswith("/api/"):
            self.send_response(503)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        return super().do_HEAD()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/api" or path.startswith("/api/"):
            self._blocked_api()
            return
        self.send_error(405, "Local proof server is static/read-only")

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()


def validate_stage(stage: Path, expected_sha: str) -> dict:
    stage = stage.resolve()
    expected = str(expected_sha or "").strip().lower()
    if len(expected) != 40 or any(ch not in "0123456789abcdef" for ch in expected):
        raise ValueError("expected SHA must be exact 40-hex commit SHA")
    marker = stage / MARKER
    if not marker.is_file():
        raise ValueError("staged frontend marker missing")
    state = json.loads(marker.read_text(encoding="utf-8"))
    if state.get("schema") != STAGE_SCHEMA:
        raise ValueError("unsupported staged frontend schema")
    if str(state.get("frontend_sha") or "").lower() != expected:
        raise ValueError("staged frontend SHA mismatch")
    if state.get("activated") is not False or state.get("serving_origin") is not None:
        raise ValueError("proof server only accepts non-activated frontend stages")
    release = json.loads((stage / "release-build.json").read_text(encoding="utf-8"))
    if str(release.get("sha") or "").lower() != expected:
        raise ValueError("release-build SHA mismatch in staged frontend")
    if not (stage / "Central-de-Controle-" / "index.html").is_file():
        raise ValueError("canonical Central index missing from staged frontend")
    return state


def create_server(stage: Path, expected_sha: str, port: int = 0) -> ThreadingHTTPServer:
    stage = Path(stage).resolve()
    validate_stage(stage, expected_sha)
    handler = partial(StagedFrontendHandler, directory=str(stage))
    return ThreadingHTTPServer((HOST, int(port)), handler)


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve staged immutable Central frontend on loopback for proof only")
    parser.add_argument("--stage", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--port", type=int, default=8780)
    args = parser.parse_args()
    server = create_server(Path(args.stage), args.sha, args.port)
    host, port = server.server_address
    print(f"Central staged frontend proof server: http://{host}:{port}/Central-de-Controle-/")
    print("CORA /api/* is intentionally blocked on this local origin. Launcher has not been changed.")
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
