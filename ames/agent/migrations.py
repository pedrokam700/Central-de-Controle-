"""Ordered SQLite migration registry for Central/A-MES.

Migration 0001 is already applied by hardening.py and is adopted here as the
factory-proven baseline. New schema changes must be appended to MIGRATIONS with
an immutable version/id/checksum and an apply callback. Never renumber or edit an
already-published migration.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional


@dataclass(frozen=True)
class Migration:
    version: int
    migration_id: str
    checksum: str
    apply: Optional[Callable] = None


MIGRATIONS = (
    Migration(1, "0001_snapshot_lifecycle", "snapshot-status-v1:completed_at,error", None),
)


def _quick_check(store) -> str:
    with store.connect() as con:
        row = con.execute("PRAGMA quick_check").fetchone()
    result = str(row[0] if row else "")
    if result.lower() != "ok":
        raise RuntimeError(f"SQLite integrity check failed: {result or 'unknown'}")
    return result


def _validate_registry() -> None:
    versions = [migration.version for migration in MIGRATIONS]
    expected = list(range(1, len(MIGRATIONS) + 1))
    if versions != expected:
        raise RuntimeError(f"Migration registry must be contiguous: {versions} != {expected}")
    ids = [migration.migration_id for migration in MIGRATIONS]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Migration registry contains duplicate migration_id")
    for migration in MIGRATIONS:
        if not migration.migration_id or not migration.checksum:
            raise RuntimeError(f"Migration {migration.version} has incomplete identity")


def apply(store) -> dict:
    """Verify the adopted baseline and apply any future ordered migrations.

    hardening.py currently owns migration 0001. This registry is intentionally
    layered after that proven bootstrap so we do not rewrite the active collector
    boundary during the R12 physical gate. Future migrations live here.
    """
    _validate_registry()
    _quick_check(store)
    known = {migration.version: migration for migration in MIGRATIONS}
    applied_now = []
    verified = []
    with store.connect() as con:
        con.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations(
                 version INTEGER PRIMARY KEY,
                 migration_id TEXT NOT NULL UNIQUE,
                 applied_at TEXT NOT NULL,
                 checksum TEXT NOT NULL
               )"""
        )
        rows = con.execute(
            "SELECT version,migration_id,checksum FROM schema_migrations ORDER BY version"
        ).fetchall()
        for row in rows:
            version = int(row["version"])
            migration = known.get(version)
            if migration is None:
                raise RuntimeError(
                    f"SQLite schema version {version} is newer/unknown to this runtime; refusing downgrade"
                )
            if str(row["migration_id"]) != migration.migration_id or str(row["checksum"]) != migration.checksum:
                raise RuntimeError(
                    f"SQLite migration identity mismatch at v{version}: expected {migration.migration_id}"
                )
            verified.append(migration.migration_id)

        recorded = {int(row["version"]) for row in rows}
        if recorded and sorted(recorded) != list(range(1, max(recorded) + 1)):
            raise RuntimeError(f"SQLite migration history contains a gap: {sorted(recorded)}")

        for migration in MIGRATIONS:
            if migration.version in recorded:
                continue
            if migration.apply is None:
                raise RuntimeError(
                    f"Adopted migration {migration.migration_id} is missing; hardening bootstrap did not establish baseline"
                )
            savepoint = f"migration_{migration.version}"
            con.execute(f"SAVEPOINT {savepoint}")
            try:
                migration.apply(con)
                con.execute(
                    "INSERT INTO schema_migrations(version,migration_id,applied_at,checksum) VALUES(?,?,datetime('now'),?)",
                    (migration.version, migration.migration_id, migration.checksum),
                )
                con.execute(f"RELEASE SAVEPOINT {savepoint}")
            except BaseException:
                con.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
                con.execute(f"RELEASE SAVEPOINT {savepoint}")
                raise
            applied_now.append(migration.migration_id)

        latest = MIGRATIONS[-1].version if MIGRATIONS else 0
        con.execute(
            "INSERT OR REPLACE INTO schema_meta(key,value) VALUES('hardening_schema_version',?)",
            (str(latest),),
        )
    _quick_check(store)
    return {
        "schema_version": MIGRATIONS[-1].version if MIGRATIONS else 0,
        "registry": [
            {"version": m.version, "migration_id": m.migration_id, "checksum": m.checksum}
            for m in MIGRATIONS
        ],
        "verified": verified,
        "applied": applied_now,
    }


def public_contract() -> dict:
    _validate_registry()
    return {
        "schema": "central-sqlite-migrations-v1",
        "latest_version": MIGRATIONS[-1].version if MIGRATIONS else 0,
        "migrations": [
            {"version": m.version, "migration_id": m.migration_id, "checksum": m.checksum}
            for m in MIGRATIONS
        ],
    }
