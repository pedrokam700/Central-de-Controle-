import json
import sqlite3
from pathlib import Path
from contextlib import contextmanager

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    source_file TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS current_defects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER,
    pcba_sn TEXT NOT NULL,
    defect_code TEXT,
    defect_desc TEXT,
    defect_time TEXT,
    repair_user TEXT,
    repair_time TEXT,
    repair_comment TEXT,
    defect_reason_type TEXT,
    defect_reason_desc TEXT,
    product_model TEXT,
    product_id TEXT,
    line TEXT,
    batch_id TEXT,
    department TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS pcba_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pcba_sn TEXT NOT NULL,
    item_sn TEXT NOT NULL,
    item_type TEXT,
    batch_id TEXT,
    sn_seq TEXT,
    batch_count INTEGER,
    line_id TEXT,
    operation TEXT,
    product_model TEXT,
    product_id TEXT,
    whether_to_use TEXT,
    init_flag TEXT,
    iss_status TEXT,
    create_time TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS item_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_sn TEXT NOT NULL,
    pcba_sn TEXT NOT NULL,
    item_type TEXT,
    product_model TEXT,
    product_id TEXT,
    line_id TEXT,
    batch_id TEXT,
    sn_seq TEXT,
    batch_count INTEGER,
    whether_to_use TEXT,
    create_time TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS defect_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pcba_sn TEXT NOT NULL,
    defect_code TEXT,
    defect_desc TEXT,
    defect_time TEXT,
    repair_user TEXT,
    repair_time TEXT,
    repair_comment TEXT,
    defect_reason_type TEXT,
    defect_reason_desc TEXT,
    product_model TEXT,
    product_id TEXT,
    line TEXT,
    batch_id TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS process_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pcba_sn TEXT NOT NULL,
    operation_code TEXT,
    operation_name TEXT,
    event_time TEXT NOT NULL,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS correlations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER,
    current_pcba_sn TEXT NOT NULL,
    current_defect_desc TEXT,
    item_sn TEXT NOT NULL,
    item_type TEXT,
    distinct_pcba_count INTEGER NOT NULL DEFAULT 0,
    previous_pcba_sn TEXT,
    previous_defect_desc TEXT,
    similarity_score REAL,
    status TEXT,
    evidence_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cache (
    cache_key TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stage TEXT,
    entity_sn TEXT,
    error_type TEXT,
    message TEXT,
    context_json TEXT
);
"""

class Database:
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(self.path)
        con.row_factory = sqlite3.Row
        try:
            yield con
            con.commit()
        finally:
            con.close()

    def initialize(self):
        with self.connect() as con:
            con.executescript(SCHEMA)
            con.execute(
                "INSERT OR REPLACE INTO schema_meta(key,value) VALUES('schema_version','0.6')"
            )

    def start_run(self, source_file=None):
        with self.connect() as con:
            cur = con.execute(
                "INSERT INTO runs(source_file) VALUES(?)",
                (str(source_file) if source_file else None,)
            )
            return cur.lastrowid

    def finish_run(self, run_id, status="finished", notes=None):
        with self.connect() as con:
            con.execute(
                "UPDATE runs SET finished_at=CURRENT_TIMESTAMP,status=?,notes=? WHERE id=?",
                (status, notes, run_id)
            )

    def insert_current_defect(self, run_id, rec):
        fields = [
            "pcba_sn","defect_code","defect_desc","defect_time","repair_user",
            "repair_time","repair_comment","defect_reason_type","defect_reason_desc",
            "product_model","product_id","line","batch_id","department"
        ]
        raw = json.dumps(rec, ensure_ascii=False, default=str)
        vals = [rec.get(f) for f in fields]
        with self.connect() as con:
            con.execute(
                f"""INSERT INTO current_defects(
                    run_id,{",".join(fields)},raw_json
                ) VALUES({",".join(["?"]*(len(fields)+2))})""",
                [run_id] + vals + [raw]
            )

    def get_cache(self, cache_key):
        with self.connect() as con:
            row = con.execute(
                """SELECT payload_json
                   FROM cache
                   WHERE cache_key=?
                     AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))""",
                (cache_key,)
            ).fetchone()
            if not row:
                return None
            try:
                return json.loads(row["payload_json"])
            except Exception:
                return None

    def set_cache(self, cache_key, payload, ttl_hours=168):
        with self.connect() as con:
            con.execute(
                """INSERT OR REPLACE INTO cache(
                       cache_key,created_at,expires_at,payload_json
                   ) VALUES(
                       ?,CURRENT_TIMESTAMP,datetime('now', ?),?
                   )""",
                (
                    cache_key,
                    f"+{int(ttl_hours)} hours",
                    json.dumps(payload, ensure_ascii=False, default=str)
                )
            )

    def log_error(self, stage, entity_sn, exc, run_id=None, context=None):
        with self.connect() as con:
            con.execute(
                """INSERT INTO errors(
                       run_id,stage,entity_sn,error_type,message,context_json
                   ) VALUES(?,?,?,?,?,?)""",
                (
                    run_id, stage, entity_sn, type(exc).__name__, str(exc),
                    json.dumps(context or {}, ensure_ascii=False, default=str)
                )
            )
