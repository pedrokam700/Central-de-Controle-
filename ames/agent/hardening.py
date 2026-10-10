"""Production hardening for the canonical A-MES agent.

This module deliberately wraps the current agent/store instead of rewriting the
validated collectors. It adds:
- explicit SQLite migrations;
- snapshot lifecycle (collecting -> complete/error);
- latest-snapshot reads that ignore incomplete snapshots;
- fail-closed canonical export for incomplete snapshots;
- strict/atomic config writes.

The layer is transitional: once factory-proven, these guarantees can move into
store.py/agent.py directly.
"""
from __future__ import annotations

import json
import os
import shutil
import types
from pathlib import Path
from typing import Any, Dict, Iterable

HARDENING_SCHEMA_VERSION = 1
MIGRATION_ID = "0001_snapshot_lifecycle"


def _quick_check(store) -> str:
    with store.connect() as con:
        row = con.execute("PRAGMA quick_check").fetchone()
    result = str(row[0] if row else "")
    if result.lower() != "ok":
        raise RuntimeError(f"SQLite integrity check failed: {result or 'unknown'}")
    return result


def _column_names(con, table: str) -> set[str]:
    return {str(row[1]) for row in con.execute(f"PRAGMA table_info({table})").fetchall()}


def apply_migrations(store) -> Dict[str, Any]:
    """Apply idempotent local migrations after Store.initialize()."""
    _quick_check(store)
    applied = []
    with store.connect() as con:
        con.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations(
                 version INTEGER PRIMARY KEY,
                 migration_id TEXT NOT NULL UNIQUE,
                 applied_at TEXT NOT NULL,
                 checksum TEXT NOT NULL
               )"""
        )
        row = con.execute(
            "SELECT version FROM schema_migrations WHERE migration_id=?",
            (MIGRATION_ID,),
        ).fetchone()
        if not row:
            columns = _column_names(con, "snapshots")
            if "completed_at" not in columns:
                con.execute("ALTER TABLE snapshots ADD COLUMN completed_at TEXT")
            if "error" not in columns:
                con.execute("ALTER TABLE snapshots ADD COLUMN error TEXT")
            checksum = "snapshot-status-v1:completed_at,error"
            con.execute(
                "INSERT INTO schema_migrations(version,migration_id,applied_at,checksum) VALUES(?,?,datetime('now'),?)",
                (HARDENING_SCHEMA_VERSION, MIGRATION_ID, checksum),
            )
            applied.append(MIGRATION_ID)
        con.execute(
            "INSERT OR REPLACE INTO schema_meta(key,value) VALUES('hardening_schema_version',?)",
            (str(HARDENING_SCHEMA_VERSION),),
        )
    _quick_check(store)
    return {"schema_version": HARDENING_SCHEMA_VERSION, "applied": applied}


def strict_load_config(path: str | Path) -> Dict[str, Any]:
    path = Path(path)
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        raise RuntimeError(f"config.json inválido: {type(exc).__name__}: {exc}") from exc
    if not isinstance(value, dict):
        raise RuntimeError("config.json inválido: raiz deve ser um objeto JSON")
    return value


def atomic_write_json(path: str | Path, value: Dict[str, Any]) -> None:
    path = Path(path)
    if not isinstance(value, dict):
        raise TypeError("Config must be a dict")
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = path.with_name(path.stem + ".previous" + path.suffix)
    if path.exists():
        # Refuse to overwrite an already-corrupt configuration.
        strict_load_config(path)
        shutil.copy2(path, previous)
    tmp = path.with_name(path.name + f".tmp.{os.getpid()}")
    try:
        with tmp.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        # Validate the bytes we are about to publish.
        strict_load_config(tmp)
        os.replace(tmp, path)
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass


def _bind_store_method(store, name, function):
    setattr(store, name, types.MethodType(function, store))


def install_store_guards(store) -> Dict[str, Any]:
    migration = apply_migrations(store)
    if getattr(store, "_hardening_installed", False):
        return migration

    def create_snapshot(self, *, window_id, source_kind, source_name="", source_bytes=None, notes=""):
        import hashlib
        from store import utc_now

        sha = hashlib.sha256(source_bytes).hexdigest() if source_bytes is not None else None
        with self.connect() as con:
            cur = con.execute(
                """INSERT INTO snapshots(window_id,collected_at,source_kind,source_name,source_sha256,status,notes,completed_at,error)
                   VALUES(?,?,?,?,?,'collecting',?,NULL,NULL)""",
                (window_id, utc_now(), source_kind, source_name, sha, notes),
            )
            return int(cur.lastrowid)

    def snapshot_status(self, snapshot_id: int):
        with self.connect() as con:
            row = con.execute(
                "SELECT id,status,completed_at,error FROM snapshots WHERE id=?",
                (int(snapshot_id),),
            ).fetchone()
        return dict(row) if row else None

    def finalize_snapshot(self, snapshot_id: int):
        from store import utc_now

        sid = int(snapshot_id)
        with self.connect() as con:
            row = con.execute("SELECT status FROM snapshots WHERE id=?", (sid,)).fetchone()
            if not row:
                raise ValueError("Snapshot not found")
            if row["status"] == "complete":
                return sid
            evidence = 0
            for table in ("line_metrics", "defect_observations", "snapshot_payloads"):
                evidence += int(
                    con.execute(
                        f"SELECT COUNT(*) FROM {table} WHERE snapshot_id=?", (sid,)
                    ).fetchone()[0]
                )
            if evidence <= 0:
                raise RuntimeError("Snapshot sem evidência persistida; recusado como complete")
            con.execute(
                "UPDATE snapshots SET status='complete',completed_at=?,error=NULL WHERE id=?",
                (utc_now(), sid),
            )
        return sid

    def fail_snapshot(self, snapshot_id: int, error: str):
        from store import utc_now

        sid = int(snapshot_id)
        with self.connect() as con:
            con.execute(
                """UPDATE snapshots
                   SET status='error',completed_at=COALESCE(completed_at,?),error=?
                   WHERE id=? AND status<>'complete'""",
                (utc_now(), str(error)[:4000], sid),
            )
        return sid

    def latest_snapshot_id(self):
        with self.connect() as con:
            row = con.execute(
                "SELECT id FROM snapshots WHERE status='complete' ORDER BY id DESC LIMIT 1"
            ).fetchone()
        return int(row["id"]) if row else None

    def latest_snapshot_id_for_line(self, line: str):
        line = str(line or "").strip()
        if not line:
            return None
        with self.connect() as con:
            row = con.execute(
                """SELECT MAX(snapshot_id) AS sid FROM (
                     SELECT lm.snapshot_id
                     FROM line_metrics lm JOIN snapshots s ON s.id=lm.snapshot_id
                     WHERE lm.line=? AND s.status='complete'
                     UNION ALL
                     SELECT o.snapshot_id
                     FROM defect_observations o JOIN snapshots s ON s.id=o.snapshot_id
                     WHERE o.line=? AND s.status='complete'
                   )""",
                (line, line),
            ).fetchone()
        return int(row["sid"]) if row and row["sid"] is not None else None

    def latest_snapshot_ids_by_line(self, lines: Iterable[str] | None = None):
        requested = [str(x).strip() for x in (lines or []) if str(x).strip()]
        with self.connect() as con:
            if not requested:
                requested = sorted(
                    {
                        str(r[0])
                        for r in con.execute(
                            """SELECT DISTINCT lm.line
                               FROM line_metrics lm JOIN snapshots s ON s.id=lm.snapshot_id
                               WHERE lm.line IS NOT NULL AND lm.line<>'' AND s.status='complete'
                               UNION
                               SELECT DISTINCT o.line
                               FROM defect_observations o JOIN snapshots s ON s.id=o.snapshot_id
                               WHERE o.line IS NOT NULL AND o.line<>'' AND s.status='complete'"""
                        ).fetchall()
                    }
                )
            result = {}
            for line in requested:
                row = con.execute(
                    """SELECT MAX(snapshot_id) AS sid FROM (
                         SELECT lm.snapshot_id
                         FROM line_metrics lm JOIN snapshots s ON s.id=lm.snapshot_id
                         WHERE lm.line=? AND s.status='complete'
                         UNION ALL
                         SELECT o.snapshot_id
                         FROM defect_observations o JOIN snapshots s ON s.id=o.snapshot_id
                         WHERE o.line=? AND s.status='complete'
                       )""",
                    (line, line),
                ).fetchone()
                if row and row["sid"] is not None:
                    result[line] = int(row["sid"])
            return result

    _bind_store_method(store, "create_snapshot", create_snapshot)
    _bind_store_method(store, "snapshot_status", snapshot_status)
    _bind_store_method(store, "finalize_snapshot", finalize_snapshot)
    _bind_store_method(store, "fail_snapshot", fail_snapshot)
    _bind_store_method(store, "latest_snapshot_id", latest_snapshot_id)
    _bind_store_method(store, "latest_snapshot_id_for_line", latest_snapshot_id_for_line)
    _bind_store_method(store, "latest_snapshot_ids_by_line", latest_snapshot_ids_by_line)
    store._hardening_installed = True
    return migration


def _extract_snapshot_ids(result: Any) -> set[int]:
    ids: set[int] = set()
    if isinstance(result, dict):
        value = result.get("snapshot_id")
        if value is not None:
            try:
                ids.add(int(value))
            except (TypeError, ValueError):
                pass
        many = result.get("snapshot_ids")
        if isinstance(many, dict):
            values = many.values()
        elif isinstance(many, (list, tuple, set)):
            values = many
        else:
            values = ()
        for value in values:
            try:
                ids.add(int(value))
            except (TypeError, ValueError):
                pass
    return ids


def _collecting_ids(store) -> set[int]:
    with store.connect() as con:
        return {
            int(row[0])
            for row in con.execute(
                "SELECT id FROM snapshots WHERE status='collecting'"
            ).fetchall()
        }


def _wrap_snapshot_operation(agent_module, name: str) -> None:
    original = getattr(agent_module, name, None)
    if not callable(original) or getattr(original, "_hardening_wrapped", False):
        return
    store = agent_module.STORE

    def wrapped(*args, **kwargs):
        before = _collecting_ids(store)
        try:
            result = original(*args, **kwargs)
            ids = _extract_snapshot_ids(result)
            if not ids:
                ids = _collecting_ids(store) - before
            for sid in sorted(ids):
                store.finalize_snapshot(sid)
            return result
        except BaseException as exc:
            for sid in sorted(_collecting_ids(store) - before):
                try:
                    store.fail_snapshot(sid, f"{type(exc).__name__}: {exc}")
                except Exception:
                    pass
            raise

    wrapped._hardening_wrapped = True
    wrapped.__name__ = getattr(original, "__name__", name)
    wrapped.__doc__ = getattr(original, "__doc__", None)
    setattr(agent_module, name, wrapped)


def _guard_canonical_export(canonical_module, store) -> None:
    original = getattr(canonical_module, "export_revision", None)
    if not callable(original) or getattr(original, "_hardening_wrapped", False):
        return

    def export_revision(store_arg, sid, line, insight_builder=None):
        status = store.snapshot_status(int(sid))
        if not status or status.get("status") != "complete":
            raise ValueError("Snapshot incompleto não pode ser publicado/normalizado")
        return original(store_arg, sid, line, insight_builder)

    export_revision._hardening_wrapped = True
    canonical_module.export_revision = export_revision


def install(agent_module, canonical_module) -> Dict[str, Any]:
    # Strictly re-read the file because agent.load_config historically swallowed
    # JSON errors and could silently fall back to defaults.
    strict_load_config(agent_module.CONFIG_PATH)
    migration = install_store_guards(agent_module.STORE)

    def write_config(config):
        atomic_write_json(agent_module.CONFIG_PATH, config)

    agent_module.write_config = write_config
    for name in ("ingest_integrated", "ingest_3028_path", "ingest_3028_live"):
        _wrap_snapshot_operation(agent_module, name)
    _guard_canonical_export(canonical_module, agent_module.STORE)
    return migration


def health(store) -> Dict[str, Any]:
    with store.connect() as con:
        version = con.execute(
            "SELECT value FROM schema_meta WHERE key='hardening_schema_version'"
        ).fetchone()
        collecting = int(
            con.execute("SELECT COUNT(*) FROM snapshots WHERE status='collecting'").fetchone()[0]
        )
        errors = int(
            con.execute("SELECT COUNT(*) FROM snapshots WHERE status='error'").fetchone()[0]
        )
        latest_complete = con.execute(
            "SELECT MAX(id) FROM snapshots WHERE status='complete'"
        ).fetchone()[0]
    return {
        "schema_version": int(version[0]) if version else 0,
        "integrity": _quick_check(store),
        "collecting_snapshots": collecting,
        "error_snapshots": errors,
        "latest_complete_snapshot_id": int(latest_complete) if latest_complete is not None else None,
        "config_write": "atomic",
    }
