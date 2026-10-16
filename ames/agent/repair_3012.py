from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Tuple

from store import stable_json, utc_now

TRUSTED_COVERAGE_SOURCE = "AWIP3012_HOME_DIRECT_EXTJS_MAPPED_V2"

TABLE_SQL = r"""
CREATE TABLE IF NOT EXISTS repair_history_3012(
  row_key TEXT PRIMARY KEY,
  product_id TEXT,
  pcba_sn TEXT,
  imei TEXT,
  department TEXT,
  line TEXT,
  product_model TEXT,
  order_id TEXT,
  sample_batch_id TEXT,
  material_id TEXT,
  material_desc TEXT,
  defect_user TEXT,
  defect_time TEXT,
  defect_oper TEXT,
  defect_code TEXT,
  defect_desc TEXT,
  defect_category TEXT,
  defect_return_category TEXT,
  defect_material_id TEXT,
  defect_material_desc TEXT,
  defect_reason_type TEXT,
  defect_reason_desc TEXT,
  reason_desc TEXT,
  defect_location TEXT,
  repaired_location TEXT,
  repaired_count TEXT,
  repair_code TEXT,
  repair_desc TEXT,
  repair_comment TEXT,
  repair_user TEXT,
  repair_time TEXT,
  defect_source TEXT,
  query_meta_json TEXT NOT NULL DEFAULT '{}',
  raw_json TEXT NOT NULL DEFAULT '{}',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_3012_pcba ON repair_history_3012(pcba_sn);
CREATE INDEX IF NOT EXISTS idx_3012_imei ON repair_history_3012(imei);
CREATE INDEX IF NOT EXISTS idx_3012_defect_time ON repair_history_3012(defect_time);
CREATE INDEX IF NOT EXISTS idx_3012_repair_time ON repair_history_3012(repair_time);
CREATE INDEX IF NOT EXISTS idx_3012_repair_user ON repair_history_3012(repair_user);
CREATE INDEX IF NOT EXISTS idx_3012_defect_code ON repair_history_3012(defect_code);

CREATE TABLE IF NOT EXISTS repair_coverage_3012(
  sn TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'AWIP3012_DIRECT_EXTJS',
  completed_at TEXT NOT NULL,
  PRIMARY KEY(sn,start_at,end_at)
);
CREATE INDEX IF NOT EXISTS idx_3012_coverage_sn ON repair_coverage_3012(sn,start_at,end_at);
"""

FIELDS = [
    "product_id","pcba_sn","imei","department","line","product_model","order_id","sample_batch_id","material_id","material_desc",
    "defect_user","defect_time","defect_oper","defect_code","defect_desc","defect_category","defect_return_category",
    "defect_material_id","defect_material_desc","defect_reason_type","defect_reason_desc","reason_desc","defect_location","repaired_location",
    "repaired_count","repair_code","repair_desc","repair_comment","repair_user","repair_time","defect_source",
]


