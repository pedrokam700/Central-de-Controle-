"""Regression: preserve the ORIGINAL SQLite source_id, history and installed files.

Only temporary simulated installations are modified. No deploy, no ZIP.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import socket
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))
import canonical
from store import Store
import update_candidate as updater

def load_builder():
    src = ROOT / "scripts" / "stage-pr38-preserving-update.py"
    spec = importlib.util.spec_from_file_location("pr38_preservation_stager", src)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod

def snapshot(db):
    with db.connect() as con:
        return con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0]

def isolated_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        chosen = sock.getsockname()[1]
        if chosen == 8765:
            raise RuntimeError("Never use factory port in isolated smoke")
        return chosen


def get_agent(url, *, origin=None, expect=200):
    req = Request(url, headers={"Origin": origin} if origin else {})
    try:
        with urlopen(req, timeout=4) as reply:
            status, raw = reply.status, reply.read()
    except HTTPError as exc:
        status, raw = exc.code, exc.read()
    assert status == expect, (url, status, expect)
    if url.endswith(".html"):
        return raw.decode("utf-8")
    return json.loads(raw)


def probe_agent_start(agent, source_id, prior_snapshot, *, integrated):
    """Real hardened entrypoint, temporary SQLite and ephemeral loopback only."""
    port = isolated_port()
    base = f"http://127.0.0.1:{port}"
    script = agent / "agent_hardened_entry.py"
    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(
            [sys.executable, "-u", str(script), "--host", "127.0.0.1", "--port", str(port)],
            cwd=agent, stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.monotonic() + 35
            ready = None
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    break
                try:
                    ready = get_agent(base + "/api/v1/ready")
                    if ready.get("ready") is True:
                        break
                except Exception:
                    time.sleep(.25)
            assert ready and ready["ready"] is True, "hardened agent failed to reach /ready"
            assert ready["agent_build"] == "CANONICAL-R11-BATCH"
            health = get_agent(base + "/api/v1/health")
            assert health["ok"] is True
            assert health["latest_snapshot_id"] >= prior_snapshot
            assert health["configured_lines"] == ["TAN10102", "TAN10103"]
            assert get_agent(base + "/api/v1/v2/capabilities", expect=401)["error"] == "agent_not_paired"
            cap = get_agent(base + "/api/v1/v2/capabilities", origin=base)
            assert cap["source_id"] == source_id
            assert cap["package_root"] == str(agent.parent.resolve())
            assert cap["native_console"] is True
            hardening = get_agent(base + "/api/v1/hardening/health", origin=base)
            assert hardening["ok"] is True and hardening["integrity"] == "ok"
            if integrated:
                page = get_agent(base + "/Central-de-Controle-/", origin=base)
                assert "offline-bootstrap.mjs" in page
                assert "central-runtime-boot-guard" in page
                release = get_agent(base + "/release-build.json", origin=base)
                assert release["sha"] == subprocess.check_output(
                    ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
            return {
                "build":ready["agent_build"],
                "original_source_preserved":True,
                "read_only_auth_enforced":True,
                "integrated_static":integrated,
                "runtime_loopback_only":True
            }
        finally:
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=8)
            log.seek(0)
            if process.returncode not in (0, 1, -15, 3221225786, 3221225787, -1073741510):
                details = log.read().decode("utf-8", errors="replace")[-3500:]
                raise AssertionError("Unexpected test agent exit: " + str(process.returncode) + " " + details)


def test_preserving_update_and_rollback():
    builder = load_builder()
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    with tempfile.TemporaryDirectory(prefix="ames-pr38-preserving-ci-") as temp:
        root = Path(temp)
        staged = root / "stage"
        info = builder.stage(staged, expected_sha=sha)
        assert info["kind"] == "preserving_stage_not_package"
        assert info["physical_gate"] == "PENDING"
        assert info["frontend_files"] > 20 and info["factory_engine_files"] > 0

        current = root / "existing_workstation"
        agent = current / "ames-agent"
        agent.mkdir(parents=True)
        for name in updater.FILES:
            shutil.copy2(AGENT / name, agent / name)
        # Runnable synthetic prior baseline, byte-distinct but same safe agent API.
        (agent / "agent_hardened_entry.py").write_bytes(
            (agent / "agent_hardened_entry.py").read_bytes() + b"\n# BASELINE_ORIGINAL\n"
        )
        for name in updater.HASHES:
            shutil.copy2(AGENT / name, agent / name)
        # This UUID only lives in the original operational SQLite.
        original_cfg = {
            "port": 8765, "configured_lines": ["TAN10102", "TAN10103"],
            "allowed_origins": ["https://existing.example.test"], "day_start": "07:00",
            "timezone": "America/Sao_Paulo", "data_protection_tag": "unchanged"
        }
        (agent / "config.json").write_text(json.dumps(original_cfg))
        database = Store(agent / "data" / "ames_local.sqlite3")
        database.initialize()
        canonical.initialize(database)
        original_source = snapshot(database)
        prior_snapshot = database.create_snapshot(window_id=None, source_kind="before_PR38")
        old_app = current / "frontend/Central-de-Controle-/app.js"
        old_app.parent.mkdir(parents=True)
        old_app.write_text("BASELINE FRONTEND")
        old_root = current / "00_INICIAR_AQUI.bat"
        old_root.write_text("BASELINE LAUNCHER")

        # Corrupt the staged manifest and demand fail-closed before mutation.
        staged_file = staged / "ames-agent/agent_hardened_entry.py"
        data = staged_file.read_bytes()
        staged_file.write_bytes(data + b"\n# corrupt intentionally\n")
        with patch.object(updater.socket, "create_connection", side_effect=OSError):
            try:
                updater.update(current, staged / "ames-agent")
            except ValueError as exc:
                assert "hash mismatch" in str(exc).lower()
            else:
                raise AssertionError("Tampered staging was accepted")
        assert old_app.read_text() == "BASELINE FRONTEND"
        assert old_root.read_text() == "BASELINE LAUNCHER"
        assert snapshot(database) == original_source
        assert database.latest_snapshot_id() == prior_snapshot
        staged_file.write_bytes(data)

        # First verify an *existing* runnable agent, with its established identity.
        preflight = probe_agent_start(agent, original_source, prior_snapshot, integrated=False)
        assert preflight["original_source_preserved"]

        # Apply the same trusted updater as production, but to disposable data.
        with patch.object(updater.socket, "create_connection", side_effect=OSError):
            backup = updater.update(current, staged / "ames-agent")
        assert backup.is_dir() and (backup / "backup.json").exists()
        assert (backup / "ames_local.sqlite3").is_file()
        assert snapshot(database) == original_source
        assert database.latest_snapshot_id() == prior_snapshot
        assert old_app.read_bytes() == (staged / "frontend/Central-de-Controle-/app.js").read_bytes()
        assert (current / "frontend/release-build.json").is_file()
        assert json.loads((current / "frontend/release-build.json").read_text())["sha"] == sha
        assert (agent / "agent_hardened_entry.py").read_bytes() == data
        cfg = json.loads((agent / "config.json").read_text())
        assert cfg["configured_lines"] == original_cfg["configured_lines"]
        assert cfg["data_protection_tag"] == "unchanged"
        assert cfg["allowed_origins"] == ["https://existing.example.test", updater.ORIGIN]
        assert Path(cfg["engine_dir"]) == (current / "factory-engine").resolve()
        assert not (staged / "ames-agent/config.json").exists()
        assert not (staged / "ames-agent/data/ames_local.sqlite3").exists()

        started = probe_agent_start(agent, original_source, prior_snapshot, integrated=True)
        assert started["integrated_static"] and started["read_only_auth_enforced"]
        assert snapshot(database) == original_source

        # Evidence collected after updating survives rollback, too.
        newer_snapshot = database.create_snapshot(window_id=None, source_kind="after_PR38")
        with patch.object(updater.socket, "create_connection", side_effect=OSError):
            updater.rollback(current, backup)
        assert snapshot(database) == original_source
        assert database.latest_snapshot_id() == newer_snapshot
        assert json.loads((agent / "config.json").read_text()) == original_cfg
        assert old_app.read_text() == "BASELINE FRONTEND"
        assert old_root.read_text() == "BASELINE LAUNCHER"
        assert not (current / "frontend/release-build.json").exists()
        assert not any(p.is_file() for p in (current / "factory-engine").rglob("*"))
        assert (agent / "agent_hardened_entry.py").read_bytes().endswith(b"\n# BASELINE_ORIGINAL\n")
        restored = probe_agent_start(agent, original_source, newer_snapshot, integrated=False)
        assert restored["original_source_preserved"] and restored["read_only_auth_enforced"]
        for name, expected in updater.HASHES.items():
            assert hashlib.sha256((agent / name).read_bytes()).hexdigest() == expected
    print("PASS PR38 preserving stage: SHA, manifest, isolated cold start, auth, SQLite identity, update, rollback, restart, no ZIP")

if __name__ == "__main__":
    test_preserving_update_and_rollback()
