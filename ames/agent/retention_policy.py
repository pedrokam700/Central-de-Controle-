"""Retention governance for Central/A-MES evidence.

Phase 1 is deliberately observe-only.  It classifies local datasets, inventories
volume/age and records the existing backup-count policy, but it contains no delete
operation. Evidence retention periods must be approved before destructive cleanup
is ever introduced.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = "central-retention-policy-v1"
MODE = "observe_only"

DATASETS = (
    {"table": "snapshots", "class": "structured_evidence", "time": "collected_at", "policy": "preserve_until_approved"},
    {"table": "line_metrics", "class": "structured_evidence", "time": None, "policy": "preserve_until_approved"},
    {"table": "defect_entities", "class": "structured_evidence", "time": "last_seen_at", "policy": "preserve_until_approved"},
    {"table": "defect_observations", "class": "structured_evidence", "time": "defect_time", "policy": "preserve_until_approved"},
    {"table": "pcba_history", "class": "structured_evidence", "time": None, "policy": "preserve_until_approved"},
    {"table": "history_contexts", "class": "structured_evidence", "time": "defect_time", "policy": "preserve_until_approved"},
    {"table": "material_reuse", "class": "structured_evidence", "time": "bind_time_utc", "policy": "preserve_until_approved"},
    {"table": "process_events", "class": "structured_evidence", "time": "event_time", "policy": "preserve_until_approved"},
    {"table": "snapshot_payloads", "class": "raw_evidence", "time": "created_at", "policy": "preserve_until_approved"},
    {"table": "cora_documents", "class": "derived_local_knowledge", "time": "updated_at", "policy": "preserve_until_approved"},
    {"table": "repair_refreshes", "class": "technical_history", "time": "refreshed_at", "policy": "review_period_required"},
    {"table": "jobs", "class": "technical_history", "time": "created_at", "policy": "review_period_required"},
    {"table": "audit_events", "class": "audit_history", "time": "created_at", "policy": "preserve_until_approved"},
    {"table": "artifacts", "class": "local_artifact_index", "time": "created_at", "policy": "review_period_required"},
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _table_names(store) -> set[str]:
    with store.connect() as con:
        rows = con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return {str(row[0]) for row in rows}


def _inventory_table(store, spec: dict) -> dict[str, Any]:
    table = spec["table"]
    time_col = spec.get("time")
    with store.connect() as con:
        count = int(con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
        oldest = newest = None
        if time_col:
            row = con.execute(
                f"SELECT MIN({time_col}),MAX({time_col}) FROM {table} WHERE {time_col} IS NOT NULL AND TRIM(CAST({time_col} AS TEXT))<>''"
            ).fetchone()
            oldest = row[0] if row else None
            newest = row[1] if row else None
    return {
        "table": table,
        "class": spec["class"],
        "policy": spec["policy"],
        "rows": count,
        "oldest": oldest,
        "newest": newest,
        "delete_enabled": False,
    }


def inventory(store, backup_dir: str | Path, *, backup_keep: int) -> dict[str, Any]:
    tables = _table_names(store)
    datasets = []
    missing = []
    for spec in DATASETS:
        if spec["table"] not in tables:
            missing.append(spec["table"])
            continue
        datasets.append(_inventory_table(store, spec))

    backup_path = Path(backup_dir)
    backups = []
    if backup_path.exists():
        for path in sorted(backup_path.glob("ames_local_*.sqlite3"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                backups.append({"bytes": int(path.stat().st_size), "modified_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(timespec="seconds")})
            except OSError:
                continue

    return {
        "schema": SCHEMA,
        "generated_at": _utc_now(),
        "mode": MODE,
        "destructive_cleanup_enabled": False,
        "approval_required_before_delete": True,
        "datasets": datasets,
        "missing_tables": missing,
        "backups": {
            "existing_count": len(backups),
            "total_bytes": sum(item["bytes"] for item in backups),
            "configured_keep_count": max(1, int(backup_keep)),
            "policy": "existing_count_retention_on_new_backup",
        },
    }


def public_contract(*, backup_keep: int) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "mode": MODE,
        "destructive_cleanup_enabled": False,
        "approval_required_before_delete": True,
        "backup_keep_count": max(1, int(backup_keep)),
        "classes": sorted({spec["class"] for spec in DATASETS}),
        "dataset_policies": [
            {"table": spec["table"], "class": spec["class"], "policy": spec["policy"]}
            for spec in DATASETS
        ],
    }
