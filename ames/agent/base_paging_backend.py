"""Read-only offset paging for the technical Base local view.

This module does not change collection semantics or the canonical snapshot API.
It only provides a bounded page over the existing SQLite datasets. Datasets that
need the legacy contextual projection keep using Store.dataset_rows so line
attribution rules remain untouched; only the transport is paged afterwards.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

MAX_LIMIT = 500
MAX_OFFSET = 100000
MAX_CONTEXT_PREFIX = 100000
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


def _direct_page(store, dataset: str, snapshot_id: int, line: Optional[str], limit: int, offset: int) -> Optional[Tuple[List[Dict[str, Any]], int]]:
    if dataset == "process_defect_contexts" and not _table_exists(store, "process_defect_contexts"):
        return [], 0
    with store.connect() as con:
        if dataset == "defects":
            base = " FROM defect_observations WHERE snapshot_id=?"
            params: List[Any] = [snapshot_id]
            if line:
                base += " AND line=?"; params.append(line)
            order = " ORDER BY line,defect_time,pcba_sn"
        elif dataset == "line_metrics":
            base = " FROM line_metrics WHERE snapshot_id=?"
            params = [snapshot_id]
            if line:
                base += " AND line=?"; params.append(line)
            order = " ORDER BY line,product_model"
        elif dataset == "history_contexts":
            base = " FROM history_contexts WHERE snapshot_id=?"
            params = [snapshot_id]
            if line:
                base += " AND line=?"; params.append(line)
            order = " ORDER BY line,current_pcba,historical_pcba"
        elif dataset == "process_defect_contexts":
            base = " FROM process_defect_contexts WHERE snapshot_id=?"
            params = [snapshot_id]
            if line:
                base += " AND line=?"; params.append(line)
            order = " ORDER BY line,defect_time,pcba_sn"
        else:
            return None
        total = int(con.execute("SELECT COUNT(*) n" + base, params).fetchone()["n"])
        rows = [dict(row) for row in con.execute(
            "SELECT *" + base + order + " LIMIT ? OFFSET ?",
            [*params, limit, offset],
        ).fetchall()]
        return rows, total


def _fallback_page(store, dataset: str, snapshot_id: int, line: Optional[str], limit: int, offset: int) -> Tuple[List[Dict[str, Any]], Optional[int], bool]:
    # Preserve all existing contextual semantics. The old projection has no
    # offset contract, so ask only for the prefix necessary to determine this
    # page plus one row. No contextual row is re-derived here.
    wanted = offset + limit + 1
    prefix = min(MAX_CONTEXT_PREFIX, wanted)
    rows = store.dataset_rows(dataset, snapshot_id=snapshot_id, line=line, limit=prefix)
    page_rows = list(rows[offset:offset + limit])
    has_more = len(rows) > offset + limit
    if wanted > MAX_CONTEXT_PREFIX and offset + limit >= MAX_CONTEXT_PREFIX:
        has_more = False
    total = None if has_more else min(MAX_CONTEXT_PREFIX, offset + len(page_rows))
    return page_rows, total, has_more


def snapshot_page(store, dataset: str, snapshot_id: int, *, line: Optional[str] = None,
                  limit: Any = 100, offset: Any = 0) -> Dict[str, Any]:
    dataset = str(dataset or "defects")
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    sid = int(snapshot_id)
    direct = _direct_page(store, dataset, sid, line, safe_limit, safe_offset)
    if direct is not None:
        rows, total = direct
        has_more = safe_offset + len(rows) < total
    else:
        rows, total, has_more = _fallback_page(store, dataset, sid, line, safe_limit, safe_offset)
    return {
        "dataset": dataset,
        "snapshot_id": sid,
        "line": line,
        "rows": rows,
        "limit": safe_limit,
        "offset": safe_offset,
        "returned": len(rows),
        "total": total,
        "has_more": bool(has_more),
    }


def team_page(store, dataset: str, *, lines: Iterable[str] | None = None, line: Optional[str] = None,
              limit: Any = 100, offset: Any = 0) -> Dict[str, Any]:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    if line:
        sid = store.latest_snapshot_id_for_line(line)
        if not sid:
            return {"dataset": str(dataset or "defects"), "snapshot_id": None, "line": line, "rows": [], "limit": safe_limit, "offset": safe_offset, "returned": 0, "total": 0, "has_more": False}
        return snapshot_page(store, dataset, sid, line=line, limit=safe_limit, offset=safe_offset)

    # Multi-line technical reads keep the legacy team aggregation semantics.
    wanted = safe_offset + safe_limit + 1
    prefix = min(MAX_CONTEXT_PREFIX, wanted)
    rows = store.team_dataset_rows(dataset, lines=lines or [], line=None, limit=prefix)
    page_rows = list(rows[safe_offset:safe_offset + safe_limit])
    has_more = len(rows) > safe_offset + safe_limit
    if wanted > MAX_CONTEXT_PREFIX and safe_offset + safe_limit >= MAX_CONTEXT_PREFIX:
        has_more = False
    total = None if has_more else min(MAX_CONTEXT_PREFIX, safe_offset + len(page_rows))
    return {
        "dataset": str(dataset or "defects"),
        "snapshot_id": None,
        "line": None,
        "rows": page_rows,
        "limit": safe_limit,
        "offset": safe_offset,
        "returned": len(page_rows),
        "total": total,
        "has_more": bool(has_more),
    }


def page(store, dataset: str, *, snapshot_id: Any = None, line: Optional[str] = None,
         configured_lines: Iterable[str] | None = None, limit: Any = 100, offset: Any = 0) -> Dict[str, Any]:
    if snapshot_id not in (None, ""):
        return snapshot_page(store, dataset, int(snapshot_id), line=line, limit=limit, offset=offset)
    return team_page(store, dataset, lines=configured_lines, line=line, limit=limit, offset=offset)
