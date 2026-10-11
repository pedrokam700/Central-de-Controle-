from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib
import sys
import tempfile
import threading
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
proof_server = load_module("serve_staged_frontend", ROOT / "tools" / "ames-workstation" / "serve-staged-frontend.py")
state_module = load_module("frontend_local_state", ROOT / "tools" / "ames-workstation" / "frontend-local-state.py")
SHA = "b" * 40


def make_stage(root: pathlib.Path):
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
    (canonical / "index.html").write_text("<!doctype html><title>Central State Test</title>", encoding="utf-8")
    (canonical / "offline-bootstrap.mjs").write_text("export const localProof=true;", encoding="utf-8")
    (canonical / "app.js").write_text("export const localApp=true;", encoding="utf-8")
    package = root / "frontend.zip"
    frontend_package.build_package(dist, package, SHA)
    stage = updater.stage_frontend(install, package, SHA)
    return install, stage


def start_server(stage: pathlib.Path):
    httpd = proof_server.create_server(stage, SHA, 0)
    thread = threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{httpd.server_address[1]}"
    return httpd, thread, origin


def test_activation_requires_verified_stage_and_exact_loopback_health_without_mutating_stage():
    with tempfile.TemporaryDirectory() as td:
        install, stage = make_stage(pathlib.Path(td))
        marker = stage / updater.FRONTEND_STAGE_MARKER
        manifest = stage / updater.FRONTEND_STAGE_MANIFEST
        before = (hashlib.sha256(marker.read_bytes()).hexdigest(), hashlib.sha256(manifest.read_bytes()).hexdigest())
        httpd, thread, origin = start_server(stage)
        try:
            state = state_module.activate(install, SHA, origin)
            assert state["active"] is True
            assert state["frontend_sha"] == SHA
            assert state["stage_path"] == f"frontend-packages/{SHA}"
            assert state["serving_origin"] == origin
            assert state["canonical_url"] == origin + "/Central-de-Controle-/"
            assert state["launcher_default"] is False
            persisted = state_module.read_state(install)
            assert persisted["active"] is True and persisted["frontend_sha"] == SHA
        finally:
            httpd.shutdown();httpd.server_close();thread.join(timeout=2)
        after = (hashlib.sha256(marker.read_bytes()).hexdigest(), hashlib.sha256(manifest.read_bytes()).hexdigest())
        assert after == before, "activation state must never mutate immutable frontend stage"


def test_deactivation_is_atomic_reversible_state_only_and_preserves_stage():
    with tempfile.TemporaryDirectory() as td:
        install, stage = make_stage(pathlib.Path(td))
        httpd, thread, origin = start_server(stage)
        try:
            state_module.activate(install, SHA, origin)
        finally:
            httpd.shutdown();httpd.server_close();thread.join(timeout=2)
        index_digest = hashlib.sha256((stage / "Central-de-Controle-" / "index.html").read_bytes()).hexdigest()
        state = state_module.deactivate(install, reason="rollback-test")
        assert state["active"] is False
        assert state["reason"] == "rollback-test"
        assert state["previous_frontend_sha"] == SHA
        assert not state.get("serving_origin")
        assert hashlib.sha256((stage / "Central-de-Controle-" / "index.html").read_bytes()).hexdigest() == index_digest
        assert stage.is_dir(), "deactivation must retain staged artifact for deterministic rollback/re-activation"


def test_activation_rejects_remote_origin_wrong_sha_and_health_mismatch_fail_closed():
    with tempfile.TemporaryDirectory() as td:
        install, stage = make_stage(pathlib.Path(td))
        try:
            state_module.activate(install, SHA, "https://example.com:8780")
        except ValueError as exc:
            assert "127.0.0.1" in str(exc)
        else:
            raise AssertionError("remote origin must never be accepted as local activation")
        try:
            state_module.activate(install, "c" * 40, "http://127.0.0.1:8780", health_fetch=lambda _:{})
        except ValueError:
            pass
        else:
            raise AssertionError("wrong staged SHA must fail closed")

        verified = proof_server.validate_stage(stage, SHA)
        bad_health = {
            "schema": proof_server.HEALTH_SCHEMA,
            "frontend_sha": "c" * 40,
            "release_identity_sha256": verified["release_identity_sha256"],
            "served_from": "verified-immutable-stage",
            "launcher_default": False,
            "stage_activated": False,
        }
        try:
            state_module.activate(install, SHA, "http://127.0.0.1:8780", health_fetch=lambda _:bad_health)
        except ValueError as exc:
            assert "SHA mismatch" in str(exc)
        else:
            raise AssertionError("health for another SHA must fail closed")
        assert state_module.read_state(install)["active"] is False


def test_corrupt_or_forged_active_state_fails_closed():
    with tempfile.TemporaryDirectory() as td:
        install, _ = make_stage(pathlib.Path(td))
        path = install / state_module.STATE_FILE
        path.write_text("{broken", encoding="utf-8")
        try:
            state_module.read_state(install)
        except ValueError as exc:
            assert "corrupt" in str(exc)
        else:
            raise AssertionError("corrupt activation state must fail closed")

        path.write_text(json.dumps({
            "schema": state_module.SCHEMA,
            "active": True,
            "frontend_sha": SHA,
            "stage_path": f"frontend-packages/{SHA}",
            "serving_origin": "http://127.0.0.1:8780",
            "canonical_path": "/Central-de-Controle-/",
            "canonical_url": "http://127.0.0.1:9999/Central-de-Controle-/",
            "release_identity_sha256": "d" * 64,
        }), encoding="utf-8")
        try:
            state_module.read_state(install)
        except ValueError as exc:
            assert "canonical URL mismatch" in str(exc)
        else:
            raise AssertionError("forged canonical URL must fail closed")


if __name__ == "__main__":
    tests = [
        test_activation_requires_verified_stage_and_exact_loopback_health_without_mutating_stage,
        test_deactivation_is_atomic_reversible_state_only_and_preserves_stage,
        test_activation_rejects_remote_origin_wrong_sha_and_health_mismatch_fail_closed,
        test_corrupt_or_forged_active_state_fails_closed,
    ]
    for test in tests:
        test();print("PASS", test.__name__)
    print(f"PASS local frontend activation state ({len(tests)} tests)")
