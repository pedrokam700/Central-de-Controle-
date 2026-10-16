"""Offline Base/AT extensions over the existing canonical SQLite.

This module deliberately does not create a second database or collector.  It only
exposes tables/evidence that already exist in the workstation SQLite and enriches
the existing local SN lookup with provenance/coverage metadata.
"""
from __future__ import annotations

import json
import types
from typing import Any, Dict, Iterable, List


def _table_exists(store, table: str) -> bool:
    with store.connect() as con:
        return con.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone() is not None


def _placeholders(values: Iterable[Any]) -> str:
    return ",".join("?" for _ in values)


def _latest_snapshot_ids(store, lines: Iterable[str] | None = None) -> List[int]:
    mapping = store.latest_snapshot_ids_by_line(lines or [])
    return sorted({int(v) for v in mapping.values() if v})


def _snapshot_filter_sql(line: str | None) -> tuple[str, list[Any]]:
    if not line:
        return "", []
    return (
        " AND (EXISTS(SELECT 1 FROM defect_observations d WHERE d.snapshot_id=s.id AND d.line=?)"
        " OR EXISTS(SELECT 1 FROM line_metrics m WHERE m.snapshot_id=s.id AND m.line=?))",
        [line, line],
    )


def _global_rows(store, dataset: str, *, line: str | None = None, limit: int = 5000) -> List[Dict[str, Any]]:
    limit = max(1, min(int(limit or 5000), 100000))
    with store.connect() as con:
        if dataset == "repair_history_3012":
            sql = "SELECT * FROM repair_history_3012 WHERE 1=1"
            params: List[Any] = []
            if line:
                sql += " AND line=?"; params.append(line)
            sql += " ORDER BY COALESCE(defect_time,repair_time,last_seen_at) DESC LIMIT ?"; params.append(limit)
            return [dict(r) for r in con.execute(sql, params).fetchall()]
        if dataset == "repair_coverage_3012":
            sql = "SELECT c.* FROM repair_coverage_3012 c WHERE 1=1"
            params = []
            if line:
                sql += " AND EXISTS(SELECT 1 FROM repair_history_3012 h WHERE (h.pcba_sn=c.sn OR h.imei=c.sn) AND h.line=?)"
                params.append(line)
            sql += " ORDER BY c.completed_at DESC,c.sn,c.start_at LIMIT ?"; params.append(limit)
            return [dict(r) for r in con.execute(sql, params).fetchall()]
        if dataset == "snapshots":
            extra, params = _snapshot_filter_sql(line)
            sql = (
                "SELECT s.id AS snapshot_id,s.collected_at,s.source_kind,s.source_name,s.status,s.notes,"
                "w.mode,w.start_at,w.end_at,w.shift,w.requested_lines_json "
                "FROM snapshots s LEFT JOIN analysis_windows w ON w.id=s.window_id WHERE 1=1" + extra +
                " ORDER BY s.id DESC LIMIT ?"
            )
            params.append(limit)
            return [dict(r) for r in con.execute(sql, params).fetchall()]
    return []


def _count_global(store, dataset: str, *, lines: Iterable[str] | None = None) -> int:
    requested = [str(x).strip() for x in (lines or []) if str(x).strip()]
    with store.connect() as con:
        if dataset == "repair_history_3012":
            if requested:
                ph = _placeholders(requested)
                return int(con.execute(f"SELECT COUNT(*) n FROM repair_history_3012 WHERE line IN ({ph})", requested).fetchone()["n"])
            return int(con.execute("SELECT COUNT(*) n FROM repair_history_3012").fetchone()["n"])
        if dataset == "repair_coverage_3012":
            if requested:
                ph = _placeholders(requested)
                return int(con.execute(
                    f"SELECT COUNT(*) n FROM repair_coverage_3012 c WHERE EXISTS(SELECT 1 FROM repair_history_3012 h WHERE (h.pcba_sn=c.sn OR h.imei=c.sn) AND h.line IN ({ph}))",
                    requested,
                ).fetchone()["n"])
            return int(con.execute("SELECT COUNT(*) n FROM repair_coverage_3012").fetchone()["n"])
        if dataset == "snapshots":
            if not requested:
                return int(con.execute("SELECT COUNT(*) n FROM snapshots").fetchone()["n"])
            ph = _placeholders(requested)
            sql = (
                f"SELECT COUNT(*) n FROM snapshots s WHERE "
                f"EXISTS(SELECT 1 FROM defect_observations d WHERE d.snapshot_id=s.id AND d.line IN ({ph})) "
                f"OR EXISTS(SELECT 1 FROM line_metrics m WHERE m.snapshot_id=s.id AND m.line IN ({ph}))"
            )
            return int(con.execute(sql, [*requested, *requested]).fetchone()["n"])
    return 0


