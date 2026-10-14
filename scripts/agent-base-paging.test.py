from __future__ import annotations

import sqlite3
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

import base_paging_backend as paging  # noqa: E402


class FakeStore:
    def __init__(self, path: Path):
        self.path = path
        self.dataset_calls = []
        self.team_calls = []

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path)
        con.row_factory = sqlite3.Row
        try:
            yield con
            con.commit()
        finally:
            con.close()

    def latest_snapshot_id_for_line(self, line):
        return 7 if line == "TAN10101" else None

    def dataset_rows(self, dataset, snapshot_id=None, line=None, limit=5000):
        self.dataset_calls.append((dataset, snapshot_id, line, limit))
        if dataset == "pcba_history":
            return [{"seq": i, "line": line} for i in range(limit)]
        raise ValueError(f"unexpected fallback dataset {dataset}")

    def team_dataset_rows(self, dataset, lines=None, line=None, limit=5000):
        self.team_calls.append((dataset, tuple(lines or []), line, limit))
        return [{"seq": i} for i in range(limit)]


def seed(store: FakeStore):
    with store.connect() as con:
        con.executescript(
            """
            CREATE TABLE defect_observations(id INTEGER PRIMARY KEY,snapshot_id INTEGER,line TEXT,defect_time TEXT,pcba_sn TEXT);
            CREATE TABLE line_metrics(snapshot_id INTEGER,line TEXT,product_model TEXT,check_fpy REAL);
            CREATE TABLE history_contexts(id INTEGER PRIMARY KEY,snapshot_id INTEGER,line TEXT,current_pcba TEXT,historical_pcba TEXT);
            CREATE TABLE process_defect_contexts(id INTEGER PRIMARY KEY,snapshot_id INTEGER,line TEXT,defect_time TEXT,pcba_sn TEXT);
            """
        )
        con.executemany(
            "INSERT INTO defect_observations(id,snapshot_id,line,defect_time,pcba_sn) VALUES(?,?,?,?,?)",
            [(i + 1, 7, "TAN10101", f"2026-10-13T08:{i // 60:02d}:{i % 60:02d}", f"P{i:04d}") for i in range(300)],
        )
        con.executemany(
            "INSERT INTO process_defect_contexts(id,snapshot_id,line,defect_time,pcba_sn) VALUES(?,?,?,?,?)",
            [(i + 1, 7, "TAN10101", f"2026-10-13T09:{i // 60:02d}:{i % 60:02d}", f"C{i:04d}") for i in range(130)],
        )


def check(value, message):
    if not value:
        raise AssertionError(message)


def test_bounds_fail_closed():
    check(paging.normalize_limit(None) == 100, "default limit")
    check(paging.normalize_limit(99999) == 500, "limit cap")
    check(paging.normalize_limit(-1) == 1, "limit floor")
    check(paging.normalize_offset("bad") == 0, "invalid offset")
    check(paging.normalize_offset(-5) == 0, "offset floor")
    check(paging.normalize_offset(999999) == 100000, "offset cap")


def test_direct_defect_offset_reads_only_requested_page():
    with tempfile.TemporaryDirectory() as tmp:
        store = FakeStore(Path(tmp) / "base.sqlite3")
        seed(store)
        result = paging.snapshot_page(store, "defects", 7, line="TAN10101", limit=50, offset=100)
        check(result["limit"] == 50 and result["offset"] == 100, "metadata should echo bounded page")
        check(result["returned"] == 50, "exact page size")
        check(result["rows"][0]["pcba_sn"] == "P0100", "offset must start at exact row 101")
        check(result["rows"][-1]["pcba_sn"] == "P0149", "page must end without prefix rows")
        check(not store.dataset_calls, "direct SQL dataset must not materialize old prefix")


def test_process_context_offset_uses_optional_table():
    with tempfile.TemporaryDirectory() as tmp:
        store = FakeStore(Path(tmp) / "base.sqlite3")
        seed(store)
        result = paging.snapshot_page(store, "process_defect_contexts", 7, line="TAN10101", limit=25, offset=100)
        check(len(result["rows"]) == 25, "process context page size")
        check(result["rows"][0]["pcba_sn"] == "C0100", "process offset")


def test_contextual_fallback_preserves_store_semantics_then_slices_transport():
    with tempfile.TemporaryDirectory() as tmp:
        store = FakeStore(Path(tmp) / "base.sqlite3")
        seed(store)
        result = paging.snapshot_page(store, "pcba_history", 7, line="TAN10101", limit=50, offset=100)
        check([row["seq"] for row in result["rows"][:2]] == [100, 101], "fallback must slice after contextual projection")
        check(store.dataset_calls == [("pcba_history", 7, "TAN10101", 150)], "fallback should request only required prefix")


def test_team_line_resolves_latest_snapshot_but_multiline_keeps_legacy_aggregation():
    with tempfile.TemporaryDirectory() as tmp:
        store = FakeStore(Path(tmp) / "base.sqlite3")
        seed(store)
        one = paging.team_page(store, "defects", lines=["TAN10101"], line="TAN10101", limit=20, offset=40)
        check(one["snapshot_id"] == 7 and one["rows"][0]["pcba_sn"] == "P0040", "line-scoped team page should use exact latest snapshot")
        many = paging.team_page(store, "audit_events", lines=["TAN10101", "TAN10102"], line=None, limit=20, offset=40)
        check(many["rows"][0]["seq"] == 40, "multi-line fallback offset")
        check(store.team_calls[-1][-1] == 60, "multi-line fallback should request only needed prefix")


if __name__ == "__main__":
    tests = [
        test_bounds_fail_closed,
        test_direct_defect_offset_reads_only_requested_page,
        test_process_context_offset_uses_optional_table,
        test_contextual_fallback_preserves_store_semantics_then_slices_transport,
        test_team_line_resolves_latest_snapshot_but_multiline_keeps_legacy_aggregation,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS base paging backend ({len(tests)} tests)")
