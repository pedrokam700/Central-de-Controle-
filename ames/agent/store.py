from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

SCHEMA_VERSION = "0.5"

SCHEMA = r"""
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_meta(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_windows(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  window_key TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL,
  start_at TEXT,
  end_at TEXT,
  shift TEXT,
  requested_lines_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  window_id INTEGER,
  collected_at TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_name TEXT,
  source_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'complete',
  notes TEXT,
  FOREIGN KEY(window_id) REFERENCES analysis_windows(id)
);

CREATE TABLE IF NOT EXISTS line_metrics(
  snapshot_id INTEGER NOT NULL,
  line TEXT NOT NULL,
  product_model TEXT,
  quantity INTEGER,
  function_defect_qty INTEGER,
  appearance_defect_qty INTEGER,
  process_defect_qty INTEGER,
  total_defect_qty INTEGER,
  auto_input_defect_qty INTEGER,
  function_fpy REAL,
  appearance_fpy REAL,
  process_fpy REAL,
  fpy REAL,
  check_fpy REAL,
  raw_json TEXT,
  PRIMARY KEY(snapshot_id,line,product_model),
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
);

CREATE TABLE IF NOT EXISTS defect_entities(
  defect_key TEXT PRIMARY KEY,
  first_seen_snapshot_id INTEGER NOT NULL,
  last_seen_snapshot_id INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_presence INTEGER NOT NULL DEFAULT 1,
  removed_from_latest INTEGER NOT NULL DEFAULT 0,
  line TEXT,
  pcba_sn TEXT,
  defect_code TEXT,
  defect_desc TEXT,
  defect_time TEXT,
  product_model TEXT,
  FOREIGN KEY(first_seen_snapshot_id) REFERENCES snapshots(id),
  FOREIGN KEY(last_seen_snapshot_id) REFERENCES snapshots(id)
);

CREATE TABLE IF NOT EXISTS defect_observations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  defect_key TEXT NOT NULL,
  line TEXT,
  pcba_sn TEXT,
  imei TEXT,
  defect_code TEXT,
  defect_desc TEXT,
  defect_oper TEXT,
  defect_oper_desc TEXT,
  defect_time TEXT,
  repair_user TEXT,
  repair_comment TEXT,
  defect_reason_type TEXT,
  defect_reason_desc TEXT,
  repair_code TEXT,
  repair_desc TEXT,
  product_model TEXT,
  work_shift TEXT,
  manual_or_auto TEXT,
  repair_status_current TEXT,
  defect_type_current TEXT,
  repair_state_current TEXT,
  present_in_3028 INTEGER NOT NULL DEFAULT 1,
  raw_json TEXT,
  UNIQUE(snapshot_id,defect_key),
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id),
  FOREIGN KEY(defect_key) REFERENCES defect_entities(defect_key)
);

CREATE TABLE IF NOT EXISTS pcba_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  pcba_sn TEXT NOT NULL,
  hist_seq TEXT,
  defect_code TEXT,
  defect_desc TEXT,
  defect_oper TEXT,
  defect_location TEXT,
  defect_material_id TEXT,
  repair_status TEXT,
  manual_or_auto TEXT,
  defect_type TEXT,
  defect_type_class TEXT,
  raw_json TEXT,
  UNIQUE(snapshot_id,pcba_sn,hist_seq,defect_code,defect_desc),
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
);

CREATE TABLE IF NOT EXISTS history_contexts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  context_key TEXT NOT NULL,
  context_kind TEXT NOT NULL,
  historical_pcba TEXT,
  current_pcba TEXT,
  line TEXT,
  material_sn TEXT,
  material_type TEXT,
  defect_time TEXT,
  defect_code TEXT,
  defect_desc TEXT,
  raw_json TEXT,
  UNIQUE(snapshot_id,context_key,context_kind),
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
);

CREATE TABLE IF NOT EXISTS material_reuse(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  current_pcba_sn TEXT NOT NULL,
  current_defect_key TEXT,
  item_sn TEXT NOT NULL,
  item_type TEXT,
  usage_status TEXT,
  previous_pcba_count INTEGER NOT NULL DEFAULT 0,
  total_pcba_count_known_now INTEGER NOT NULL DEFAULT 0,
  previous_pcbas_json TEXT NOT NULL DEFAULT '[]',
  active_now_pcbas_json TEXT NOT NULL DEFAULT '[]',
  inactive_now_pcbas_json TEXT NOT NULL DEFAULT '[]',
  bind_time_utc TEXT,
  unbind_time_utc TEXT,
  raw_json TEXT,
  UNIQUE(snapshot_id,current_pcba_sn,current_defect_key,item_sn),
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
);

CREATE TABLE IF NOT EXISTS process_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  pcba_sn TEXT NOT NULL,
  station TEXT,
  operation_code TEXT,
  operation_name TEXT,
  event_time TEXT,
  event_group TEXT,
  source TEXT NOT NULL DEFAULT '3022',
  raw_json TEXT,
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
);

CREATE TABLE IF NOT EXISTS repair_refreshes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER,
  refreshed_at TEXT NOT NULL,
  pcba_sn TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT,
  error TEXT,
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
);

CREATE TABLE IF NOT EXISTS jobs(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  mode TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  progress REAL NOT NULL DEFAULT 0,
  stage TEXT,
  message TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS monitor_profiles(
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  mode TEXT NOT NULL DEFAULT 'today',
  config_json TEXT NOT NULL DEFAULT '{}',
  next_run_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER,
  artifact_type TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
);

-- Guarda o payload bruto integrado para que nenhuma evidencia extraida do MES
-- seja perdida mesmo quando ainda nao existe coluna/tabela especializada para ela.
CREATE TABLE IF NOT EXISTS snapshot_payloads(
  snapshot_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,kind),
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
);

CREATE TABLE IF NOT EXISTS cora_documents(
  doc_id TEXT PRIMARY KEY,
  snapshot_id INTEGER,
  line TEXT,
  pcba_sn TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
);

CREATE TABLE IF NOT EXISTS audit_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  workstation TEXT,
  event_type TEXT NOT NULL,
  snapshot_id INTEGER,
  line TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(snapshot_id) REFERENCES snapshots(id)
);

CREATE INDEX IF NOT EXISTS idx_defect_obs_snapshot_line ON defect_observations(snapshot_id,line);
CREATE INDEX IF NOT EXISTS idx_defect_entities_line ON defect_entities(line);
CREATE INDEX IF NOT EXISTS idx_pcba_history_pcba ON pcba_history(pcba_sn);
CREATE INDEX IF NOT EXISTS idx_history_context_line ON history_contexts(line,historical_pcba,current_pcba);
CREATE INDEX IF NOT EXISTS idx_material_item ON material_reuse(item_sn);
CREATE INDEX IF NOT EXISTS idx_process_pcba_time ON process_events(pcba_sn,event_time);
CREATE INDEX IF NOT EXISTS idx_cora_line_kind ON cora_documents(line,kind);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at,event_type);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def defect_key(rec: Dict[str, Any]) -> str:
    raw = "|".join(
        str(rec.get(k) or "").strip()
        for k in ("line", "pcba_sn", "defect_time", "defect_code", "defect_desc")
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def parse_pct(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        f = float(v)
        return f * 100 if 0 <= f <= 1 else f
    s = str(v).strip().replace("%", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def to_int(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(self.path, timeout=30)
        con.row_factory = sqlite3.Row
        try:
            yield con
            con.commit()
        finally:
            con.close()

    def initialize(self) -> None:
        with self.connect() as con:
            con.executescript(SCHEMA)
            con.execute(
                "INSERT OR REPLACE INTO schema_meta(key,value) VALUES('schema_version',?)",
                (SCHEMA_VERSION,),
            )
            con.execute(
                "INSERT OR IGNORE INTO monitor_profiles(id,enabled,interval_minutes,mode,config_json,updated_at) VALUES(1,0,30,'today','{}',?)",
                (utc_now(),),
            )

    def record_audit(self, event_type: str, *, workstation: str | None = None, snapshot_id: int | None = None,
                     line: str | None = None, details: Any = None) -> int:
        with self.connect() as con:
            cur = con.execute(
                "INSERT INTO audit_events(created_at,workstation,event_type,snapshot_id,line,details_json) VALUES(?,?,?,?,?,?)",
                (utc_now(), workstation, str(event_type), snapshot_id, line, stable_json(details or {})),
            )
            return int(cur.lastrowid)

    def backup(self, backup_dir: str | Path, *, keep: int = 10, reason: str = "manual") -> Dict[str, Any]:
        self.initialize()
        backup_dir = Path(backup_dir)
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        target = backup_dir / f"ames_local_{stamp}_{reason}.sqlite3"
        src = sqlite3.connect(self.path, timeout=30)
        dst = sqlite3.connect(target)
        try:
            with dst:
                src.backup(dst)
        finally:
            dst.close()
            src.close()
        files = sorted(backup_dir.glob("ames_local_*.sqlite3"), key=lambda x: x.stat().st_mtime, reverse=True)
        for old in files[max(1, int(keep)):]:
            try:
                old.unlink()
            except OSError:
                pass
        return {"path": str(target), "bytes": target.stat().st_size, "created_at": datetime.now().isoformat(timespec="seconds"), "reason": reason}

    def latest_backup_info(self, backup_dir: str | Path) -> Optional[Dict[str, Any]]:
        backup_dir = Path(backup_dir)
        if not backup_dir.exists():
            return None
        files = sorted(backup_dir.glob("ames_local_*.sqlite3"), key=lambda x: x.stat().st_mtime, reverse=True)
        if not files:
            return None
        f = files[0]
        return {"path": str(f), "bytes": f.stat().st_size, "modified_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds")}

    def ensure_window(self, mode: str, start_at: str | None, end_at: str | None,
                      shift: str | None, lines: Iterable[str]) -> int:
        """Return a stable logical analysis window.

        For live `today` monitoring, `end_at` advances every refresh. It must NOT
        become part of the identity, otherwise disappearance/reappearance cannot
        be reconciled between snapshots from the same production day.
        """
        normalized_lines = sorted({str(x).strip() for x in lines if str(x).strip()})
        mode_norm = str(mode or "manual").strip().lower()
        identity = {
            "mode": mode_norm,
            "start_at": start_at,
            "end_at": None if mode_norm in {"today", "live", "monitor_today"} else end_at,
            "shift": shift,
            "lines": normalized_lines,
        }
        raw = stable_json(identity)
        key = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
        now = utc_now()
        with self.connect() as con:
            row = con.execute("SELECT id FROM analysis_windows WHERE window_key=?", (key,)).fetchone()
            if row:
                # Keep the latest observed end of a live window for audit/UI.
                con.execute(
                    "UPDATE analysis_windows SET end_at=?,requested_lines_json=?,updated_at=? WHERE id=?",
                    (end_at, stable_json(normalized_lines), now, row["id"]),
                )
                return int(row["id"])
            cur = con.execute(
                """INSERT INTO analysis_windows(window_key,mode,start_at,end_at,shift,requested_lines_json,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (key, mode_norm, start_at, end_at, shift, stable_json(normalized_lines), now, now),
            )
            return int(cur.lastrowid)

    def create_snapshot(self, *, window_id: Optional[int], source_kind: str,
                        source_name: str = "", source_bytes: bytes | None = None,
                        notes: str = "") -> int:
        sha = hashlib.sha256(source_bytes).hexdigest() if source_bytes is not None else None
        with self.connect() as con:
            cur = con.execute(
                """INSERT INTO snapshots(window_id,collected_at,source_kind,source_name,source_sha256,status,notes)
                   VALUES(?,?,?,?,?,'complete',?)""",
                (window_id, utc_now(), source_kind, source_name, sha, notes),
            )
            return int(cur.lastrowid)

    def save_snapshot_payload(self, snapshot_id: int, kind: str, payload: Any) -> None:
        """Persist raw extracted evidence so schema evolution never loses data."""
        with self.connect() as con:
            con.execute(
                """INSERT OR REPLACE INTO snapshot_payloads(snapshot_id,kind,payload_json,created_at)
                   VALUES(?,?,?,?)""",
                (snapshot_id, str(kind), stable_json(payload), utc_now()),
            )

    def get_snapshot_payload(self, snapshot_id: int, kinds: Iterable[str] | None = None) -> Optional[Dict[str, Any]]:
        with self.connect() as con:
            if kinds:
                ks = [str(k) for k in kinds]
                placeholders = ",".join("?" for _ in ks)
                row = con.execute(
                    f"SELECT payload_json FROM snapshot_payloads WHERE snapshot_id=? AND kind IN ({placeholders}) ORDER BY rowid DESC LIMIT 1",
                    [snapshot_id] + ks,
                ).fetchone()
            else:
                row = con.execute(
                    "SELECT payload_json FROM snapshot_payloads WHERE snapshot_id=? ORDER BY rowid DESC LIMIT 1",
                    (snapshot_id,),
                ).fetchone()
        if not row:
            return None
        try:
            return json.loads(row["payload_json"])
        except Exception:
            return None

    def ingest_line_metrics(self, snapshot_id: int, rows: Iterable[Dict[str, Any]]) -> None:
        fields = [
            "quantity", "function_defect_qty", "appearance_defect_qty", "process_defect_qty",
            "total_defect_qty", "auto_input_defect_qty", "function_fpy", "appearance_fpy",
            "process_fpy", "fpy", "check_fpy",
        ]
        with self.connect() as con:
            for row in rows:
                line = str(row.get("line") or "").strip()
                if not line:
                    continue
                vals = {
                    "quantity": to_int(row.get("quantity")),
                    "function_defect_qty": to_int(row.get("function_defect_qty")),
                    "appearance_defect_qty": to_int(row.get("appearance_defect_qty")),
                    "process_defect_qty": to_int(row.get("process_defect_qty")),
                    "total_defect_qty": to_int(row.get("total_defect_qty")),
                    "auto_input_defect_qty": to_int(row.get("auto_input_defect_qty")),
                    "function_fpy": parse_pct(row.get("function_fpy")),
                    "appearance_fpy": parse_pct(row.get("appearance_fpy")),
                    "process_fpy": parse_pct(row.get("process_fpy")),
                    "fpy": parse_pct(row.get("fpy")),
                    "check_fpy": parse_pct(row.get("check_fpy")),
                }
                con.execute(
                    f"""INSERT OR REPLACE INTO line_metrics(
                          snapshot_id,line,product_model,{','.join(fields)},raw_json
                        ) VALUES({','.join(['?']*(len(fields)+4))})""",
                    [snapshot_id, line, row.get("product_model")]
                    + [vals[f] for f in fields] + [stable_json(row)],
                )

    def ingest_defects(self, snapshot_id: int, records: Iterable[Dict[str, Any]],
                       *, reconcile_window: bool = True) -> int:
        now = utc_now()
        keys_seen: set[str] = set()
        count = 0
        with self.connect() as con:
            snapshot = con.execute("SELECT window_id FROM snapshots WHERE id=?", (snapshot_id,)).fetchone()
            window_id = snapshot["window_id"] if snapshot else None
            for rec in records:
                key = defect_key(rec)
                keys_seen.add(key)
                count += 1
                existing = con.execute("SELECT defect_key FROM defect_entities WHERE defect_key=?", (key,)).fetchone()
                if existing:
                    con.execute(
                        """UPDATE defect_entities SET last_seen_snapshot_id=?,last_seen_at=?,last_presence=1,
                           removed_from_latest=0,line=?,pcba_sn=?,defect_code=?,defect_desc=?,defect_time=?,product_model=?
                           WHERE defect_key=?""",
                        (snapshot_id, now, rec.get("line"), rec.get("pcba_sn"), rec.get("defect_code"),
                         rec.get("defect_desc"), rec.get("defect_time"), rec.get("product_model"), key),
                    )
                else:
                    con.execute(
                        """INSERT INTO defect_entities(defect_key,first_seen_snapshot_id,last_seen_snapshot_id,
                           first_seen_at,last_seen_at,last_presence,removed_from_latest,line,pcba_sn,defect_code,
                           defect_desc,defect_time,product_model) VALUES(?,?,?,?,?,1,0,?,?,?,?,?,?)""",
                        (key, snapshot_id, snapshot_id, now, now, rec.get("line"), rec.get("pcba_sn"),
                         rec.get("defect_code"), rec.get("defect_desc"), rec.get("defect_time"), rec.get("product_model")),
                    )
                con.execute(
                    """INSERT OR REPLACE INTO defect_observations(
                       snapshot_id,defect_key,line,pcba_sn,imei,defect_code,defect_desc,defect_oper,defect_oper_desc,
                       defect_time,repair_user,repair_comment,defect_reason_type,defect_reason_desc,repair_code,repair_desc,
                       product_model,work_shift,manual_or_auto,repair_status_current,defect_type_current,repair_state_current,
                       present_in_3028,raw_json)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)""",
                    (snapshot_id, key, rec.get("line"), rec.get("pcba_sn"), rec.get("imei"), rec.get("defect_code"),
                     rec.get("defect_desc"), rec.get("defect_oper"), rec.get("defect_oper_desc"), rec.get("defect_time"),
                     rec.get("repair_user"), rec.get("repair_comment"), rec.get("defect_reason_type"), rec.get("defect_reason_desc"),
                     rec.get("repair_code"), rec.get("repair_desc"), rec.get("product_model"), rec.get("work_shift"),
                     rec.get("manual_or_auto"), rec.get("repair_status_current"), rec.get("defect_type_current"),
                     rec.get("repair_state_current"), stable_json(rec)),
                )

            # A disappearance is evidence of a state change, not permission to erase history.
            if reconcile_window and window_id is not None:
                previous = con.execute(
                    """SELECT DISTINCT de.defect_key
                       FROM defect_entities de
                       JOIN snapshots s ON s.id=de.last_seen_snapshot_id
                       WHERE s.window_id=? AND de.last_seen_snapshot_id<>?""",
                    (window_id, snapshot_id),
                ).fetchall()
                missing = [r["defect_key"] for r in previous if r["defect_key"] not in keys_seen]
                for key in missing:
                    con.execute(
                        "UPDATE defect_entities SET last_presence=0,removed_from_latest=1 WHERE defect_key=?",
                        (key,),
                    )
        return count

    def ingest_2114(self, snapshot_id: int, pcbas: Iterable[Dict[str, Any]]) -> int:
        count = 0
        with self.connect() as con:
            for entry in pcbas:
                sn = str(entry.get("pcba_sn") or "").strip()
                result = entry.get("result") or {}
                for row in result.get("rows") or []:
                    count += 1
                    con.execute(
                        """INSERT OR REPLACE INTO pcba_history(snapshot_id,pcba_sn,hist_seq,defect_code,defect_desc,
                           defect_oper,defect_location,defect_material_id,repair_status,manual_or_auto,defect_type,
                           defect_type_class,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (snapshot_id, sn, row.get("Defect Hist Seq"), row.get("Defect Code"), row.get("Defect Description"),
                         row.get("Defect Oper"), row.get("Defect Location"), row.get("Defect Material ID"),
                         row.get("Repair Status"), row.get("TestTools Auto Defect Or Defect By Hand"), row.get("Defect Type"),
                         row.get("Defect Type Class"), stable_json(row)),
                    )
        return count

    def ingest_2114_contexts(self, snapshot_id: int, trace_2114: Dict[str, Any]) -> int:
        count = 0
        with self.connect() as con:
            for kind, contexts in (("historical", trace_2114.get("contexts") or []),
                                   ("current", trace_2114.get("current_contexts") or [])):
                for idx, ctx in enumerate(contexts):
                    count += 1
                    ckey = str(ctx.get("context_key") or hashlib.sha1(stable_json(ctx).encode("utf-8")).hexdigest()[:20])
                    con.execute(
                        """INSERT OR REPLACE INTO history_contexts(
                           snapshot_id,context_key,context_kind,historical_pcba,current_pcba,line,material_sn,material_type,
                           defect_time,defect_code,defect_desc,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (snapshot_id, ckey, kind, ctx.get("historical_pcba"), ctx.get("current_pcba"),
                         ctx.get("line"), ctx.get("material_sn"), ctx.get("material_type"), ctx.get("defect_time"),
                         ctx.get("defect_code"), ctx.get("defect_desc"), stable_json(ctx)),
                    )
        return count

    def ingest_material_reuse(self, snapshot_id: int, trace_3074: Dict[str, Any]) -> int:
        count = 0
        with self.connect() as con:
            for item in trace_3074.get("items") or []:
                current_pcba = item.get("pcba_sn")
                for defect_trace in item.get("defect_traces") or []:
                    dkey = (defect_trace.get("defect_key") or "")
                    trace = defect_trace.get("trace_3074") or {}
                    for r in trace.get("results") or []:
                        if not (r.get("previous_pcba_count") or 0):
                            continue
                        count += 1
                        con.execute(
                            """INSERT OR REPLACE INTO material_reuse(snapshot_id,current_pcba_sn,current_defect_key,item_sn,
                               item_type,usage_status,previous_pcba_count,total_pcba_count_known_now,previous_pcbas_json,
                               active_now_pcbas_json,inactive_now_pcbas_json,bind_time_utc,unbind_time_utc,raw_json)
                               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                            (snapshot_id, current_pcba, dkey, r.get("item_sn"), r.get("item_type"), r.get("status"),
                             int(r.get("previous_pcba_count") or 0), int(r.get("total_pcba_count_known_now") or 0),
                             stable_json(r.get("previous_pcbas") or []), stable_json(r.get("active_now_pcbas") or []),
                             stable_json(r.get("inactive_now_pcbas") or []), r.get("bind_time_utc"), r.get("unbind_time_utc"),
                             stable_json(r)),
                        )
        return count

    def ingest_integrated_payload(self, payload: Dict[str, Any], source_name: str = "integrated.json") -> int:
        trace_3074 = payload.get("trace_3074") or {}
        trace_2114 = payload.get("trace_2114") or {}
        snapshot_id = self.create_snapshot(window_id=None, source_kind="integrated_json", source_name=source_name)
        self.save_snapshot_payload(snapshot_id, "integrated_json", payload)
        records: List[Dict[str, Any]] = []
        for item in trace_3074.get("items") or []:
            records.extend(item.get("current_defects") or [])
        self.ingest_defects(snapshot_id, records, reconcile_window=False)
        self.ingest_2114(snapshot_id, trace_2114.get("pcbas") or [])
        self.ingest_2114_contexts(snapshot_id, trace_2114)
        self.ingest_material_reuse(snapshot_id, trace_3074)
        self.rebuild_cora_index(snapshot_id)
        return snapshot_id

    def rebuild_cora_index(self, snapshot_id: int) -> int:
        """Build a compact local retrieval index for CORA from all structured sources.

        CORA never needs a second authoritative database; this table is only a
        searchable projection of SQLite and can always be rebuilt.
        """
        now = utc_now()
        docs: List[tuple] = []
        with self.connect() as con:
            con.execute("DELETE FROM cora_documents WHERE snapshot_id=?", (snapshot_id,))
            current_rows = con.execute(
                "SELECT * FROM defect_observations WHERE snapshot_id=? ORDER BY line,defect_time", (snapshot_id,)
            ).fetchall()
            line_by_pcba = {}
            for r in current_rows:
                if r["pcba_sn"] and r["line"]:
                    line_by_pcba.setdefault(r["pcba_sn"], r["line"])
                doc_id = f"failure:{snapshot_id}:{r['defect_key']}"
                title = f"{r['line'] or 'Sem linha'} · {r['defect_code'] or ''} · {r['pcba_sn'] or ''}".strip()
                body = " | ".join(x for x in [r['defect_desc'], r['repair_comment'], r['defect_reason_desc'],
                                                 r['repair_state_current'], r['defect_type_current']] if x)
                meta = {"defect_time": r["defect_time"], "model": r["product_model"], "source": "3028"}
                docs.append((doc_id, snapshot_id, r["line"], r["pcba_sn"], "failure", title, body, stable_json(meta), now))

            # Map historical PCBAs back to the line/current failure that caused
            # their 2114 lookup. The integrated V0.16 contexts are the authoritative
            # relationship; material JSON is only a fallback.
            historical_line = {}
            ctx_rows = con.execute(
                "SELECT * FROM history_contexts WHERE snapshot_id=? ORDER BY id", (snapshot_id,)
            ).fetchall()
            for c in ctx_rows:
                if c["historical_pcba"] and c["line"]:
                    historical_line.setdefault(c["historical_pcba"], c["line"])
                doc_id = f"context:{snapshot_id}:{c['id']}"
                target = c["historical_pcba"] or c["current_pcba"] or ""
                title = f"Contexto {c['context_kind']} · {target} · {c['defect_code'] or ''}"
                body = " | ".join(x for x in [c['defect_desc'], c['material_type'], c['material_sn'], c['defect_time']] if x)
                docs.append((doc_id, snapshot_id, c["line"], target or None, "history_context", title, body,
                             stable_json({"source": "2114_context"}), now))

            # Material link rows are indexed as their own evidence.
            mats = con.execute(
                "SELECT * FROM material_reuse WHERE snapshot_id=? ORDER BY current_pcba_sn,item_type,item_sn",
                (snapshot_id,),
            ).fetchall()
            for r in mats:
                line = line_by_pcba.get(r["current_pcba_sn"])
                if line:
                    try:
                        prev = json.loads(r["previous_pcbas_json"] or "[]")
                    except Exception:
                        prev = []
                    for pcba in prev:
                        historical_line.setdefault(str(pcba), line)
                doc_id = f"material:{snapshot_id}:{r['id']}"
                title = f"Material reutilizado {r['item_type'] or ''} · {r['item_sn'] or ''}".strip()
                body = (f"PCBA atual {r['current_pcba_sn']} | uso {r['usage_status'] or ''} | "
                        f"PCBAs desvinculadas {r['previous_pcbas_json'] or '[]'} | "
                        f"usos conhecidos {r['total_pcba_count_known_now'] or 0}")
                meta = {"source": "3074", "previous_pcba_count": r["previous_pcba_count"]}
                docs.append((doc_id, snapshot_id, line, r["current_pcba_sn"], "material_reuse", title, body, stable_json(meta), now))

            hist = con.execute(
                "SELECT * FROM pcba_history WHERE snapshot_id=? ORDER BY pcba_sn,hist_seq", (snapshot_id,)
            ).fetchall()
            for r in hist:
                line = line_by_pcba.get(r["pcba_sn"]) or historical_line.get(r["pcba_sn"])
                doc_id = f"pcba:{snapshot_id}:{r['pcba_sn']}:{r['id']}"
                title = f"Histórico PCBA {r['pcba_sn']} · {r['defect_code'] or ''}"
                body = " | ".join(x for x in [r['defect_desc'], r['repair_status'], r['defect_type'], r['manual_or_auto']] if x)
                meta = {"hist_seq": r["hist_seq"], "source": "2114"}
                docs.append((doc_id, snapshot_id, line, r["pcba_sn"], "pcba_history", title, body, stable_json(meta), now))

            metrics = con.execute(
                "SELECT * FROM line_metrics WHERE snapshot_id=? ORDER BY line,product_model", (snapshot_id,)
            ).fetchall()
            for r in metrics:
                doc_id = f"metric:{snapshot_id}:{r['line']}:{r['product_model'] or ''}"
                title = f"FPY {r['line']} · {r['product_model'] or ''}"
                body = (f"FPY {r['fpy']} | Check FPY {r['check_fpy']} | Quantity {r['quantity']} | "
                        f"Total Defect Qty {r['total_defect_qty']}")
                docs.append((doc_id, snapshot_id, r["line"], None, "line_metric", title, body,
                             stable_json({"source": "3028_overall"}), now))

            events = con.execute(
                "SELECT * FROM process_events WHERE snapshot_id=? ORDER BY pcba_sn,event_time", (snapshot_id,)
            ).fetchall()
            for r in events:
                line = line_by_pcba.get(r["pcba_sn"])
                doc_id = f"process:{snapshot_id}:{r['id']}"
                title = f"Processo {r['station'] or r['operation_code'] or ''} · {r['pcba_sn']}"
                body = " | ".join(x for x in [r['operation_name'], r['event_group'], r['event_time']] if x)
                docs.append((doc_id, snapshot_id, line, r["pcba_sn"], "process_event", title, body,
                             stable_json({"source": r["source"]}), now))

            con.executemany(
                """INSERT OR REPLACE INTO cora_documents(doc_id,snapshot_id,line,pcba_sn,kind,title,body,metadata_json,updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""", docs
            )
        return len(docs)

    def latest_snapshot_id(self) -> Optional[int]:
        with self.connect() as con:
            row = con.execute("SELECT id FROM snapshots ORDER BY id DESC LIMIT 1").fetchone()
            return int(row["id"]) if row else None

    def latest_snapshot_id_for_line(self, line: str) -> Optional[int]:
        line = str(line or "").strip()
        if not line:
            return None
        with self.connect() as con:
            row = con.execute(
                """SELECT MAX(snapshot_id) AS sid FROM (
                       SELECT snapshot_id FROM line_metrics WHERE line=?
                       UNION ALL
                       SELECT snapshot_id FROM defect_observations WHERE line=?
                   )""",
                (line, line),
            ).fetchone()
        return int(row["sid"]) if row and row["sid"] is not None else None

    def latest_snapshot_ids_by_line(self, lines: Iterable[str] | None = None) -> Dict[str, int]:
        requested = [str(x).strip() for x in (lines or []) if str(x).strip()]
        with self.connect() as con:
            if not requested:
                requested = sorted({r[0] for r in con.execute(
                    "SELECT DISTINCT line FROM line_metrics WHERE line IS NOT NULL AND line<>'' UNION SELECT DISTINCT line FROM defect_observations WHERE line IS NOT NULL AND line<>''"
                ).fetchall()})
        out: Dict[str, int] = {}
        for line in requested:
            sid = self.latest_snapshot_id_for_line(line)
            if sid:
                out[line] = sid
        return out

    def team_dashboard(self, lines: Iterable[str] | None = None) -> Dict[str, Any]:
        requested = [str(x).strip() for x in (lines or []) if str(x).strip()]
        ids = self.latest_snapshot_ids_by_line(requested)
        if not requested:
            requested = sorted(ids)
        result = []
        latest_sid = max(ids.values()) if ids else None
        with self.connect() as con:
            for line in requested:
                sid = ids.get(line)
                if not sid:
                    result.append({
                        "line": line, "snapshot_id": None, "collected_at": None,
                        "defect_rows": 0, "unresolved": 0, "removed_from_latest": 0,
                        "metrics": None, "metrics_rows": [], "repair_unknown": 0, "top3": [],
                    })
                    continue
                dash = self.dashboard(sid)
                entry = next((x for x in dash.get("lines", []) if x.get("line") == line), None)
                if entry is None:
                    entry = {
                        "line": line, "defect_rows": 0, "unresolved": 0,
                        "removed_from_latest": 0, "metrics": None, "metrics_rows": [],
                        "repair_unknown": 0, "top3": [],
                    }
                snap = con.execute("SELECT collected_at FROM snapshots WHERE id=?", (sid,)).fetchone()
                entry = dict(entry)
                entry["snapshot_id"] = sid
                entry["collected_at"] = snap["collected_at"] if snap else None
                result.append(entry)
        return {
            "snapshot_id": latest_sid,
            "latest_snapshot_id": latest_sid,
            "snapshot_ids": ids,
            "lines": result,
        }

    def team_dataset_rows(self, dataset: str, lines: Iterable[str] | None = None,
                          line: Optional[str] = None, limit: int = 5000) -> List[Dict[str, Any]]:
        requested = [str(x).strip() for x in (lines or []) if str(x).strip()]
        if line:
            requested = [str(line).strip()]
        ids = self.latest_snapshot_ids_by_line(requested)
        rows: List[Dict[str, Any]] = []
        seen = set()
        for ln in requested or sorted(ids):
            sid = ids.get(ln)
            if not sid:
                continue
            for row in self.dataset_rows(dataset, snapshot_id=sid, line=ln, limit=limit):
                # Avoid duplicate global/audit rows when several lines share the same snapshot.
                key = stable_json(row)
                if key in seen:
                    continue
                seen.add(key)
                rows.append(row)
                if len(rows) >= limit:
                    return rows
        return rows

    def team_dataset_catalog(self, lines: Iterable[str] | None = None) -> List[Dict[str, Any]]:
        specs = [
            ("defects", "Falhas atuais 3028"),
            ("pcba_history", "Histórico PCBA 2114"),
            ("history_contexts", "Contextos 2114 / correlação"),
            ("material_reuse", "Reuso / vínculos 3074"),
            ("process_events", "Processo / AT 3022"),
            ("line_metrics", "FPY oficial por linha"),
            ("repair_refreshes", "Atualizações AT / N-Y"),
            ("audit_events", "Auditoria local"),
            ("removed_defects", "Removidas do export / validar AT"),
            ("raw_payloads", "Payloads brutos preservados"),
        ]
        return [
            {"dataset": key, "label": label, "rows": len(self.team_dataset_rows(key, lines=lines, limit=100000))}
            for key, label in specs
        ]

    def dashboard(self, snapshot_id: Optional[int] = None) -> Dict[str, Any]:
        snapshot_id = snapshot_id or self.latest_snapshot_id()
        if not snapshot_id:
            return {"snapshot_id": None, "lines": []}
        with self.connect() as con:
            lines = sorted({r[0] for r in con.execute(
                "SELECT DISTINCT line FROM defect_observations WHERE snapshot_id=? AND line IS NOT NULL AND line<>''",
                (snapshot_id,),
            ).fetchall()} | {r[0] for r in con.execute(
                "SELECT DISTINCT line FROM line_metrics WHERE snapshot_id=? AND line IS NOT NULL AND line<>''",
                (snapshot_id,),
            ).fetchall()})
            result = []
            for line in lines:
                metric_rows = con.execute(
                    "SELECT * FROM line_metrics WHERE snapshot_id=? AND line=? ORDER BY product_model",
                    (snapshot_id, line),
                ).fetchall()
                metric = metric_rows[0] if len(metric_rows) == 1 else None
                total = con.execute(
                    "SELECT COUNT(*) n FROM defect_observations WHERE snapshot_id=? AND line=?",
                    (snapshot_id, line),
                ).fetchone()["n"]
                top3 = [dict(r) for r in con.execute(
                    """SELECT defect_code,defect_desc,COUNT(*) qty
                       FROM defect_observations WHERE snapshot_id=? AND line=?
                       GROUP BY defect_code,defect_desc ORDER BY qty DESC,defect_code LIMIT 3""",
                    (snapshot_id, line),
                ).fetchall()]
                unresolved = con.execute(
                    """SELECT COUNT(*) n FROM defect_observations
                       WHERE snapshot_id=? AND line=? AND UPPER(COALESCE(repair_status_current,''))='N'""",
                    (snapshot_id, line),
                ).fetchone()["n"]
                repair_unknown = con.execute(
                    """SELECT COUNT(*) n FROM defect_observations
                       WHERE snapshot_id=? AND line=? AND COALESCE(repair_status_current,'')=''""",
                    (snapshot_id, line),
                ).fetchone()["n"]
                snap = con.execute("SELECT window_id FROM snapshots WHERE id=?", (snapshot_id,)).fetchone()
                window_id = snap["window_id"] if snap else None
                if window_id is None:
                    removed = 0
                else:
                    removed = con.execute(
                        """SELECT COUNT(DISTINCT de.defect_key) n
                           FROM defect_entities de
                           WHERE de.line=? AND de.removed_from_latest=1
                             AND EXISTS (
                               SELECT 1 FROM defect_observations o
                               JOIN snapshots s ON s.id=o.snapshot_id
                               WHERE o.defect_key=de.defect_key AND s.window_id=?
                             )""",
                        (line, window_id),
                    ).fetchone()["n"]
                result.append({
                    "line": line,
                    "defect_rows": total,
                    "unresolved": unresolved,
                    "removed_from_latest": removed,
                    "metrics": dict(metric) if metric else None,
                    "metrics_rows": [dict(r) for r in metric_rows],
                    "repair_unknown": repair_unknown,
                    "top3": top3,
                })
            return {"snapshot_id": snapshot_id, "lines": result}

    def trend_rows(self, snapshot_id: Optional[int] = None, line: Optional[str] = None, limit: int = 80) -> List[Dict[str, Any]]:
        snapshot_id = snapshot_id or self.latest_snapshot_id()
        if not snapshot_id:
            return []
        limit = max(1, min(int(limit), 500))
        with self.connect() as con:
            snap = con.execute("SELECT window_id FROM snapshots WHERE id=?", (snapshot_id,)).fetchone()
            if not snap or snap["window_id"] is None:
                return []
            sql = """SELECT s.id AS snapshot_id,s.collected_at,lm.line,lm.product_model,lm.fpy,lm.check_fpy,lm.quantity,lm.total_defect_qty,
                            (SELECT COUNT(*) FROM defect_observations o WHERE o.snapshot_id=s.id AND o.line=lm.line) AS defect_rows,
                            (SELECT COUNT(*) FROM defect_observations o WHERE o.snapshot_id=s.id AND o.line=lm.line AND UPPER(COALESCE(o.repair_status_current,''))='N') AS repair_n,
                            (SELECT COUNT(*) FROM defect_entities de WHERE de.removed_from_latest=1 AND de.line=lm.line AND EXISTS(SELECT 1 FROM defect_observations ox JOIN snapshots sx ON sx.id=ox.snapshot_id WHERE ox.defect_key=de.defect_key AND sx.window_id=s.window_id)) AS removed_latest
                     FROM snapshots s JOIN line_metrics lm ON lm.snapshot_id=s.id
                     WHERE s.window_id=?"""
            params: List[Any] = [snap["window_id"]]
            if line:
                sql += " AND lm.line=?"; params.append(line)
            sql += " ORDER BY s.id DESC,lm.line LIMIT ?"; params.append(limit)
            rows = [dict(r) for r in con.execute(sql, params).fetchall()]
            for row in rows:
                top = con.execute(
                    """SELECT defect_code,defect_desc,COUNT(*) qty FROM defect_observations
                       WHERE snapshot_id=? AND line=? GROUP BY defect_code,defect_desc ORDER BY qty DESC,defect_code LIMIT 3""",
                    (row["snapshot_id"], row["line"]),
                ).fetchall()
                row["top3"] = [dict(x) for x in top]
            return rows

    def current_pcbas(self, snapshot_id: Optional[int] = None, line: Optional[str] = None,
                      only_unresolved: bool = False) -> List[str]:
        snapshot_id = snapshot_id or self.latest_snapshot_id()
        if not snapshot_id:
            return []
        sql = "SELECT DISTINCT pcba_sn FROM defect_observations WHERE snapshot_id=? AND pcba_sn IS NOT NULL AND pcba_sn<>\'\'"
        params: List[Any] = [snapshot_id]
        if line:
            sql += " AND line=?"
            params.append(line)
        if only_unresolved:
            sql += " AND UPPER(COALESCE(repair_status_current,\'N\'))=\'N\'"
        sql += " ORDER BY pcba_sn"
        with self.connect() as con:
            return [r[0] for r in con.execute(sql, params).fetchall()]

    def update_defect_status(self, snapshot_id: int, pcba_sn: str, defect_code: str | None,
                             defect_desc: str | None, repair_status: str | None,
                             defect_type: str | None, repair_state: str | None) -> int:
        with self.connect() as con:
            if defect_code:
                cur = con.execute(
                    """UPDATE defect_observations SET repair_status_current=?,defect_type_current=?,repair_state_current=?
                       WHERE snapshot_id=? AND pcba_sn=? AND defect_code=?""",
                    (repair_status, defect_type, repair_state, snapshot_id, pcba_sn, defect_code),
                )
            else:
                cur = con.execute(
                    """UPDATE defect_observations SET repair_status_current=?,defect_type_current=?,repair_state_current=?
                       WHERE snapshot_id=? AND pcba_sn=? AND LOWER(COALESCE(defect_desc,\'\'))=LOWER(?)""",
                    (repair_status, defect_type, repair_state, snapshot_id, pcba_sn, defect_desc or ""),
                )
            return int(cur.rowcount or 0)

    def record_repair_refresh(self, snapshot_id: int, pcba_sn: str, status: str,
                              payload: Any = None, error: str | None = None) -> None:
        with self.connect() as con:
            con.execute(
                """INSERT INTO repair_refreshes(snapshot_id,refreshed_at,pcba_sn,status,payload_json,error)
                   VALUES(?,?,?,?,?,?)""",
                (snapshot_id, utc_now(), pcba_sn, status, stable_json(payload) if payload is not None else None, error),
            )

    def base_rows(self, snapshot_id: Optional[int] = None, line: Optional[str] = None, limit: int = 5000) -> List[Dict[str, Any]]:
        return self.dataset_rows("defects", snapshot_id=snapshot_id, line=line, limit=limit)

    def dataset_catalog(self, snapshot_id: Optional[int] = None) -> List[Dict[str, Any]]:
        snapshot_id = snapshot_id or self.latest_snapshot_id()
        if not snapshot_id:
            return []
        specs = [
            ("defects", "Falhas atuais 3028", "defect_observations"),
            ("pcba_history", "Histórico PCBA 2114", "pcba_history"),
            ("history_contexts", "Contextos 2114 / correlação", "history_contexts"),
            ("material_reuse", "Reuso / vínculos 3074", "material_reuse"),
            ("process_events", "Processo / AT 3022", "process_events"),
            ("line_metrics", "FPY oficial por linha", "line_metrics"),
            ("repair_refreshes", "Atualizações AT / N-Y", "repair_refreshes"),
            ("audit_events", "Auditoria local", "audit_events"),
        ]
        out = []
        with self.connect() as con:
            for key, label, table in specs:
                if table == "audit_events":
                    n = con.execute("SELECT COUNT(*) n FROM audit_events WHERE snapshot_id=? OR snapshot_id IS NULL", (snapshot_id,)).fetchone()["n"]
                else:
                    n = con.execute(f"SELECT COUNT(*) n FROM {table} WHERE snapshot_id=?", (snapshot_id,)).fetchone()["n"]
                out.append({"dataset": key, "label": label, "rows": int(n)})
            snap = con.execute("SELECT window_id FROM snapshots WHERE id=?", (snapshot_id,)).fetchone()
            if snap and snap["window_id"] is not None:
                removed = con.execute(
                    """SELECT COUNT(DISTINCT de.defect_key) n FROM defect_entities de
                       WHERE de.removed_from_latest=1 AND EXISTS(
                         SELECT 1 FROM defect_observations o JOIN snapshots s ON s.id=o.snapshot_id
                         WHERE o.defect_key=de.defect_key AND s.window_id=?
                       )""", (snap["window_id"],)
                ).fetchone()["n"]
            else:
                removed = 0
            out.append({"dataset": "removed_defects", "label": "Removidas do export / validar AT", "rows": int(removed)})
            raw = con.execute("SELECT COUNT(*) n FROM snapshot_payloads WHERE snapshot_id=?", (snapshot_id,)).fetchone()["n"]
            out.append({"dataset": "raw_payloads", "label": "Payloads brutos preservados", "rows": int(raw)})
        return out

    def dataset_rows(self, dataset: str, snapshot_id: Optional[int] = None, line: Optional[str] = None,
                     limit: int = 5000) -> List[Dict[str, Any]]:
        snapshot_id = snapshot_id or self.latest_snapshot_id()
        if not snapshot_id:
            return []
        dataset = str(dataset or "defects")
        limit = max(1, min(int(limit), 100000))
        with self.connect() as con:
            if dataset == "removed_defects":
                snap = con.execute("SELECT window_id FROM snapshots WHERE id=?", (snapshot_id,)).fetchone()
                if not snap or snap["window_id"] is None:
                    return []
                sql = """SELECT de.defect_key,de.first_seen_at,de.last_seen_at,de.line,de.pcba_sn,de.defect_code,de.defect_desc,de.defect_time,de.product_model,
                                (SELECT o.repair_comment FROM defect_observations o JOIN snapshots so ON so.id=o.snapshot_id
                                 WHERE o.defect_key=de.defect_key AND so.window_id=? ORDER BY o.snapshot_id DESC LIMIT 1) AS repair_comment,
                                (SELECT o.repair_status_current FROM defect_observations o JOIN snapshots so ON so.id=o.snapshot_id
                                 WHERE o.defect_key=de.defect_key AND so.window_id=? ORDER BY o.snapshot_id DESC LIMIT 1) AS repair_status_current,
                                (SELECT o.defect_type_current FROM defect_observations o JOIN snapshots so ON so.id=o.snapshot_id
                                 WHERE o.defect_key=de.defect_key AND so.window_id=? ORDER BY o.snapshot_id DESC LIMIT 1) AS defect_type_current,
                                'REMOVED_FROM_LATEST' AS repair_state_current
                         FROM defect_entities de
                         WHERE de.removed_from_latest=1 AND EXISTS(
                           SELECT 1 FROM defect_observations o JOIN snapshots so ON so.id=o.snapshot_id
                           WHERE o.defect_key=de.defect_key AND so.window_id=?
                         )"""
                params: List[Any] = [snap["window_id"], snap["window_id"], snap["window_id"], snap["window_id"]]
                if line:
                    sql += " AND de.line=?"; params.append(line)
                sql += " ORDER BY de.line,de.defect_time LIMIT ?"; params.append(limit)
                return [dict(r) for r in con.execute(sql, params).fetchall()]
            if dataset == "defects":
                sql = "SELECT * FROM defect_observations WHERE snapshot_id=?"; params: List[Any] = [snapshot_id]
                if line:
                    sql += " AND line=?"; params.append(line)
                sql += " ORDER BY line,defect_time LIMIT ?"; params.append(limit)
                return [dict(r) for r in con.execute(sql, params).fetchall()]
            if dataset == "line_metrics":
                sql = "SELECT * FROM line_metrics WHERE snapshot_id=?"; params = [snapshot_id]
                if line:
                    sql += " AND line=?"; params.append(line)
                sql += " ORDER BY line,product_model LIMIT ?"; params.append(limit)
                return [dict(r) for r in con.execute(sql, params).fetchall()]
            if dataset == "pcba_history":
                # Derive line from the current-PCBA record whenever possible.
                sql = """SELECT h.*, COALESCE(
                           (SELECT o.line FROM defect_observations o WHERE o.snapshot_id=h.snapshot_id AND o.pcba_sn=h.pcba_sn AND o.line IS NOT NULL LIMIT 1),
                           (SELECT c.line FROM history_contexts c WHERE c.snapshot_id=h.snapshot_id AND c.historical_pcba=h.pcba_sn AND c.line IS NOT NULL LIMIT 1)
                         ) AS line
                         FROM pcba_history h WHERE h.snapshot_id=?"""; params = [snapshot_id]
                if line:
                    sql += " AND (EXISTS(SELECT 1 FROM defect_observations o WHERE o.snapshot_id=h.snapshot_id AND o.pcba_sn=h.pcba_sn AND o.line=?) OR EXISTS(SELECT 1 FROM history_contexts c WHERE c.snapshot_id=h.snapshot_id AND c.historical_pcba=h.pcba_sn AND c.line=?))"; params.extend([line,line])
                sql += " ORDER BY h.pcba_sn,h.hist_seq LIMIT ?"; params.append(limit)
                return [dict(r) for r in con.execute(sql, params).fetchall()]
            if dataset == "history_contexts":
                sql = "SELECT * FROM history_contexts WHERE snapshot_id=?"; params = [snapshot_id]
                if line:
                    sql += " AND line=?"; params.append(line)
                sql += " ORDER BY line,current_pcba,historical_pcba LIMIT ?"; params.append(limit)
                return [dict(r) for r in con.execute(sql, params).fetchall()]
            if dataset == "material_reuse":
                sql = """SELECT m.*, (SELECT o.line FROM defect_observations o
                           WHERE o.snapshot_id=m.snapshot_id AND o.pcba_sn=m.current_pcba_sn AND o.line IS NOT NULL LIMIT 1) AS line
                         FROM material_reuse m WHERE m.snapshot_id=?"""; params = [snapshot_id]
                if line:
                    sql += " AND EXISTS(SELECT 1 FROM defect_observations o WHERE o.snapshot_id=m.snapshot_id AND o.pcba_sn=m.current_pcba_sn AND o.line=?)"; params.append(line)
                sql += " ORDER BY m.current_pcba_sn,m.item_type,m.item_sn LIMIT ?"; params.append(limit)
                return [dict(r) for r in con.execute(sql, params).fetchall()]
            if dataset == "process_events":
                sql = """SELECT p.*, (SELECT o.line FROM defect_observations o
                           WHERE o.snapshot_id=p.snapshot_id AND o.pcba_sn=p.pcba_sn AND o.line IS NOT NULL LIMIT 1) AS line
                         FROM process_events p WHERE p.snapshot_id=?"""; params = [snapshot_id]
                if line:
                    sql += " AND EXISTS(SELECT 1 FROM defect_observations o WHERE o.snapshot_id=p.snapshot_id AND o.pcba_sn=p.pcba_sn AND o.line=?)"; params.append(line)
                sql += " ORDER BY p.pcba_sn,p.event_time LIMIT ?"; params.append(limit)
                return [dict(r) for r in con.execute(sql, params).fetchall()]
            if dataset == "repair_refreshes":
                sql = """SELECT rr.*, (SELECT o.line FROM defect_observations o
                           WHERE o.snapshot_id=rr.snapshot_id AND o.pcba_sn=rr.pcba_sn AND o.line IS NOT NULL LIMIT 1) AS line
                         FROM repair_refreshes rr WHERE rr.snapshot_id=?"""; params = [snapshot_id]
                if line:
                    sql += " AND EXISTS(SELECT 1 FROM defect_observations o WHERE o.snapshot_id=rr.snapshot_id AND o.pcba_sn=rr.pcba_sn AND o.line=?)"; params.append(line)
                sql += " ORDER BY rr.refreshed_at DESC LIMIT ?"; params.append(limit)
                return [dict(r) for r in con.execute(sql, params).fetchall()]
            if dataset == "audit_events":
                sql = "SELECT * FROM audit_events WHERE snapshot_id=? OR snapshot_id IS NULL"; params = [snapshot_id]
                if line:
                    sql += " AND (line=? OR line IS NULL)"; params.append(line)
                sql += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
                return [dict(r) for r in con.execute(sql, params).fetchall()]
            if dataset == "raw_payloads":
                return [dict(r) for r in con.execute(
                    "SELECT snapshot_id,kind,created_at,LENGTH(payload_json) AS payload_chars FROM snapshot_payloads WHERE snapshot_id=? LIMIT ?",
                    (snapshot_id, limit),
                ).fetchall()]
        raise ValueError(f"Dataset desconhecido: {dataset}")

    def search_cora(self, query: str, line: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
        words = [w for w in str(query or "").strip().split() if w]
        if not words:
            return []
        clauses = ["(LOWER(title) LIKE ? OR LOWER(body) LIKE ?)"] * len(words)
        params: List[Any] = []
        for w in words:
            like = f"%{w.lower()}%"
            params.extend([like, like])
        sql = "SELECT * FROM cora_documents WHERE " + " AND ".join(clauses)
        if line:
            # Strict line isolation by default: never leak another line's evidence
            # into an operational line-specific answer.
            sql += " AND line=?"
            params.append(line)
        sql += " ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)
        with self.connect() as con:
            return [dict(r) for r in con.execute(sql, params).fetchall()]

