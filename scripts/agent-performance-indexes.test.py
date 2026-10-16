from __future__ import annotations

import sqlite3
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

import performance_indexes


DDL = """
CREATE TABLE defect_observations(snapshot_id INTEGER,line TEXT,pcba_sn TEXT,defect_time TEXT);
CREATE TABLE pcba_history(snapshot_id INTEGER,pcba_sn TEXT,hist_seq TEXT);
CREATE TABLE history_contexts(snapshot_id INTEGER,line TEXT,current_pcba TEXT,historical_pcba TEXT);
CREATE TABLE material_reuse(snapshot_id INTEGER,current_pcba_sn TEXT,item_sn TEXT);
CREATE TABLE process_events(snapshot_id INTEGER,pcba_sn TEXT,event_time TEXT);
CREATE TABLE repair_refreshes(snapshot_id INTEGER,pcba_sn TEXT,refreshed_at TEXT);
CREATE TABLE audit_events(snapshot_id INTEGER,created_at TEXT);
CREATE TABLE mes_process_timeline(snapshot_id INTEGER,line_id TEXT,event_time TEXT,pcba_sn TEXT);
"""


class FakeStore:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path)
        try:
            yield con
            con.commit()
        finally:
            con.close()


def test_indexes_are_additive_idempotent_and_data_safe():
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / "ames.sqlite3"
        store = FakeStore(path)
        with store.connect() as con:
            con.executescript(DDL)
            con.execute(
                "INSERT INTO defect_observations VALUES(?,?,?,?)",
                (1, "TAN10101", "002527TEST", "2026-10-14T08:00:00"),
            )

        first = performance_indexes.install(store)
        second = performance_indexes.install(store)
        assert first["ok"] is True
        assert second["ok"] is True
        assert first["count"] == len(performance_indexes.INDEXES)
        assert second["count"] == len(performance_indexes.INDEXES)
        assert not first["skipped"]
        assert performance_indexes.health(store) == {
            "ok": True,
            "expected": len(performance_indexes.INDEXES),
            "present": len(performance_indexes.INDEXES),
            "missing": [],
        }

        with store.connect() as con:
            names = {
                row[0]
                for row in con.execute(
                    "SELECT name FROM sqlite_master WHERE type='index'"
                ).fetchall()
            }
            assert set(performance_indexes.INDEXES).issubset(names)
            row = con.execute(
                "SELECT line,pcba_sn FROM defect_observations WHERE snapshot_id=1"
            ).fetchone()
            assert row == ("TAN10101", "002527TEST")


def test_missing_optional_table_is_reported_without_failure():
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / "partial.sqlite3"
        store = FakeStore(path)
        with store.connect() as con:
            con.execute(
                "CREATE TABLE defect_observations(snapshot_id INTEGER,line TEXT,pcba_sn TEXT,defect_time TEXT)"
            )
        state = performance_indexes.install(store)
        assert state["ok"] is True
        assert "idx_defect_obs_snapshot_line_pcba" in state["installed"]
        assert "idx_mes_timeline_snapshot_line_time" in state["skipped"]
        health = performance_indexes.health(store)
        assert health["ok"] is False
        assert "idx_mes_timeline_snapshot_line_time" in health["missing"]


if __name__ == "__main__":
    tests = [
        test_indexes_are_additive_idempotent_and_data_safe,
        test_missing_optional_table_is_reported_without_failure,
    ]
    for fn in tests:
        fn()
        print("PASS", fn.__name__)
    print(f"PASS performance indexes ({len(tests)} tests)")
