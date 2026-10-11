"""Local disaster-recovery verification for the Central/A-MES workstation.

This module never restores over the live database.  It verifies backup files in
read-only mode and can perform an explicit restore drill by copying a backup to a
temporary location and opening that copy.  External/off-machine backup remains a
separate deployment policy because its destination and authorization are site
specific.
"""
from __future__ import annotations

import hashlib
import shutil
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REQUIRED_TABLES = frozenset({"schema_meta", "snapshots", "jobs"})


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _open_readonly(path: Path):
    # URI mode=ro prevents a verification step from creating/mutating the file.
    return sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True, timeout=30)


def verify_backup(path: str | Path, *, include_sha256: bool = False) -> dict[str, Any]:
    candidate = Path(path)
    if not candidate.is_file():
        raise RuntimeError("Backup SQLite não encontrado")
    size = int(candidate.stat().st_size)
    if size <= 0:
        raise RuntimeError("Backup SQLite vazio")
    with _open_readonly(candidate) as con:
        row = con.execute("PRAGMA quick_check").fetchone()
        integrity = str(row[0] if row else "")
        if integrity.lower() != "ok":
            raise RuntimeError(f"Backup SQLite falhou no quick_check: {integrity or 'unknown'}")
        tables = {
            str(r[0])
            for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        missing = sorted(REQUIRED_TABLES - tables)
        if missing:
            raise RuntimeError("Backup SQLite incompleto; tabelas ausentes: " + ", ".join(missing))
        schema_row = con.execute(
            "SELECT value FROM schema_meta WHERE key='hardening_schema_version'"
        ).fetchone()
        schema_version = int(schema_row[0]) if schema_row and str(schema_row[0]).isdigit() else 0
        snapshot_count = int(con.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0])
    result: dict[str, Any] = {
        "schema": "central-backup-verification-v1",
        "verified_at": _utc_now(),
        "integrity": "ok",
        "bytes": size,
        "schema_version": schema_version,
        "snapshot_count": snapshot_count,
    }
    if include_sha256:
        digest = hashlib.sha256()
        with candidate.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        result["sha256"] = digest.hexdigest()
    return result


def restore_drill(path: str | Path) -> dict[str, Any]:
    """Prove that a backup can be materialized and opened without touching live DB."""
    source = Path(path)
    source_check = verify_backup(source, include_sha256=True)
    with tempfile.TemporaryDirectory(prefix="central-restore-drill-") as td:
        restored = Path(td) / "restored.sqlite3"
        shutil.copy2(source, restored)
        restored_check = verify_backup(restored, include_sha256=True)
        if restored_check["sha256"] != source_check["sha256"]:
            raise RuntimeError("Restore drill alterou os bytes do backup")
        if restored_check["snapshot_count"] != source_check["snapshot_count"]:
            raise RuntimeError("Restore drill divergiu na contagem de snapshots")
        if restored_check["schema_version"] != source_check["schema_version"]:
            raise RuntimeError("Restore drill divergiu na versão do schema")
    return {
        "schema": "central-restore-drill-v1",
        "verified_at": _utc_now(),
        "integrity": "ok",
        "bytes": source_check["bytes"],
        "sha256": source_check["sha256"],
        "schema_version": source_check["schema_version"],
        "snapshot_count": source_check["snapshot_count"],
        "live_database_modified": False,
    }


def latest_backup_path(store, backup_dir: str | Path) -> Path | None:
    info = store.latest_backup_info(backup_dir)
    if not isinstance(info, dict) or not info.get("path"):
        return None
    path = Path(str(info["path"]))
    return path if path.is_file() else None


def latest_status(store, backup_dir: str | Path) -> dict[str, Any]:
    path = latest_backup_path(store, backup_dir)
    if path is None:
        return {"schema": "central-backup-status-v1", "available": False, "verified": False}
    try:
        verification = verify_backup(path)
        return {
            "schema": "central-backup-status-v1",
            "available": True,
            "verified": True,
            "integrity": verification["integrity"],
            "bytes": verification["bytes"],
            "schema_version": verification["schema_version"],
            "snapshot_count": verification["snapshot_count"],
            "verified_at": verification["verified_at"],
        }
    except Exception as exc:
        return {
            "schema": "central-backup-status-v1",
            "available": True,
            "verified": False,
            "error": type(exc).__name__,
        }
