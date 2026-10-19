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
            (agent / name).write_text("BASELINE_ORIGINAL " + name, encoding="utf-8")
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
        assert not (current / "factory-engine").exists()
        assert (agent / "agent_hardened_entry.py").read_text() == "BASELINE_ORIGINAL agent_hardened_entry.py"
        for name, expected in updater.HASHES.items():
            assert hashlib.sha256((agent / name).read_bytes()).hexdigest() == expected
    print("PASS PR38 preserving stage: SHA, manifest, offline fixture, SQLite identity, update, rollback, no ZIP")

if __name__ == "__main__":
    test_preserving_update_and_rollback()