def _parse_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    text = str(value or "").strip().replace("Z", "+00:00")
    if not text:
        return None
    try:
        dt = datetime.fromisoformat(text)
        return dt.replace(tzinfo=None) if dt.tzinfo else dt
    except ValueError:
        try:
            return datetime.strptime(text[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            try:
                return datetime.strptime(text[:10], "%Y-%m-%d")
            except ValueError:
                return None


def _iso(value: datetime) -> str:
    return value.isoformat(timespec="seconds")


def ensure_schema(store) -> None:
    with store.connect() as con:
        con.executescript(TABLE_SQL)
        columns = {r[1] for r in con.execute('PRAGMA table_info(repair_history_3012)')}
        for name in ('product_id','reason_desc'):
            if name not in columns:
                con.execute(f'ALTER TABLE repair_history_3012 ADD COLUMN {name} TEXT')
        from canonical import install_evidence_triggers
        install_evidence_triggers(con)


def record_coverage(store, payload: Dict[str, Any]) -> int:
    """Record only successful exact-SN query windows.

    Broad queries (empty SN) are intentionally not used as cache coverage because
    they may be constrained by line/model/defect filters and must not suppress a
    later exact-SN forensic lookup.
    """
    ensure_schema(store)
    query = dict((payload or {}).get("query") or {})
    sns = list(dict.fromkeys(str(x or "").strip() for x in (query.get("sns") or []) if str(x or "").strip()))
    start = _parse_dt(query.get("start_at"))
    end = _parse_dt(query.get("end_at"))
    if not sns or not start or not end or end < start:
        return 0
    now = utc_now()
    source = str((payload or {}).get("source") or "AWIP3012_DIRECT_EXTJS")
    with store.connect() as con:
        for sn in sns:
            con.execute(
                "INSERT OR REPLACE INTO repair_coverage_3012(sn,start_at,end_at,source,completed_at) VALUES(?,?,?,?,?)",
                (sn, _iso(start), _iso(end), source, now),
            )
    return len(sns)


def coverage(store, sn: str) -> List[Dict[str, Any]]:
    ensure_schema(store)
    sn = str(sn or "").strip()
    if not sn:
        return []
    with store.connect() as con:
        return [dict(r) for r in con.execute(
            "SELECT sn,start_at,end_at,source,completed_at FROM repair_coverage_3012 WHERE sn=? ORDER BY start_at,end_at",
            (sn,),
        ).fetchall()]


def missing_windows(store, sn: str, start_at: datetime, end_at: datetime) -> List[Tuple[datetime, datetime]]:
    """Return uncovered intervals for one exact SN, merging overlapping coverage."""
    if end_at < start_at:
        raise ValueError("Periodo 3012 invalido")
    spans: List[Tuple[datetime, datetime]] = []
    for row in coverage(store, sn):
        # Old 3012 collectors could mark an exact-SN interval complete after a
        # wrongly resolved field/store returned zero rows. Only mapped V2 proof
        # is trusted to suppress a future MES query.
        if str(row.get("source") or "") != TRUSTED_COVERAGE_SOURCE:
            continue
        start = _parse_dt(row.get("start_at")); end = _parse_dt(row.get("end_at"))
        if not start or not end or end < start_at or start > end_at:
            continue
        spans.append((max(start, start_at), min(end, end_at)))
    spans.sort(key=lambda x: x[0])
    merged: List[List[datetime]] = []
    tolerance = timedelta(seconds=1)
    for start, end in spans:
        if not merged or start > merged[-1][1] + tolerance:
            merged.append([start, end])
        elif end > merged[-1][1]:
            merged[-1][1] = end

    gaps: List[Tuple[datetime, datetime]] = []
    cursor = start_at
    for start, end in merged:
        if start > cursor:
            gap_end = min(end_at, start - tolerance)
            if gap_end >= cursor:
                gaps.append((cursor, gap_end))
        cursor = max(cursor, end + tolerance)
        if cursor > end_at:
            break
    if cursor <= end_at:
        gaps.append((cursor, end_at))
    return gaps


def ingest(store, payload: Dict[str, Any], *, workstation: str | None = None) -> Dict[str, Any]:
    ensure_schema(store)
    rows = list((payload or {}).get("rows") or [])
    meta = dict((payload or {}).get("query") or {})
    now = utc_now(); inserted = 0; updated = 0
    with store.connect() as con:
        for row in rows:
            key = str(row.get("row_key") or "").strip()
            if not key:
                continue
            exists = con.execute("SELECT 1 FROM repair_history_3012 WHERE row_key=?", (key,)).fetchone()
            values = [row.get(name) for name in FIELDS]
            if exists:
                sets = ",".join(f"{name}=?" for name in FIELDS)
                con.execute(
                    f"UPDATE repair_history_3012 SET {sets},query_meta_json=?,raw_json=?,last_seen_at=? WHERE row_key=?",
                    values + [stable_json(meta), stable_json(row.get("raw") or row), now, key],
                )
                updated += 1
            else:
                columns = ["row_key", *FIELDS, "query_meta_json", "raw_json", "first_seen_at", "last_seen_at"]
                placeholders = ",".join("?" for _ in columns)
                con.execute(
                    f"INSERT INTO repair_history_3012({','.join(columns)}) VALUES({placeholders})",
                    [key, *values, stable_json(meta), stable_json(row.get("raw") or row), now, now],
                )
                inserted += 1
        if con.execute("SELECT 1 FROM sqlite_master WHERE name='mes_source_clock'").fetchone():
            sns = list({r.get('pcba_sn') for r in rows if r.get('pcba_sn')})
            for sn in sns:
                con.execute(
                    "INSERT INTO mes_source_clock(snapshot_id,epoch) SELECT DISTINCT snapshot_id,1 FROM defect_observations WHERE pcba_sn=? ON CONFLICT(snapshot_id) DO UPDATE SET epoch=epoch+1",
                    (sn,),
                )
    covered = record_coverage(store, payload)
    store.record_audit(
        "INGEST_3012",
        workstation=workstation,
        details={"records": len(rows), "inserted": inserted, "updated": updated, "coverage": covered, "query": meta, "source": str((payload or {}).get("source") or "")},
    )
    return {"records": len(rows), "inserted": inserted, "updated": updated, "coverage": covered}


def history(store, *, sn: str = "", start_at: str = "", end_at: str = "", line: str = "",
            defect_code: str = "", repair_user: str = "", limit: int = 5000) -> List[Dict[str, Any]]:
    ensure_schema(store)
    limit = max(1, min(int(limit or 5000), 100000)); where = []; params = []
    sn = str(sn or "").strip()
    if sn:
        where.append("(pcba_sn=? OR imei=?)"); params.extend([sn, sn])
    if start_at:
        where.append("COALESCE(defect_time,repair_time,'')>=?"); params.append(str(start_at))
    if end_at:
        where.append("COALESCE(defect_time,repair_time,'')<=?"); params.append(str(end_at))
    if line:
        where.append("line=?"); params.append(str(line))
    if defect_code:
        where.append("defect_code=?"); params.append(str(defect_code))
    if repair_user:
        where.append("repair_user=?"); params.append(str(repair_user))
    sql = "SELECT * FROM repair_history_3012"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY COALESCE(defect_time,repair_time,last_seen_at) DESC LIMIT ?"; params.append(limit)
    with store.connect() as con:
        rows = [dict(r) for r in con.execute(sql, params).fetchall()]
    for row in rows:
        for key in ("query_meta_json", "raw_json"):
            try:
                row[key[:-5] if key.endswith('_json') else key] = json.loads(row.get(key) or '{}')
            except Exception:
                row[key[:-5] if key.endswith('_json') else key] = {}
    return rows


def history_many(store, sns: Iterable[str], *, limit_each: int = 2000) -> Dict[str, List[Dict[str, Any]]]:
    out = {}
    for sn in dict.fromkeys(str(x or "").strip() for x in sns if str(x or "").strip()):
        out[sn] = history(store, sn=sn, limit=limit_each)
    return out


def stats(store) -> Dict[str, Any]:
    ensure_schema(store)
    with store.connect() as con:
        row = con.execute("""SELECT COUNT(*) rows,COUNT(DISTINCT NULLIF(pcba_sn,'')) pcbas,COUNT(DISTINCT NULLIF(repair_user,'')) repair_users,
                           MIN(COALESCE(defect_time,repair_time)) first_event,MAX(COALESCE(defect_time,repair_time)) last_event
                           FROM repair_history_3012""").fetchone()
        coverage_row = con.execute("SELECT COUNT(*) intervals,COUNT(DISTINCT sn) sns FROM repair_coverage_3012").fetchone()
    out = dict(row) if row else {"rows":0,"pcbas":0,"repair_users":0,"first_event":None,"last_event":None}
    out["coverage_intervals"] = int(coverage_row["intervals"] if coverage_row else 0)
    out["coverage_sns"] = int(coverage_row["sns"] if coverage_row else 0)
    return out
