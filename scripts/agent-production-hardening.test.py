from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

from store import Store
import production_hardening as hardening


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def status(store, sid):
    with store.connect() as con:
        row = con.execute("SELECT status,notes FROM snapshots WHERE id=?", (sid,)).fetchone()
    return dict(row)


def make_agent(root: Path):
    db = root / "ames.sqlite3"
    store = Store(db)
    store.initialize()
    config_path = root / "config.json"
    config_path.write_text(json.dumps({"port": 8765, "configured_lines": ["TAN10101"]}), encoding="utf-8")

    agent = SimpleNamespace(STORE=store, CONFIG_PATH=config_path)

    def success(*args, **kwargs):
        sid = store.create_snapshot(window_id=None, source_kind="test", source_name="success")
        with store.connect() as con:
            con.execute("CREATE TABLE IF NOT EXISTS test_payload(snapshot_id INTEGER,value TEXT)")
            con.execute("INSERT INTO test_payload VALUES(?,?)", (sid, "ok"))
        return {"snapshot_id": sid}

    def failure(*args, **kwargs):
        sid = store.create_snapshot(window_id=None, source_kind="test", source_name="failure")
        agent.failed_sid = sid
        raise RuntimeError("simulated crash")

    agent.ingest_integrated = success
    agent.ingest_3028_path = failure
    agent._persist_3028_live = success
    agent.write_config = lambda value: None
    return agent


def test_snapshot_lifecycle_and_migration():
    with tempfile.TemporaryDirectory() as tmp:
        agent = make_agent(Path(tmp))
        installed = hardening.install(agent)
        check(installed["snapshot_lifecycle"] == "collecting-complete-error-v1", "lifecycle not installed")

        result = agent.ingest_integrated({})
        check(status(agent.STORE, result["snapshot_id"])["status"] == "complete", "successful snapshot not committed")

        try:
            agent.ingest_3028_path("ignored")
        except RuntimeError:
            pass
        else:
            raise AssertionError("failure path did not raise")
        failed = status(agent.STORE, agent.failed_sid)
        check(failed["status"] == "error", "failed snapshot remained eligible")
        check("persistence interrupted" in (failed["notes"] or ""), "failure note missing")

        with agent.STORE.connect() as con:
            migration = con.execute("SELECT version,name,checksum FROM schema_migrations").fetchone()
        check(migration is not None and migration["version"] == 1, "migration ledger missing")
        check(migration["checksum"] == hardening.MIGRATION_CHECKSUM, "migration checksum mismatch")


def test_abandoned_snapshot_recovery():
    with tempfile.TemporaryDirectory() as tmp:
        agent = make_agent(Path(tmp))
        # Simulate a previous process that died after creating a collecting snapshot.
        with agent.STORE.connect() as con:
            cur = con.execute("INSERT INTO snapshots(window_id,collected_at,source_kind,status,notes) VALUES(NULL,?,'test','collecting','')", (hardening._utc_now(),))
            sid = int(cur.lastrowid)
        hardening.install(agent)
        recovered = status(agent.STORE, sid)
        check(recovered["status"] == "error", "abandoned snapshot was not recovered fail-closed")
        check("interrupted before snapshot commit" in (recovered["notes"] or ""), "recovery reason missing")


def test_atomic_config_and_fail_closed_validation():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        agent = make_agent(root)
        hardening.install(agent)
        original = json.loads(agent.CONFIG_PATH.read_text(encoding="utf-8"))
        agent.write_config({"port": 8766, "configured_lines": ["TAN10102"]})
        current = json.loads(agent.CONFIG_PATH.read_text(encoding="utf-8"))
        previous = json.loads(agent.CONFIG_PATH.with_name("config.json.previous").read_text(encoding="utf-8"))
        check(current["port"] == 8766, "atomic config did not replace target")
        check(previous == original, "last-known-good config was not preserved")
        check(not agent.CONFIG_PATH.with_name("config.json.tmp").exists(), "temporary config leaked")

        bad = root / "bad.json"
        bad.write_text("{broken", encoding="utf-8")
        try:
            hardening._validate_config_document(bad)
        except RuntimeError:
            pass
        else:
            raise AssertionError("invalid config did not fail closed")


if __name__ == "__main__":
    test_snapshot_lifecycle_and_migration()
    test_abandoned_snapshot_recovery()
    test_atomic_config_and_fail_closed_validation()
    print("agent production hardening: OK")
