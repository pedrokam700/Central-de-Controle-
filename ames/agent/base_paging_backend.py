"""Read-only offset paging for the technical Base local view.

This module does not change collection semantics or the canonical snapshot API.
It only provides a bounded page over the existing SQLite datasets. Datasets that
need the legacy contextual projection keep using Store.dataset_rows so line
attribution rules remain untouched; only the transport is paged afterwards.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

MAX_LIMIT = 500
MAX_OFFSET = 100000
DIRECT_DATASETS = {
    "defects",
    "line_metrics",
    "history_contexts",
    "process_defect_contexts",
}


def normalize_limit(value: Any, default: int = 100) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, MAX_LIMIT))


def normalize_offset(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = 0
    return max(0, min(parsed, MAX_OFFSET))


def _table_exists(store, table: str) -> bool:
    with store.connect() as con:
        return con.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone() is not None


def _direct_rows(store, dataset: str, snapshot_id: int, line: Optional[str], limit: int, offset: int) -> Optional[List[Dict[str, Any]]]:
    if dataset == "process_defect_contexts" and not _table_exists(store, "process_defect_contexts"):
        return []
    with store.connect() as con:
        if dataset == "defects":
            sql = "SELECT * FROM defect_observations WHERE snapshot_id=?"
            params: List[Any] = [snapshot_id]
            if line:
                sql += " AND line=?"; params.append(line)
            sql += " ORDER BY line,defect_time,pcba_sn LIMIT ? OFFSET ?"
        elif dataset == "line_metrics":
            sql = "SELECT * FROM line_metrics WHERE snapshot_id=?"
            params = [snapshot_id]
            if line:
                sql += " AND line=?"; params.append(line)
            sql += " ORDER BY line,product_model LIMIT ? OFFSET ?"
        elif dataset == "history_contexts":
            sql = "SELECT * FROM history_contexts WHERE snapshot_id=?"
            params = [snapshot_id]
            if line:
                sql += " AND line=?"; params.append(line)
            sql += " ORDER BY line,current_pcba,historical_pcba LIMIT ? OFFSET ?"
        elif dataset == "process_defect_contexts":
            sql = "SELECT * FROM process_defect_contexts WHERE snapshot_id=?"
            params = [snapshot_id]
            if line:
                sql += " AND line=?"; params.append(line)
            sql += " ORDER BY line,defect_time,pcba_sn LIMIT ? OFFSET ?"
        else:
            return None
        params.extend([limit, offset])
        return [dict(row) for row in con.execute(sql, params).fetchall()]


def _fallback_rows(store, dataset: str, snapshot_id: int, line: Optional[str], limit: int, offset: int) -> List[Dict[str, Any]]:
    # Preserve all existing contextual semantics. The old projection has no
    # offset contract, so ask only for the required prefix and slice locally.
    prefix = min(MAX_OFFSET + MAX_LIMIT, offset + limit)
    rows = store.dataset_rows(dataset, snapshot_id=snapshot_id, line=line, limit=prefix)
    return list(rows[offset:offset + limit])


def snapshot_page(store, dataset: str, snapshot_id: int, *, line: Optional[str] = None,
                  limit: Any = 100, offset: Any = 0) -> Dict[str, Any]:
    dataset = str(dataset or "defects")
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    sid = int(snapshot_id)
    rows = _direct_rows(store, dataset, sid, line, safe_limit, safe_offset)
    if rows is None:
        rows = _fallback_rows(store, dataset, sid, line, safe_limit, safe_offset)
    return {
        "dataset": dataset,
        "snapshot_id": sid,
        "line": line,
        "rows": rows,
        "limit": safe_limit,
        "offset": safe_offset,
        "returned": len(rows),
    }


def team_page(store, dataset: str, *, lines: Iterable[str] | None = None, line: Optional[str] = None,
              limit: Any = 100, offset: Any = 0) -> Dict[str, Any]:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    if line:
        sid = store.latest_snapshot_id_for_line(line)
        if not sid:
            return {"dataset": str(dataset or "defects"), "snapshot_id": None, "line": line, "rows": [], "limit": safe_limit, "offset": safe_offset, "returned": 0}
        return snapshot_page(store, dataset, sid, line=line, limit=safe_limit, offset=safe_offset)

    # Multi-line technical reads keep the legacy team aggregation semantics.
    prefix = min(MAX_OFFSET + MAX_LIMIT, safe_offset + safe_limit)
    rows = store.team_dataset_rows(dataset, lines=lines or [], line=None, limit=prefix)
    page_rows = list(rows[safe_offset:safe_offset + safe_limit])
    return {
        "dataset": str(dataset or "defects"),
        "snapshot_id": None,
        "line": None,
        "rows": page_rows,
        "limit": safe_limit,
        "offset": safe_offset,
        "returned": len(page_rows),
    }


def page(store, dataset: str, *, snapshot_id: Any = None, line: Optional[str] = None,
         configured_lines: Iterable[str] | None = None, limit: Any = 100, offset: Any = 0) -> Dict[str, Any]:
    if snapshot_id not in (None, ""):
        return snapshot_page(store, dataset, int(snapshot_id), line=line, limit=limit, offset=offset)
    return team_page(store, dataset, lines=configured_lines, line=line, limit=limit, offset=offset)
