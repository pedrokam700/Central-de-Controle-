from __future__ import annotations

import argparse
import hashlib
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

STAGE_SCHEMA = "central-local-frontend-stage-v1"
PACKAGE_SCHEMA = "central-immutable-frontend-v1"
MARKER = "_CENTRAL_FRONTEND_STAGE.json"
MANIFEST = "_CENTRAL_FRONTEND_MANIFEST.json"
HOST = "127.0.0.1"
HEALTH_PATH = "/_central/local-health.json"
HEALTH_SCHEMA = "central-local-frontend-health-v1"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _safe_rel(value: object) -> str:
    text = str(value or "")
    pure = PurePosixPath(text)
    if not text or text.startswith("/") or "\\" in text or ".." in pure.parts or "\x00" in text:
        raise ValueError(f"unsafe staged frontend path: {text!r}")
    return pure.as_posix()


class StagedFrontendHandler(SimpleHTTPRequestHandler):
    server_version = "CentralLocalFrontend/0.2"
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
    }

    def log_message(self, fmt, *args):
        # Keep workstation output concise and never log query strings/fragments.
        path = urlsplit(self.path).path
        print(f"[frontend-local] {self.command} {path} -> {args[1] if len(args) > 1 else ''}")

    def list_directory(self, path):
        self.send_error(404, "Directory listing disabled")
        return None

    def _blocked_api(self, *, head_only: bool = False):
        body = json.dumps({
            "ok": False,
            "error": "cora_backend_not_configured_for_local_origin",
            "message": "CORA/API externa permanece desativada nesta origem local até contrato/backend serem validados."
        }, ensure_ascii=False).encode("utf-8")
        self.send_response(503)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(0 if head_only else len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _health(self, *, head_only: bool = False):
        stage = self.server.central_stage
        body = (json.dumps({
            "schema": HEALTH_SCHEMA,
            "frontend_sha": stage["frontend_sha"],
            "release_identity_sha256": stage["release_identity_sha256"],
            "canonical_path": "/Central-de-Controle-/",
            "served_from": "verified-immutable-stage",
            "launcher_default": False,
            "stage_activated": False,
            "cora_api": "blocked_until_backend_contract_green"
        }, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(0 if head_only else len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    @staticmethod
    def _internal_metadata(path: str) -> bool:
        name = Path(path).name
        return name in {MARKER, MANIFEST} or name.startswith("_CENTRAL_")

    def do_GET(self):
        path = urlsplit(self.path).path
        if self._internal_metadata(path):
            self.send_error(404)
            return
        if path == HEALTH_PATH:
            self._health()
            return
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/Central-de-Controle-/")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path == "/api" or path.startswith("/api/"):
            self._blocked_api()
            return
        return super().do_GET()

    def do_HEAD(self):
        path = urlsplit(self.path).path
        if self._internal_metadata(path):
            self.send_error(404)
            return
        if path == HEALTH_PATH:
            self._health(head_only=True)
            return
        if path == "/api" or path.startswith("/api/"):
            self._blocked_api(head_only=True)
            return
        return super().do_HEAD()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/api" or path.startswith("/api/"):
            self._blocked_api()
            return
        self.send_error(405, "Local proof server is static/read-only")

    def do_PUT(self):
        self.send_error(405, "Local proof server is static/read-only")

    def do_DELETE(self):
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
    marker_path = stage / MARKER
    manifest_path = stage / MANIFEST
    if not marker_path.is_file() or not manifest_path.is_file():
        raise ValueError("staged frontend metadata missing")
    state = json.loads(marker_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if state.get("schema") != STAGE_SCHEMA:
        raise ValueError("unsupported staged frontend schema")
    if manifest.get("schema") != PACKAGE_SCHEMA:
        raise ValueError("unsupported staged frontend package schema")
    if str(state.get("frontend_sha") or "").lower() != expected:
        raise ValueError("staged frontend SHA mismatch")
    if str(manifest.get("frontend_sha") or "").lower() != expected:
        raise ValueError("staged frontend manifest SHA mismatch")
    if state.get("activated") is not False or state.get("serving_origin") is not None:
        raise ValueError("proof server only accepts non-activated frontend stages")
    if state.get("stage_manifest_sha256") != _sha256(manifest_path):
        raise ValueError("staged frontend manifest digest mismatch")
    if state.get("release_identity_sha256") != manifest.get("release_identity_sha256"):
        raise ValueError("staged frontend release identity mismatch")

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("staged frontend file manifest empty")
    if int(manifest.get("file_count", len(files))) != len(files):
        raise ValueError("staged frontend file count mismatch")
    seen = set()
    for item in files:
        if not isinstance(item, dict):
            raise ValueError("invalid staged frontend file entry")
        rel = _safe_rel(item.get("path"))
        if rel in seen:
            raise ValueError("duplicate staged frontend path: " + rel)
        seen.add(rel)
        path = stage / rel
        if not path.is_file():
            raise ValueError("staged frontend member missing: " + rel)
        if path.stat().st_size != int(item.get("bytes", -1)):
            raise ValueError("staged frontend size mismatch: " + rel)
        if _sha256(path) != str(item.get("sha256") or ""):
            raise ValueError("staged frontend hash mismatch: " + rel)

    required = {"release-build.json", "release-identity.json", "Central-de-Controle-/index.html"}
    if not required <= seen:
        raise ValueError("canonical/release files missing from staged frontend")
    release = json.loads((stage / "release-build.json").read_text(encoding="utf-8"))
    if str(release.get("sha") or "").lower() != expected:
        raise ValueError("release-build SHA mismatch in staged frontend")
    identity_digest = _sha256(stage / "release-identity.json")
    if identity_digest != str(manifest.get("release_identity_sha256") or ""):
        raise ValueError("release identity digest mismatch in staged frontend")
    if identity_digest != str(release.get("release_identity_sha256") or ""):
        raise ValueError("release-build identity digest mismatch in staged frontend")

    return {
        **state,
        "frontend_sha": expected,
        "release_identity_sha256": identity_digest,
        "verified_file_count": len(files),
    }


def create_server(stage: Path, expected_sha: str, port: int = 0) -> ThreadingHTTPServer:
    stage = Path(stage).resolve()
    verified = validate_stage(stage, expected_sha)
    handler = partial(StagedFrontendHandler, directory=str(stage))
    server = ThreadingHTTPServer((HOST, int(port)), handler)
    server.daemon_threads = True
    server.central_stage = verified
    return server


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve verified immutable Central frontend on loopback for proof only")
    parser.add_argument("--stage", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--port", type=int, default=8780)
    args = parser.parse_args()
    server = create_server(Path(args.stage), args.sha, args.port)
    host, port = server.server_address
    print(f"Central verified staged frontend proof server: http://{host}:{port}/Central-de-Controle-/")
    print(f"SHA: {server.central_stage['frontend_sha']} · files verified: {server.central_stage['verified_file_count']}")
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
