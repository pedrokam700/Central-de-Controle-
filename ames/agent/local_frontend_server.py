"""Serve a verified immutable Central frontend stage on loopback only.

This module is deliberately NOT wired as the workstation launcher's default.
It exists so an immutable staged frontend can be validated locally before an
explicit activation/rollback mechanism is allowed to replace hosted-origin use.
"""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import mimetypes
import posixpath
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

STAGE_SCHEMA = "central-local-frontend-stage-v1"
PACKAGE_SCHEMA = "central-immutable-frontend-v1"
STAGE_MARKER = "_CENTRAL_FRONTEND_STAGE.json"
STAGE_MANIFEST = "_CENTRAL_FRONTEND_MANIFEST.json"
HEALTH_PATH = "/_central/local-health.json"
HEALTH_SCHEMA = "central-local-frontend-health-v1"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Invalid JSON: {path.name}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"Invalid object: {path.name}")
    return value


def _exact_sha(value: object) -> str:
    text = str(value or "").strip().lower()
    if len(text) != 40 or any(ch not in "0123456789abcdef" for ch in text):
        raise ValueError("frontend SHA must be exact 40-hex commit SHA")
    return text


def _loopback_host(host: str) -> str:
    value = str(host or "").strip()
    if value.lower() == "localhost":
        return value
    try:
        if ipaddress.ip_address(value).is_loopback:
            return value
    except ValueError:
        pass
    raise ValueError("local frontend server may bind only to loopback")


def _safe_rel(value: object) -> str:
    text = str(value or "")
    pure = PurePosixPath(text)
    if not text or text.startswith("/") or "\\" in text or ".." in pure.parts or "\x00" in text:
        raise ValueError(f"unsafe frontend path: {text!r}")
    return pure.as_posix()


def load_stage(stage_dir: str | Path, *, expected_sha: str | None = None) -> dict:
    """Verify a staged immutable frontend without mutating or activating it."""
    root = Path(stage_dir).resolve()
    if not root.is_dir():
        raise ValueError("frontend stage not found")

    marker_path = root / STAGE_MARKER
    manifest_path = root / STAGE_MANIFEST
    if not marker_path.is_file() or not manifest_path.is_file():
        raise ValueError("frontend stage metadata missing")

    marker = _read_json(marker_path)
    manifest = _read_json(manifest_path)
    if marker.get("schema") != STAGE_SCHEMA:
        raise ValueError("unsupported frontend stage schema")
    if manifest.get("schema") != PACKAGE_SCHEMA:
        raise ValueError("unsupported frontend package schema")

    sha = _exact_sha(marker.get("frontend_sha"))
    if _exact_sha(manifest.get("frontend_sha")) != sha:
        raise ValueError("stage/manifest frontend SHA mismatch")
    if expected_sha is not None and _exact_sha(expected_sha) != sha:
        raise ValueError("staged frontend does not match expected SHA")

    declared_manifest_digest = str(marker.get("stage_manifest_sha256") or "")
    if declared_manifest_digest != _sha256_file(manifest_path):
        raise ValueError("staged frontend manifest digest mismatch")
    if marker.get("release_identity_sha256") != manifest.get("release_identity_sha256"):
        raise ValueError("stage release identity mismatch")

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("staged frontend file manifest empty")
    declared_count = manifest.get("file_count")
    if declared_count is not None and int(declared_count) != len(files):
        raise ValueError("staged frontend file count mismatch")

    allowed: dict[str, dict] = {}
    for item in files:
        if not isinstance(item, dict):
            raise ValueError("invalid staged frontend file entry")
        rel = _safe_rel(item.get("path"))
        if rel in allowed:
            raise ValueError("duplicate staged frontend path: " + rel)
        path = root / rel
        if not path.is_file():
            raise ValueError("staged frontend member missing: " + rel)
        expected_bytes = int(item.get("bytes", -1))
        if expected_bytes < 0 or path.stat().st_size != expected_bytes:
            raise ValueError("staged frontend size mismatch: " + rel)
        expected_digest = str(item.get("sha256") or "")
        if len(expected_digest) != 64 or _sha256_file(path) != expected_digest:
            raise ValueError("staged frontend hash mismatch: " + rel)
        allowed[rel] = item

    required = {"release-build.json", "release-identity.json", "Central-de-Controle-/index.html"}
    if not required <= set(allowed):
        raise ValueError("staged frontend missing release/canonical files")

    release = _read_json(root / "release-build.json")
    if _exact_sha(release.get("sha")) != sha:
        raise ValueError("release-build SHA mismatch in staged frontend")
    identity_bytes = (root / "release-identity.json").read_bytes()
    identity_digest = _sha256_bytes(identity_bytes)
    if identity_digest != str(manifest.get("release_identity_sha256") or ""):
        raise ValueError("release identity digest mismatch in staged frontend")
    if identity_digest != str(release.get("release_identity_sha256") or ""):
        raise ValueError("release-build identity digest mismatch in staged frontend")

    return {
        "root": root,
        "marker": marker,
        "manifest": manifest,
        "frontend_sha": sha,
        "release_identity_sha256": identity_digest,
        "canonical_path": str(manifest.get("canonical_path") or "/Central-de-Controle-/"),
        "allowed_paths": frozenset(allowed),
    }


