"""B3.4b5 — immutable, SQLite-only 3012 row revisions and job-scoped queries."""
import hashlib
import json
from store import stable_json, utc_now

SQL = """
CREATE TABLE IF NOT EXISTS repair_query_runs_3012(
 job_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, origin TEXT NOT NULL,
 requested_json TEXT NOT NULL, scope_json TEXT NOT NULL, scope_hash TEXT NOT NULL,
 started_at TEXT NOT NULL, finished_at TEXT,
 status TEXT NOT NULL CHECK(status IN ('running','completed','partial','error')),
 source TEXT, coverage_json TEXT NOT NULL DEFAULT '{}', row_count INTEGER,
 source_complete INTEGER NOT NULL DEFAULT 0, population_complete INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_repair_query_scope_3012
 ON repair_query_runs_3012(source_id,scope_hash,started_at);
CREATE TABLE IF NOT EXISTS repair_row_versions_3012(
 row_key TEXT NOT NULL, revision INTEGER NOT NULL, content_hash TEXT NOT NULL,
 row_json TEXT NOT NULL, captured_at TEXT NOT NULL,
 PRIMARY KEY(row_key,revision), UNIQUE(row_key,content_hash)
);
CREATE TABLE IF NOT EXISTS repair_query_rows_3012(
 job_id TEXT NOT NULL, row_key TEXT NOT NULL, revision INTEGER NOT NULL,
 PRIMARY KEY(job_id,row_key,revision)
);
CREATE INDEX IF NOT EXISTS idx_repair_query_rowkey_3012
 ON repair_query_rows_3012(row_key,revision);
"""
SCOPE_FIELDS = ("sn","sns","start_at","end_at","line","model","defect_code",
                "repair_code","defect_type","chunk_days","include_3022","include_3012")
ROW_FIELDS = ("product_id","pcba_sn","imei","department","line","product_model",
              "order_id","sample_batch_id","material_id","material_desc",
              "defect_user","defect_time","defect_oper","defect_code","defect_desc",
              "defect_category","defect_return_category","defect_material_id",
              "defect_material_desc","defect_reason_type","defect_reason_desc",
              "reason_desc","defect_location","repaired_location","repaired_count",
              "repair_code","repair_desc","repair_comment","repair_user",
              "repair_time","defect_source")

def ensure(con):
    con.executescript(SQL)

def _scope(obj):
    obj = dict(obj or {})
    result = {key:obj[key] for key in SCOPE_FIELDS if key in obj and obj[key] is not None}
    if "sns" in result:
        value = result["sns"]
        result["sns"] = list(dict.fromkeys(str(x).strip() for x in
                             (value if isinstance(value,(list,tuple)) else [])
                             if str(x).strip()))
    result["query_clock_zone"] = "America/Sao_Paulo"
    result["naive_offset"] = "-03:00"
    return result

def begin(store, job_id, origin, requested, effective):
    if not str(job_id or "").strip() or not str(origin or "").strip():
        raise ValueError("3012 query requires job identity")
    req = stable_json(_scope(requested))
    scope = stable_json(_scope(effective))
    digest = hashlib.sha256(scope.encode()).hexdigest()
    with store.connect() as con:
        ensure(con)
        sid = con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()
        if not sid or not sid[0]:
            raise ValueError("3012 requires original persisted source_id")
        con.execute("""INSERT OR IGNORE INTO repair_query_runs_3012
          (job_id,source_id,origin,requested_json,scope_json,scope_hash,started_at,status)
          VALUES(?,?,?,?,?,?,?,'running')""",
          (job_id,str(sid[0]),origin,req,scope,digest,utc_now()))
        row = con.execute("""SELECT source_id,origin,requested_json,scope_json
                             FROM repair_query_runs_3012 WHERE job_id=?""",(job_id,)).fetchone()
        if tuple(row) != (str(sid[0]),origin,req,scope):
            raise ValueError("3012 job_id collision with different scope/source")

def _record(row):
    raw = row.get("raw")
    if raw is None and "raw_json" in row:
        try:
            raw = json.loads(row["raw_json"]) if isinstance(row["raw_json"],str) else row["raw_json"]
        except (ValueError,TypeError):
            raw = row["raw_json"]
    return {"fields":{k:row.get(k) for k in ROW_FIELDS},
            "raw": raw if raw is not None else {k:row.get(k) for k in ROW_FIELDS}}

def archive(con, row, job_id=None):
    key = str((row or {}).get("row_key") or "").strip()
    if not key:
        return 0
    payload = stable_json(_record(row))
    digest = hashlib.sha256(payload.encode()).hexdigest()
    existing = con.execute("""SELECT revision FROM repair_row_versions_3012
                              WHERE row_key=? AND content_hash=?""",(key,digest)).fetchone()
    if existing:
        revision = int(existing[0])
    else:
        previous = con.execute("""SELECT MAX(revision) FROM repair_row_versions_3012
                                  WHERE row_key=?""",(key,)).fetchone()[0]
        revision = int(previous or 0)+1
        con.execute("""INSERT INTO repair_row_versions_3012 VALUES(?,?,?,?,?)""",
                    (key,revision,digest,payload,utc_now()))
    if job_id:
        con.execute("INSERT OR IGNORE INTO repair_query_rows_3012 VALUES(?,?,?)",
                    (job_id,key,revision))
    return revision

def finish(store, job_id, rows, source, coverage=None):
    with store.connect() as con:
        ensure(con)
        current = con.execute("SELECT status FROM repair_query_runs_3012 WHERE job_id=?",
                              (job_id,)).fetchone()
        if not current or current[0] != "running":
            raise ValueError("3012 cannot complete an absent/closed job")
        for row in rows or []:
            if isinstance(row,dict):
                archive(con,row,job_id)
        count = con.execute("SELECT COUNT(*) FROM repair_query_rows_3012 WHERE job_id=?",
                            (job_id,)).fetchone()[0]
        proof = dict(coverage or {})
        proof["source_complete"] = False
        proof["population_complete"] = False
        con.execute("""UPDATE repair_query_runs_3012 SET status='completed',finished_at=?,
          source=?,coverage_json=?,row_count=? WHERE job_id=?""",
          (utc_now(),str(source or ""),stable_json(proof),count,job_id))
    return count

def fail(store,job_id):
    with store.connect() as con:
        ensure(con)
        count = con.execute("SELECT COUNT(*) FROM repair_query_rows_3012 WHERE job_id=?",
                            (job_id,)).fetchone()[0]
        con.execute("""UPDATE repair_query_runs_3012 SET status=?,finished_at=?,
          row_count=? WHERE job_id=? AND status='running'""",
          ("partial" if count else "error",utc_now(),count,job_id))

def read(store,job_id):
    """Private local diagnostic; no HTTP endpoint and no Firebase publication."""
    with store.connect() as con:
        ensure(con)
        rec = con.execute("SELECT * FROM repair_query_runs_3012 WHERE job_id=?",
                          (job_id,)).fetchone()
        if not rec: return None
        rows = con.execute("""SELECT q.row_key,q.revision,r.content_hash,r.row_json
          FROM repair_query_rows_3012 q JOIN repair_row_versions_3012 r
          ON r.row_key=q.row_key AND r.revision=q.revision
          WHERE q.job_id=? ORDER BY q.row_key,q.revision""",(job_id,)).fetchall()
    out = dict(rec)
    for col in ("requested_json","scope_json","coverage_json"):
        out[col[:-5]] = json.loads(out.pop(col))
    out["rows"] = [{"row_key":r[0],"revision":r[1],"hash":r[2],
                    **json.loads(r[3])} for r in rows]
    return out