def _count_snapshot_table(store, table: str, snapshot_ids: Iterable[int], line_column: str | None = None, lines: Iterable[str] | None = None) -> int:
    ids = [int(x) for x in snapshot_ids if x]
    if not ids or not _table_exists(store, table):
        return 0
    requested = [str(x).strip() for x in (lines or []) if str(x).strip()]
    with store.connect() as con:
        sql = f"SELECT COUNT(*) n FROM {table} WHERE snapshot_id IN ({_placeholders(ids)})"
        params: List[Any] = list(ids)
        if line_column and requested:
            sql += f" AND {line_column} IN ({_placeholders(requested)})"
            params.extend(requested)
        return int(con.execute(sql, params).fetchone()["n"])


def _catalog_extensions(store, *, snapshot_id: int | None = None, lines: Iterable[str] | None = None) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    ids = [int(snapshot_id)] if snapshot_id else _latest_snapshot_ids(store, lines)
    if _table_exists(store, "mes_process_timeline"):
        count = _count_snapshot_table(store, "mes_process_timeline", ids, "line_id", lines)
        out.append({"dataset":"process_timeline","label":"Timeline canônica 3022","rows":count,"scope":"snapshot"})
    if _table_exists(store, "process_defect_contexts"):
        count = _count_snapshot_table(store, "process_defect_contexts", ids, "line", lines)
        out.append({"dataset":"process_defect_contexts","label":"Contextos por falha / 3022","rows":count,"scope":"snapshot"})
    if _table_exists(store, "repair_history_3012"):
        out.append({"dataset":"repair_history_3012","label":"Histórico de reparos 3012","rows":_count_global(store,"repair_history_3012",lines=lines),"scope":"local_history"})
    if _table_exists(store, "repair_coverage_3012"):
        out.append({"dataset":"repair_coverage_3012","label":"Cobertura por SN / 3012","rows":_count_global(store,"repair_coverage_3012",lines=lines),"scope":"local_history"})
    if _table_exists(store, "snapshots"):
        out.append({"dataset":"snapshots","label":"Snapshots locais / coletas","rows":_count_global(store,"snapshots",lines=lines),"scope":"local_history"})
    return out


