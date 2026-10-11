from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib
import sys
import tempfile
import threading
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ames" / "agent"))
import update_candidate as updater


def load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


frontend_package = load_module("frontend_package", ROOT / "scripts" / "frontend_package.py")
server_module = load_module("serve_staged_frontend", ROOT / "tools" / "ames-workstation" / "serve-staged-frontend.py")
SHA = "a" * 40


def make_stage(root: pathlib.Path) -> pathlib.Path:
    install = root / "installed"
    agent = install / "ames-agent"
    agent.mkdir(parents=True)
    (agent / "agent.py").write_text("# existing agent", encoding="utf-8")

    dist = root / "dist"
    canonical = dist / "Central-de-Controle-"
    canonical.mkdir(parents=True)
    identity = (json.dumps({"schema": "central-release-identity-v1", "frontend_sha": SHA}, sort_keys=True, separators=(",", ":")) + "\n").encode()
    identity_digest = hashlib.sha256(identity).hexdigest()
    (dist / "release-identity.json").write_bytes(identity)
    (dist / "release-build.json").write_text(json.dumps({
        "sha": SHA,
        "build": "test",
        "release_identity_schema": "central-release-identity-v1",
        "release_identity_sha256": identity_digest,
    }), encoding="utf-8")
    (canonical / "index.html").write_text("<!doctype html><title>Central Local</title>", encoding="utf-8")
    (canonical / "offline-bootstrap.mjs").write_text("export const localProof=true;", encoding="utf-8")
    (canonical / "app.js").write_text("export const localApp=true;", encoding="utf-8")

    package = root / "frontend.zip"
    frontend_package.build_package(dist, package, SHA)
    return updater.stage_frontend(install, package, SHA)


def fetch(url: str):
    with urllib.request.urlopen(url, timeout=3) as response:
        return response.status, response.headers, response.read()


def test_stage_validation_is_bound_to_real_manifest_and_sha():
    with tempfile.TemporaryDirectory() as td:
        stage = make_stage(pathlib.Path(td))
        verified = server_module.validate_stage(stage, SHA)
        assert verified["frontend_sha"] == SHA
        assert verified["verified_file_count"] >= 5

        try:
            server_module.validate_stage(stage, "d" * 40)
        except ValueError:
            pass
        else:
            raise AssertionError("wrong staged SHA must fail closed")

        # Any post-staging mutation must prevent the server from starting.
        (stage / "Central-de-Controle-" / "app.js").write_text("tampered", encoding="utf-8")
        try:
            server_module.validate_stage(stage, SHA)
        except ValueError as exc:
            assert "mismatch" in str(exc)
        else:
            raise AssertionError("tampered staged frontend must fail closed")


def test_proof_server_refuses_stage_marked_as_activated():
    with tempfile.TemporaryDirectory() as td:
        stage = make_stage(pathlib.Path(td))
        marker = json.loads((stage / updater.FRONTEND_STAGE_MARKER).read_text(encoding="utf-8"))
        marker["activated"] = True
        (stage / updater.FRONTEND_STAGE_MARKER).write_text(json.dumps(marker), encoding="utf-8")
        try:
            server_module.validate_stage(stage, SHA)
        except ValueError as exc:
            assert "non-activated" in str(exc)
        else:
            raise AssertionError("proof server must refuse activated stage")


def test_loopback_server_serves_verified_shell_health_and_blocks_api_metadata():
    with tempfile.TemporaryDirectory() as td:
        stage = make_stage(pathlib.Path(td))
        httpd = server_module.create_server(stage, SHA, 0)
        assert httpd.server_address[0] == "127.0.0.1"
        assert httpd.central_stage["frontend_sha"] == SHA
        thread = threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        thread.start()
        try:
            origin = f"http://127.0.0.1:{httpd.server_address[1]}"
            status, headers, body = fetch(origin + "/Central-de-Controle-/")
            assert status == 200 and b"Central Local" in body
            assert headers.get("X-Content-Type-Options") == "nosniff"
            assert headers.get("Referrer-Policy") == "no-referrer"

            status, headers, body = fetch(origin + "/Central-de-Controle-/offline-bootstrap.mjs")
            assert status == 200 and b"localProof" in body
            assert headers.get_content_type() == "text/javascript"

            status, _, body = fetch(origin + server_module.HEALTH_PATH)
            health = json.loads(body)
            assert status == 200
            assert health["schema"] == server_module.HEALTH_SCHEMA
            assert health["frontend_sha"] == SHA
            assert health["served_from"] == "verified-immutable-stage"
            assert health["launcher_default"] is False
            assert health["stage_activated"] is False

            for metadata in (updater.FRONTEND_STAGE_MARKER, updater.FRONTEND_STAGE_MANIFEST):
                try:
                    fetch(origin + "/" + metadata)
                except urllib.error.HTTPError as exc:
                    assert exc.code == 404
                else:
                    raise AssertionError("internal staged metadata must not be HTTP-readable")

            try:
                fetch(origin + "/api/chat-cognitive")
            except urllib.error.HTTPError as exc:
                assert exc.code == 503
                payload = json.loads(exc.read())
                assert payload["error"] == "cora_backend_not_configured_for_local_origin"
            else:
                raise AssertionError("local proof origin must not proxy CORA /api")
        finally:
            httpd.shutdown();httpd.server_close();thread.join(timeout=2)


if __name__ == "__main__":
    tests = [
        test_stage_validation_is_bound_to_real_manifest_and_sha,
        test_proof_server_refuses_stage_marked_as_activated,
        test_loopback_server_serves_verified_shell_health_and_blocks_api_metadata,
    ]
    for test in tests:
        test();print("PASS", test.__name__)
    print(f"PASS local frontend proof server ({len(tests)} tests)")