def _content_type(path: str) -> str:
    suffix = Path(path).suffix.lower()
    explicit = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".txt": "text/plain; charset=utf-8",
        ".map": "application/json; charset=utf-8",
        ".wasm": "application/wasm",
    }
    if suffix in explicit:
        return explicit[suffix]
    return mimetypes.guess_type(path)[0] or "application/octet-stream"


def _request_rel(raw_path: str) -> str | None:
    parsed = urlsplit(raw_path)
    try:
        decoded = unquote(parsed.path, errors="strict")
    except UnicodeDecodeError:
        return None
    if "\\" in decoded or "\x00" in decoded:
        return None
    if decoded in {"", "/"}:
        return "index.html"
    if decoded == "/Central-de-Controle-":
        return "__redirect_canonical__"
    relative = decoded.lstrip("/")
    parts = PurePosixPath(relative).parts
    if ".." in parts:
        return None
    normalized = posixpath.normpath(relative)
    if normalized in {".", ".."} or normalized.startswith("../"):
        return None
    if decoded.endswith("/"):
        normalized = normalized.rstrip("/") + "/index.html"
    try:
        return _safe_rel(normalized)
    except ValueError:
        return None


def make_handler(stage: dict):
    root: Path = stage["root"]
    allowed = stage["allowed_paths"]
    health_payload = json.dumps(
        {
            "schema": HEALTH_SCHEMA,
            "frontend_sha": stage["frontend_sha"],
            "release_identity_sha256": stage["release_identity_sha256"],
            "canonical_path": stage["canonical_path"],
            "served_from": "verified-immutable-stage",
            "launcher_default": False,
            "stage_activated": bool(stage["marker"].get("activated")),
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8") + b"\n"

    class Handler(BaseHTTPRequestHandler):
        server_version = "CentralLocalFrontend/1"
        sys_version = ""

        def log_message(self, fmt, *args):
            return

        def _headers(self, status: int, content_type: str, length: int, *, cache: str = "no-cache"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", cache)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.end_headers()

        def _serve(self, head_only: bool = False):
            if urlsplit(self.path).path == HEALTH_PATH:
                self._headers(200, "application/json; charset=utf-8", len(health_payload), cache="no-store")
                if not head_only:
                    self.wfile.write(health_payload)
                return

            rel = _request_rel(self.path)
            if rel == "__redirect_canonical__":
                self.send_response(308)
                self.send_header("Location", "/Central-de-Controle-/")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if rel is None or rel not in allowed or rel.startswith("_CENTRAL_"):
                self.send_error(404)
                return

            path = root / rel
            try:
                payload = path.read_bytes()
            except OSError:
                self.send_error(404)
                return
            cache = "no-store" if rel in {"release-build.json", "release-identity.json"} or rel.endswith("/sw.js") or rel == "sw.js" else "no-cache"
            self._headers(200, _content_type(rel), len(payload), cache=cache)
            if not head_only:
                self.wfile.write(payload)

        def do_GET(self):
            self._serve(False)

        def do_HEAD(self):
            self._serve(True)

        def do_POST(self):
            self.send_error(405)

        def do_PUT(self):
            self.send_error(405)

        def do_DELETE(self):
            self.send_error(405)

    return Handler


def create_server(stage_dir: str | Path, *, expected_sha: str | None = None, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT):
    host = _loopback_host(host)
    port = int(port)
    if port < 0 or port > 65535:
        raise ValueError("invalid local frontend port")
    stage = load_stage(stage_dir, expected_sha=expected_sha)
    server = ThreadingHTTPServer((host, port), make_handler(stage))
    server.daemon_threads = True
    server.central_stage = stage
    return server


def serve(stage_dir: str | Path, *, expected_sha: str | None = None, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT):
    server = create_server(stage_dir, expected_sha=expected_sha, host=host, port=port)
    actual_host, actual_port = server.server_address[:2]
    origin = f"http://{actual_host}:{actual_port}"
    print(f"LOCAL_FRONTEND_READY {origin}{server.central_stage['canonical_path']} SHA={server.central_stage['frontend_sha']}", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        server.server_close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve a verified immutable Central frontend on loopback for validation")
    parser.add_argument("--stage", required=True)
    parser.add_argument("--sha")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    serve(args.stage, expected_sha=args.sha, host=args.host, port=args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
