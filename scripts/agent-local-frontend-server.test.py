from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile
import threading
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / "tools" / "ames-workstation" / "serve-staged-frontend.py"
spec = importlib.util.spec_from_file_location("serve_staged_frontend", SERVER_PATH)
assert spec and spec.loader
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)

SHA = "a" * 40


def make_stage(root: pathlib.Path) -> pathlib.Path:
    stage = root / SHA
    canonical = stage / "Central-de-Controle-"
    canonical.mkdir(parents=True)
    (canonical / "index.html").write_text("<!doctype html><title>Central Local</title>", encoding="utf-8")
    (canonical / "offline-bootstrap.mjs").write_text("export const localProof=true;", encoding="utf-8")
    (stage / "release-build.json").write_text(json.dumps({"sha": SHA, "build": "test"}), encoding="utf-8")
    (stage / "release-identity.json").write_text(json.dumps({"frontend_sha": SHA}), encoding="utf-8")
    (stage / server_module.MARKER).write_text(json.dumps({
        "schema": server_module.STAGE_SCHEMA,
        "frontend_sha": SHA,
        "package_sha256": "b" * 64,
        "release_identity_sha256": "c" * 64,
        "canonical_path": "/Central-de-Controle-/",
        "activated": False,
        "serving_origin": None,
    }), encoding="utf-8")
    (stage / "empty").mkdir()
    return stage


def fetch(url: str):
    with urllib.request.urlopen(url, timeout=3) as response:
        return response.status, response.headers, response.read()


def test_stage_validation_fails_closed():
    with tempfile.TemporaryDirectory() as td:
        stage = make_stage(pathlib.Path(td))
        server_module.validate_stage(stage, SHA)
        try:
            server_module.validate_stage(stage, "d" * 40)
        except ValueError:
            pass
        else:
            raise AssertionError("wrong staged SHA must fail closed")
        marker = json.loads((stage / server_module.MARKER).read_text())
        marker["activated"] = True
        (stage / server_module.MARKER).write_text(json.dumps(marker))
        try:
            server_module.validate_stage(stage, SHA)
        except ValueError as exc:
            assert "non-activated" in str(exc)
        else:
            raise AssertionError("proof server must refuse activated stage")


def test_loopback_server_serves_static_shell_and_blocks_api():
    with tempfile.TemporaryDirectory() as td:
        stage = make_stage(pathlib.Path(td))
        httpd = server_module.create_server(stage, SHA, 0)
        assert httpd.server_address[0] == "127.0.0.1"
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

            status, _, body = fetch(origin + "/release-build.json")
            assert status == 200 and json.loads(body)["sha"] == SHA

            try:
                fetch(origin + "/api/chat-cognitive")
            except urllib.error.HTTPError as exc:
                assert exc.code == 503
                payload = json.loads(exc.read())
                assert payload["error"] == "cora_backend_not_configured_for_local_origin"
            else:
                raise AssertionError("local proof origin must not proxy CORA /api")

            try:
                fetch(origin + "/empty/")
            except urllib.error.HTTPError as exc:
                assert exc.code == 404
            else:
                raise AssertionError("directory listing must stay disabled")
        finally:
            httpd.shutdown();httpd.server_close();thread.join(timeout=2)


if __name__ == "__main__":
    tests = [test_stage_validation_fails_closed, test_loopback_server_serves_static_shell_and_blocks_api]
    for test in tests:
        test();print("PASS", test.__name__)
    print(f"PASS local frontend proof server ({len(tests)} tests)")
