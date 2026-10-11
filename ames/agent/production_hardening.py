"""Production-readiness guards for the canonical A-MES agent.

This module intentionally hardens the edges around the validated collectors instead
of rewriting them.  It is installed only by the canonical entrypoint and keeps the
R12/3028 collector implementation untouched.
"""
from __future__ import annotations

import functools
import hashlib
import json
import os
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HARDENING_VERSION = 1
MIGRATION_NAME = "production_hardening_baseline"
MIGRATION_CHECKSUM = hashlib.sha256(MIGRATION_NAME.encode("utf-8")).hexdigest()
_VALID_SNAPSHOT_STATES = {"collecting", "complete", "partial", "error"}
_tls = threading.local()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _append_note(existing: str | None, note: str) -> str:
    parts = [str(existing or "").strip(), note.strip()]
    return " | ".join(part for part in parts if part)


def _integrity_check(store) -> str:
    with store.connect() as con:
        row = con.execute("PRAGMA quick_check").fetchone()
    result = str(row[0] if row else "unknown")
    if result.lower() != "ok":
        raise RuntimeError(f"SQLite quick_check failed: {result}")
    return result


def _ensure_migrations(store) -> None:
    with store.connect() as con:
        con.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations(
                   version INTEGER PRIMARY KEY,
                   name TEXT NOT NULL,
                   checksum TEXT NOT NULL,
                   applied_at TEXT NOT NULL
               )"""
        )
        row = con.execute(
            "SELECT name,checksum FROM schema_migrations WHERE version=?",
            (HARDENING_VERSION,),
        ).fetchone()
        if row:
            if row["name"] != MIGRATION_NAME or row["checksum"] != MIGRATION_CHECKSUM:
                raise RuntimeError("Schema migration checksum mismatch")
        else:
            con.execute(
                "INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES(?,?,?,?)",
                (HARDENING_VERSION, MIGRATION_NAME, MIGRATION_CHECKSUM, _utc_now()),
            )


def _recover_abandoned_snapshots(store) -> int:
    """A process restart proves a still-collecting snapshot never completed."""
    with store.connect() as con:
        rows = con.execute(
            "SELECT id,notes FROM snapshots WHERE status='collecting'"
        ).fetchall()
        for row in rows:
            con.execute(
                "UPDATE snapshots SET status='error',notes=? WHERE id=?",
                (_append_note(row["notes"], "interrupted before snapshot commit"), row["id"]),
            )
    return len(rows)


def _validate_config_document(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        raise RuntimeError(f"config.json invalido; startup bloqueado: {exc}") from exc
    if not isinstance(value, dict):
        raise RuntimeError("config.json invalido; raiz precisa ser objeto JSON")
    lines = value.get("configured_lines")
    if lines is not None and not isinstance(lines, list):
        raise RuntimeError("config.json invalido; configured_lines precisa ser lista")
    port = value.get("port")
    if port is not None:
        try:
            port = int(port)
        except (TypeError, ValueError) as exc:
            raise RuntimeError("config.json invalido; port precisa ser inteiro") from exc
        if not 1 <= port <= 65535:
            raise RuntimeError("config.json invalido; port fora do intervalo")
    return value


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = path.with_name(path.name + ".previous")
    temp = path.with_name(path.name + ".tmp")
    payload = json.dumps(value, ensure_ascii=False, indent=2)
    # Validate the exact bytes before replacing the last-known-good file.
    parsed = json.loads(payload)
    if not isinstance(parsed, dict):
        raise RuntimeError("config serialization produced invalid root")
    if path.exists():
        shutil.copy2(path, previous)
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        try:
            if temp.exists():
                temp.unlink()
        except OSError:
            pass


def _tracked_ids() -> list[int] | None:
    return getattr(_tls, "snapshot_ids", None)


def _mark_snapshot(store, snapshot_id: int, status: str, note: str | None = None) -> None:
    if status not in _VALID_SNAPSHOT_STATES:
        raise ValueError(f"Invalid snapshot status: {status}")
    with store.connect() as con:
        row = con.execute("SELECT notes FROM snapshots WHERE id=?", (int(snapshot_id),)).fetchone()
        if not row:
            raise ValueError(f"Snapshot not found: {snapshot_id}")
        notes = _append_note(row["notes"], note) if note else row["notes"]
        con.execute("UPDATE snapshots SET status=?,notes=? WHERE id=?", (status, notes, int(snapshot_id)))


def _install_snapshot_creator(store) -> None:
    cls = type(store)
    if getattr(cls, "_production_snapshot_lifecycle_v1", False):
        return

    def create_snapshot(self, *, window_id, source_kind, source_name="", source_bytes=None, notes=""):
        sha = hashlib.sha256(source_bytes).hexdigest() if source_bytes is not None else None
        now = _utc_now()
        with self.connect() as con:
            cur = con.execute(
                """INSERT INTO snapshots(window_id,collected_at,source_kind,source_name,source_sha256,status,notes)
                   VALUES(?,?,?,?,?,'collecting',?)""",
                (window_id, now, source_kind, source_name, sha, notes),
            )
            snapshot_id = int(cur.lastrowid)
        tracked = _tracked_ids()
        if tracked is not None:
            tracked.append(snapshot_id)
        return snapshot_id

    cls.create_snapshot = create_snapshot
    cls._production_snapshot_lifecycle_v1 = True


def _wrap_snapshot_operation(agent, name: str) -> None:
    original = getattr(agent, name, None)
    if not callable(original) or getattr(original, "_production_snapshot_scope_v1", False):
        return

    @functools.wraps(original)
    def guarded(*args, **kwargs):
        previous = _tracked_ids()
        tracked: list[int] = []
        _tls.snapshot_ids = tracked
        try:
            result = original(*args, **kwargs)
            for snapshot_id in dict.fromkeys(tracked):
                _mark_snapshot(agent.STORE, snapshot_id, "complete")
            return result
        except BaseException as exc:
            for snapshot_id in dict.fromkeys(tracked):
                try:
                    _mark_snapshot(
                        agent.STORE,
                        snapshot_id,
                        "error",
                        f"{type(exc).__name__}: persistence interrupted",
                    )
                except Exception:
                    pass
            raise
        finally:
            if previous is None:
                try:
                    delattr(_tls, "snapshot_ids")
                except AttributeError:
                    pass
            else:
                _tls.snapshot_ids = previous

    guarded._production_snapshot_scope_v1 = True
    setattr(agent, name, guarded)


def install(agent) -> dict[str, Any]:
    """Install production guards around the canonical agent.

    The operation is idempotent and fails closed on an invalid existing config or
    corrupt SQLite database.  No MES navigation/collector implementation is changed.
    """
    config_path = Path(agent.CONFIG_PATH)
    _validate_config_document(config_path)
    _ensure_migrations(agent.STORE)
    integrity = _integrity_check(agent.STORE)
    recovered = _recover_abandoned_snapshots(agent.STORE)
    _install_snapshot_creator(agent.STORE)

    def write_config(config):
        if not isinstance(config, dict):
            raise TypeError("config must be an object")
        _atomic_write_json(config_path, config)
        _validate_config_document(config_path)

    agent.write_config = write_config
    # These are the only ingestion boundaries that create new base snapshots.
    for function_name in ("ingest_integrated", "ingest_3028_path", "_persist_3028_live"):
        _wrap_snapshot_operation(agent, function_name)

    state = {
        "version": HARDENING_VERSION,
        "sqlite_integrity": integrity,
        "recovered_abandoned_snapshots": recovered,
        "config_fail_closed": True,
        "atomic_config": True,
        "snapshot_lifecycle": "collecting-complete-error-v1",
    }
    agent.PRODUCTION_HARDENING = state
    return state


def status(store) -> dict[str, Any]:
    with store.connect() as con:
        migration = con.execute(
            "SELECT version,name,checksum,applied_at FROM schema_migrations ORDER BY version DESC LIMIT 1"
        ).fetchone()
        collecting = int(con.execute("SELECT COUNT(*) FROM snapshots WHERE status='collecting'").fetchone()[0])
        errored = int(con.execute("SELECT COUNT(*) FROM snapshots WHERE status='error'").fetchone()[0])
    return {
        "version": HARDENING_VERSION,
        "migration": dict(migration) if migration else None,
        "sqlite_integrity": _integrity_check(store),
        "collecting_snapshots": collecting,
        "errored_snapshots": errored,
    }
