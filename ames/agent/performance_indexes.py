"""Safe SQLite indexes for the active Central + A-MES read paths.

This module does not change MES collection, row contents, snapshot identity or
export semantics. It only adds idempotent indexes used by the existing local
queries. Existing databases are upgraded automatically with CREATE INDEX IF NOT
EXISTS and remain fully readable by older code.
"""
from __future__ import annotations

from typing import Any, Dict

INDEXES = {
    "idx_defect_obs_snapshot_line_pcba": "defect_observations(snapshot_id,line,pcba_sn,defect_time)",
    "idx_pcba_history_snapshot_pcba": "pcba_history(snapshot_id,pcba_sn,hist_seq)",
    "idx_history_context_snapshot_line": "history_contexts(snapshot_id,line,current_pcba,historical_pcba)",
    "idx_material_reuse_snapshot_pcba": "material_reuse(snapshot_id,current_pcba_sn,item_sn)",
    "idx_process_events_snapshot_pcba_time": "process_events(snapshot_id,pcba_sn,event_time)",
    "idx_repair_refreshes_snapshot_pcba": "repair_refreshes(snapshot_id,pcba_sn,refreshed_at)",
    "idx_audit_snapshot_created": "audit_events(snapshot_id,created_at)",
    "idx_mes_timeline_snapshot_line_time": "mes_process_timeline(snapshot_id,line_id,event_time,pcba_sn)",
}


def install(store) -> Dict[str, Any]:
    """Install only additive indexes and return a small auditable state."""
    with store.connect() as con:
        tables = {
            row[0]
            for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        installed = []
        skipped = []
        for name, expression in INDEXES.items():
            table = expression.split("(", 1)[0]
            if table not in tables:
                skipped.append(name)
                continue
            con.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {expression}")
            installed.append(name)
    return {"ok": True, "installed": installed, "skipped": skipped, "count": len(installed)}


def health(store) -> Dict[str, Any]:
    """Report index presence without exposing database paths or user data."""
    with store.connect() as con:
        present = {
            row[0]
            for row in con.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()
        }
    missing = [name for name in INDEXES if name not in present]
    return {
        "ok": not missing,
        "expected": len(INDEXES),
        "present": len(INDEXES) - len(missing),
        "missing": missing,
    }