def _dedupe_catalog(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    positions: Dict[str, int] = {}
    for row in rows or []:
        key = str((row or {}).get("dataset") or "").strip()
        if not key:
            continue
        item = dict(row)
        if key in positions:
            out[positions[key]] = {**out[positions[key]], **item}
        else:
            positions[key] = len(out); out.append(item)
    return out


def _enhanced_search(store, query: str, line: str | None = None, limit: int = 20) -> List[Dict[str, Any]]:
    words = [w.lower() for w in str(query or "").strip().split() if w]
    if not words:
        return []
    safe_limit = max(1, min(int(limit or 20), 100))
    params: List[Any] = []
    clauses = []
    for word in words:
        like = f"%{word}%"
        clauses.append("(LOWER(title) LIKE ? OR LOWER(body) LIKE ? OR LOWER(metadata_json) LIKE ?)")
        params.extend([like, like, like])
    sql = "SELECT * FROM cora_documents WHERE " + " AND ".join(clauses)
    if line:
        sql += " AND line=?"; params.append(line)
    sql += " ORDER BY updated_at DESC LIMIT ?"; params.append(safe_limit)
    with store.connect() as con:
        rows = [dict(r) for r in con.execute(sql, params).fetchall()]
        remaining = safe_limit - len(rows)
        if remaining > 0 and _table_exists(store, "repair_history_3012"):
            terms = [] ; p2: List[Any] = []
            searchable = "LOWER(COALESCE(pcba_sn,'')||' '||COALESCE(imei,'')||' '||COALESCE(product_model,'')||' '||COALESCE(defect_code,'')||' '||COALESCE(defect_desc,'')||' '||COALESCE(repair_code,'')||' '||COALESCE(repair_desc,'')||' '||COALESCE(repair_comment,'')||' '||COALESCE(repair_user,''))"
            for word in words:
                terms.append(searchable + " LIKE ?"); p2.append(f"%{word}%")
            q2 = "SELECT * FROM repair_history_3012 WHERE " + " AND ".join(terms)
            if line:
                q2 += " AND line=?"; p2.append(line)
            q2 += " ORDER BY COALESCE(defect_time,repair_time,last_seen_at) DESC LIMIT ?"; p2.append(remaining)
            for r in con.execute(q2, p2).fetchall():
                item = dict(r)
                rows.append({
                    "doc_id": "repair3012:" + str(item.get("row_key") or ""),
                    "snapshot_id": None,
                    "line": item.get("line"),
                    "pcba_sn": item.get("pcba_sn"),
                    "kind": "repair_3012",
                    "title": "3012 · " + " · ".join(str(x) for x in [item.get("pcba_sn"), item.get("defect_code"), item.get("product_model")] if x),
                    "body": " | ".join(str(x) for x in [item.get("defect_desc"), item.get("repair_code"), item.get("repair_desc"), item.get("repair_comment"), item.get("repair_user")] if x),
                    "metadata_json": json.dumps({"source":"3012","repair_time":item.get("repair_time"),"defect_time":item.get("defect_time")}, ensure_ascii=False),
                    "updated_at": item.get("last_seen_at"),
                })
    return rows[:safe_limit]


def _time_range(rows: Iterable[Dict[str, Any]], fields: Iterable[str]) -> tuple[str | None, str | None]:
    values = []
    for row in rows or []:
        for field in fields:
            value = str((row or {}).get(field) or "").strip()
            if value:
                values.append(value); break
    return (min(values), max(values)) if values else (None, None)


def _snapshot_updates(store, rows: Iterable[Dict[str, Any]]) -> List[str]:
    ids = sorted({int(r.get("snapshot_id")) for r in rows or [] if str(r.get("snapshot_id") or "").isdigit()})
    if not ids:
        return []
    with store.connect() as con:
        return [str(r["collected_at"]) for r in con.execute(
            f"SELECT collected_at FROM snapshots WHERE id IN ({_placeholders(ids)}) ORDER BY collected_at", ids
        ).fetchall() if r["collected_at"]]


def _source_meta(store, rows: List[Dict[str, Any]], event_fields: Iterable[str], *, extra_update_fields: Iterable[str] = ()) -> Dict[str, Any]:
    first_event, last_event = _time_range(rows, event_fields)
    updates = _snapshot_updates(store, rows)
    for row in rows or []:
        for field in extra_update_fields:
            value = str((row or {}).get(field) or "").strip()
            if value:
                updates.append(value)
    return {
        "state": "cached" if rows else "not_collected",
        "count": len(rows),
        "first_event": first_event,
        "last_event": last_event,
        "last_update": max(updates) if updates else None,
        "origin": "LOCAL_SQLITE",
    }


def _enrich_local_lookup(store, result: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(result or {})
    defects = list(out.get("defects") or [])
    history = list(out.get("pcba_history") or [])
    materials = list(out.get("material_reuse") or [])
    process = list(out.get("process_events") or [])
    repairs = list(out.get("repair_3012") or [])
    meta = {
        "3028": _source_meta(store, defects, ("defect_time",)),
        "3074": _source_meta(store, materials, ("bind_time_utc","unbind_time_utc")),
        "2114": _source_meta(store, history, ("defect_time","Defect Time")),
        "3022": _source_meta(store, process, ("event_time",)),
        "3012": _source_meta(store, repairs, ("defect_time","repair_time"), extra_update_fields=("last_seen_at",)),
    }
    targets = [str(x).strip() for x in (out.get("targets") or []) if str(x).strip()]
    coverage_3012: Dict[str, Any] = {}
    if _table_exists(store, "repair_coverage_3012"):
        with store.connect() as con:
            for sn in targets:
                rows = [dict(r) for r in con.execute(
                    "SELECT sn,start_at,end_at,source,completed_at FROM repair_coverage_3012 WHERE sn=? ORDER BY start_at,end_at", (sn,)
                ).fetchall()]
                if rows:
                    coverage_3012[sn] = rows
    with store.connect() as con:
        db = con.execute("SELECT COUNT(*) n,MIN(collected_at) first_collected,MAX(collected_at) last_collected,MAX(id) latest_snapshot_id FROM snapshots").fetchone()
    out["coverage_meta"] = meta
    out["coverage_3012"] = coverage_3012
    out["database_meta"] = {
        "origin": "LOCAL_SQLITE",
        "snapshots": int(db["n"] if db else 0),
        "first_collected": db["first_collected"] if db else None,
        "last_collected": db["last_collected"] if db else None,
        "latest_snapshot_id": db["latest_snapshot_id"] if db else None,
        "current_state_proven": False,
        "note": "Histórico/cache local; ausência nesta base não prova ausência no A-MES atual.",
    }
    return out


def install(entry_module) -> None:
    """Patch only read models on the final canonical workstation runtime."""
    store = entry_module.a.STORE
    if getattr(store, "_offline_catalog_installed", False):
        return

    original_dataset_catalog = store.dataset_catalog
    original_team_catalog = store.team_dataset_catalog
    original_dataset_rows = store.dataset_rows
    original_team_rows = store.team_dataset_rows

    def dataset_catalog(self, snapshot_id=None):
        base = list(original_dataset_catalog(snapshot_id))
        return _dedupe_catalog([*base, *_catalog_extensions(self, snapshot_id=int(snapshot_id) if snapshot_id else None)])

    def team_dataset_catalog(self, lines=None):
        base = list(original_team_catalog(lines))
        return _dedupe_catalog([*base, *_catalog_extensions(self, lines=lines or [])])

    def dataset_rows(self, dataset, snapshot_id=None, line=None, limit=5000):
        name = str(dataset or "defects")
        if name in {"repair_history_3012","repair_coverage_3012","snapshots"}:
            return _global_rows(self, name, line=line, limit=limit)
        return original_dataset_rows(name, snapshot_id=snapshot_id, line=line, limit=limit)

    def team_dataset_rows(self, dataset, lines=None, line=None, limit=5000):
        name = str(dataset or "defects")
        if name in {"repair_history_3012","repair_coverage_3012","snapshots"}:
            if line:
                return _global_rows(self, name, line=line, limit=limit)
            requested = [str(x).strip() for x in (lines or []) if str(x).strip()]
            if name == "repair_history_3012" and requested:
                with self.connect() as con:
                    ph = _placeholders(requested)
                    return [dict(r) for r in con.execute(
                        f"SELECT * FROM repair_history_3012 WHERE line IN ({ph}) ORDER BY COALESCE(defect_time,repair_time,last_seen_at) DESC LIMIT ?",
                        [*requested, max(1,min(int(limit or 5000),100000))],
                    ).fetchall()]
            return _global_rows(self, name, limit=limit)
        return original_team_rows(name, lines=lines, line=line, limit=limit)

    store.dataset_catalog = types.MethodType(dataset_catalog, store)
    store.team_dataset_catalog = types.MethodType(team_dataset_catalog, store)
    store.dataset_rows = types.MethodType(dataset_rows, store)
    store.team_dataset_rows = types.MethodType(team_dataset_rows, store)
    store.search_cora = types.MethodType(lambda self, query, line=None, limit=20: _enhanced_search(self, query, line=line, limit=limit), store)
    store._offline_catalog_installed = True

    # Enrich the existing /local/sn contract in-place so all current auth/routes/UI
    # keep working.  No second endpoint or cache is introduced.
    import local_sn
    if not getattr(local_sn, "_offline_metadata_installed", False):
        original_lookup = local_sn.lookup
        def lookup_with_metadata(store_obj, sn, *, limit=5000):
            return _enrich_local_lookup(store_obj, original_lookup(store_obj, sn, limit=limit))
        local_sn.lookup = lookup_with_metadata
        local_sn._offline_metadata_installed = True
