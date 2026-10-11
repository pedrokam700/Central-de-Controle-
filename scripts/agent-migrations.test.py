from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

from store import Store  # noqa: E402
import hardening  # noqa: E402
import migrations  # noqa: E402


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def new_store(root: Path) -> Store:
    store = Store(root / "ames.sqlite3")
    store.initialize()
    hardening.install_store_guards(store)
    return store


def test_adopts_existing_0001_and_is_idempotent():
    with tempfile.TemporaryDirectory() as td:
        store = new_store(Path(td))
        first = migrations.apply(store)
        second = migrations.apply(store)
        check(first["schema_version"] == 1, "registry must adopt schema v1")
        check("0001_snapshot_lifecycle" in first["verified"], "baseline migration must be verified")
        check(first["applied"] == [], "adopted migration must not be re-applied")
        check(second["applied"] == [], "registry must be idempotent")


def test_future_migration_path_is_ordered_and_idempotent():
    with tempfile.TemporaryDirectory() as td:
        store = new_store(Path(td))
        original = migrations.MIGRATIONS

        def apply_v2(con):
            con.execute("CREATE TABLE migration_probe(id INTEGER PRIMARY KEY, value TEXT)")

        try:
            migrations.MIGRATIONS = (
                original[0],
                migrations.Migration(2, "0002_probe", "probe-v1:create-table", apply_v2),
            )
            first = migrations.apply(store)
            second = migrations.apply(store)
            check(first["applied"] == ["0002_probe"], "v2 must be applied exactly once")
            check(second["applied"] == [], "v2 replay must be idempotent")
            with store.connect() as con:
                table = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='migration_probe'").fetchone()
                row = con.execute("SELECT migration_id,checksum FROM schema_migrations WHERE version=2").fetchone()
                meta = con.execute("SELECT value FROM schema_meta WHERE key='hardening_schema_version'").fetchone()
            check(table is not None, "future migration must execute schema change")
            check(row["migration_id"] == "0002_probe", "future migration identity missing")
            check(row["checksum"] == "probe-v1:create-table", "future migration checksum missing")
            check(str(meta[0]) == "2", "schema_meta must advance to latest registry version")
        finally:
            migrations.MIGRATIONS = original


def test_failed_future_migration_rolls_back_savepoint():
    with tempfile.TemporaryDirectory() as td:
        store = new_store(Path(td))
        original = migrations.MIGRATIONS

        def broken_v2(con):
            con.execute("CREATE TABLE must_rollback(id INTEGER PRIMARY KEY)")
            raise RuntimeError("boom")

        try:
            migrations.MIGRATIONS = (
                original[0],
                migrations.Migration(2, "0002_broken", "broken-v1", broken_v2),
            )
            try:
                migrations.apply(store)
            except RuntimeError as exc:
                check("boom" in str(exc), "original migration error should surface")
            else:
                raise AssertionError("broken migration must fail")
            with store.connect() as con:
                table = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='must_rollback'").fetchone()
                row = con.execute("SELECT migration_id FROM schema_migrations WHERE version=2").fetchone()
            check(table is None, "failed migration schema change must roll back")
            check(row is None, "failed migration must not be recorded")
        finally:
            migrations.MIGRATIONS = original


def test_unknown_newer_database_fails_closed():
    with tempfile.TemporaryDirectory() as td:
        store = new_store(Path(td))
        with store.connect() as con:
            con.execute(
                "INSERT INTO schema_migrations(version,migration_id,applied_at,checksum) VALUES(2,'0002_future','2026-10-11','future')"
            )
        try:
            migrations.apply(store)
        except RuntimeError as exc:
            check("newer/unknown" in str(exc), "downgrade refusal must be explicit")
        else:
            raise AssertionError("older runtime must refuse newer database schema")


def test_registry_contract_is_contiguous_and_visible_from_agent():
    contract = migrations.public_contract()
    check(contract["schema"] == "central-sqlite-migrations-v1", "migration contract schema mismatch")
    check(contract["latest_version"] == 1, "current migration registry must remain v1")
    check([row["version"] for row in contract["migrations"]] == [1], "registry must be contiguous")
    source = (AGENT / "agent_hardened_entry.py").read_text(encoding="utf-8")
    check("import migrations" in source, "hardened agent must load migration registry")
    check("MIGRATION_STATE = migrations.apply(entry.a.STORE)" in source, "registry must run at startup")
    check('"migration_registry": migrations.public_contract()' in source, "migration registry must be diagnosable")


if __name__ == "__main__":
    tests = [
        test_adopts_existing_0001_and_is_idempotent,
        test_future_migration_path_is_ordered_and_idempotent,
        test_failed_future_migration_rolls_back_savepoint,
        test_unknown_newer_database_fails_closed,
        test_registry_contract_is_contiguous_and_visible_from_agent,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS agent migrations ({len(tests)} tests)")
