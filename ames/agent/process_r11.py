"""R11-derived 3022 batch adapter for the canonical agent.

The collector remains read-only. It reuses the installed V0.16/R12 engine's
ames.tela_3022 implementation instead of reimplementing MES selectors here.
Factory R12 remains the promotion gate; this module deliberately refuses an
engine that does not expose the temporal-correlation contract proven in R11.
"""
from __future__ import annotations

import hashlib
import importlib
import json
import sys
import time
import types
from pathlib import Path
from typing import Any, Dict, Iterable, List

from mes_scheduler import session_object
import canonical
import process_timeline


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def engine_support(engine_dir: Path | None) -> Dict[str, Any]:
    if not engine_dir:
        return {"ready": False, "reason": "engine_missing"}
    engine_dir = Path(engine_dir).resolve()
    source = engine_dir / "ames" / "tela_3022.py"
    if not source.exists():
        return {"ready": False, "reason": "tela_3022_missing", "path": str(source)}
    if str(engine_dir) not in sys.path:
        sys.path.insert(0, str(engine_dir))
    try:
        mod = importlib.import_module("ames.tela_3022")
    except Exception as exc:
        return {"ready": False, "reason": "tela_3022_import_error", "error": f"{type(exc).__name__}: {exc}"}
    required = ("Tela3022", "correlacionar_falha_3022", "extrair_passagens_processo")
    missing = [name for name in required if not hasattr(mod, name)]
    return {
        "ready": not missing,
        "reason": "ok" if not missing else "r11_contract_missing",
        "missing": missing,
        "path": str(source),
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    }


def ensure_schema(store) -> None:
    with store.connect() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS process_defect_contexts(
          snapshot_id INTEGER NOT NULL,
          line TEXT NOT NULL,
          product_model TEXT,
          pcba_sn TEXT NOT NULL,
          defect_key TEXT NOT NULL,
          defect_code TEXT,
          defect_desc TEXT,
          defect_time TEXT,
          defect_time_utc TEXT,
          manual_or_auto_3028 TEXT,
          manual_or_auto_2114 TEXT,
          registration_mode TEXT,
          registration_mode_source TEXT,
          registration_mode_conflict INTEGER NOT NULL DEFAULT 0,
          failure_family TEXT,
          analysis_kind TEXT,
          reference_rule_id TEXT,
          reference_confidence TEXT,
          reference_station_code TEXT,
          reference_reason TEXT,
          reference_status TEXT,
          reference_event_time TEXT,
          reference_hist_seq TEXT,
          reference_pass_count_before_defect INTEGER NOT NULL DEFAULT 0,
          previous_operation_code TEXT,
          previous_operation_name TEXT,
          previous_station TEXT,
          previous_event_time TEXT,
          previous_hist_seq TEXT,
          previous_event_group TEXT,
          repair_action TEXT,
          repair_class TEXT,
          repair_event_time TEXT,
          return_a5201_event_time TEXT,
          next_reference_event_time TEXT,
          status TEXT,
          source TEXT NOT NULL DEFAULT '3022',
          details_json TEXT NOT NULL DEFAULT '{}',
          PRIMARY KEY(snapshot_id,line,defect_key)
        );
        CREATE INDEX IF NOT EXISTS idx_process_context_line ON process_defect_contexts(snapshot_id,line,pcba_sn,defect_time);
        """)


def patch_store(store) -> None:
    """Expose contexts through the existing /base catalog without changing Store ABI."""
    ensure_schema(store)
    if getattr(store, "_process_r11_patched", False):
        return
    original_catalog = store.dataset_catalog
    original_rows = store.dataset_rows

    def dataset_catalog(self, snapshot_id=None):
        out = list(original_catalog(snapshot_id))
        sid = snapshot_id or self.latest_snapshot_id()
        if sid:
            with self.connect() as con:
                count = int(con.execute("SELECT COUNT(*) n FROM process_defect_contexts WHERE snapshot_id=?", (sid,)).fetchone()["n"])
            out = [x for x in out if x.get("dataset") != "process_defect_contexts"]
            out.append({"dataset":"process_defect_contexts","label":"Contextos por falha / 3022","rows":count})
        return out

    def dataset_rows(self, dataset, snapshot_id=None, line=None, limit=5000):
        if str(dataset or "") != "process_defect_contexts":
            return original_rows(dataset, snapshot_id=snapshot_id, line=line, limit=limit)
        sid = snapshot_id or self.latest_snapshot_id()
        if not sid:
            return []
        limit = max(1, min(int(limit), 100000))
        sql = "SELECT * FROM process_defect_contexts WHERE snapshot_id=?"
        params = [sid]
        if line:
            sql += " AND line=?"; params.append(line)
        sql += " ORDER BY line,defect_time,pcba_sn LIMIT ?"; params.append(limit)
        with self.connect() as con:
            return [dict(r) for r in con.execute(sql, params).fetchall()]

    store.dataset_catalog = types.MethodType(dataset_catalog, store)
    store.dataset_rows = types.MethodType(dataset_rows, store)
    store._process_r11_patched = True


def _event_time_utc(engine_dir: Path, value: Any, grid_offset: float):
    temporal = importlib.import_module("core.temporal_3074")
    dt = temporal.grid_time_to_utc(value, grid_offset)
    return dt.isoformat() if dt else None


def _context_from_correlation(rec: Dict[str, Any], correlated: Dict[str, Any]) -> Dict[str, Any]:
    ref = correlated.get("reference_process") or {}
    prev = correlated.get("previous_process") or {}
    cycle = correlated.get("repair_cycle") or {}
    refsel = correlated.get("reference_selection") or {}
    repair = cycle.get("repair_event") or {}
    ret = cycle.get("return_a5201") or {}
    nxt = cycle.get("next_reference_passage") or {}
    stations = correlated.get("reference_stations") or []
    return {
        "line": rec.get("line"), "product_model": rec.get("product_model"), "pcba_sn": rec.get("pcba_sn"),
        "defect_key": rec.get("defect_key"), "defect_code": rec.get("defect_code"), "defect_desc": rec.get("defect_desc"),
        "defect_time": rec.get("defect_time"), "defect_time_utc": correlated.get("defect_time_utc"),
        "manual_or_auto_3028": rec.get("manual_or_auto"), "manual_or_auto_2114": None,
        "registration_mode": correlated.get("registration_mode"), "registration_mode_source": correlated.get("registration_mode_source"),
        "registration_mode_conflict": False, "failure_family": correlated.get("failure_family"),
        "analysis_kind": correlated.get("analysis_kind"), "reference_rule_id": correlated.get("reference_rule_id"),
        "reference_confidence": correlated.get("reference_confidence"), "reference_station_code": stations[0] if stations else None,
        "reference_reason": correlated.get("reference_reason"), "reference_status": refsel.get("status"),
        "reference_event_time": ref.get("event_time_utc") or ref.get("event_time"), "reference_hist_seq": ref.get("hist_seq"),
        "reference_pass_count_before_defect": int(refsel.get("prior_count") or 0),
        "previous_operation_code": prev.get("operation_code"), "previous_operation_name": prev.get("operation_name"),
        "previous_station": prev.get("station"), "previous_event_time": prev.get("event_time_utc") or prev.get("event_time"),
        "previous_hist_seq": prev.get("hist_seq"), "previous_event_group": prev.get("event_group"),
        "repair_action": cycle.get("repair_action"), "repair_class": cycle.get("repair_action_class"),
        "repair_event_time": repair.get("event_time_utc") or repair.get("event_time"),
        "return_a5201_event_time": ret.get("event_time_utc") or ret.get("event_time"),
        "next_reference_event_time": nxt.get("event_time_utc") or nxt.get("event_time"),
        "status": correlated.get("status"), "source": "3022",
    }


def _persist_contexts(store, snapshot_id: int, contexts: Iterable[Dict[str, Any]]) -> None:
    cols = [
        "snapshot_id","line","product_model","pcba_sn","defect_key","defect_code","defect_desc","defect_time","defect_time_utc",
        "manual_or_auto_3028","manual_or_auto_2114","registration_mode","registration_mode_source","registration_mode_conflict",
        "failure_family","analysis_kind","reference_rule_id","reference_confidence","reference_station_code","reference_reason",
        "reference_status","reference_event_time","reference_hist_seq","reference_pass_count_before_defect","previous_operation_code",
        "previous_operation_name","previous_station","previous_event_time","previous_hist_seq","previous_event_group","repair_action",
        "repair_class","repair_event_time","return_a5201_event_time","next_reference_event_time","status","source","details_json"
    ]
    sql = "INSERT OR REPLACE INTO process_defect_contexts("+",".join(cols)+") VALUES("+",".join("?" for _ in cols)+")"
    with store.connect() as con:
        for ctx in contexts:
            if not ctx.get("defect_key") or not ctx.get("line") or not ctx.get("pcba_sn"):
                continue
            row = {**ctx,"snapshot_id":int(snapshot_id),"registration_mode_conflict":int(bool(ctx.get("registration_mode_conflict"))),"details_json":_json({"temporal_only":True,"root_cause":False})}
            con.execute(sql, [row.get(k) for k in cols])


def _persist_legacy_events(store, snapshot_id: int, pcba: str, passages: Iterable[Dict[str, Any]]) -> None:
    with store.connect() as con:
        con.execute("DELETE FROM process_events WHERE snapshot_id=? AND pcba_sn=? AND source='3022'", (int(snapshot_id), pcba))
        for p in passages:
            con.execute(
                """INSERT INTO process_events(snapshot_id,pcba_sn,station,operation_code,operation_name,event_time,event_group,source,raw_json)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                (int(snapshot_id),pcba,p.get("station"),p.get("operation_code"),p.get("operation_name"),p.get("event_time"),p.get("event_group"),"3022",_json(p.get("raw") or {})),
            )


def collect_and_persist(store, engine_dir: Path, records: List[Dict[str, Any]], *, snapshot_id: int, line: str,
                        max_pcbas: int = 0, performance: str = "balanced", line_callback=None, event_callback=None) -> Dict[str, Any]:
    support = engine_support(engine_dir)
    if not support.get("ready"):
        raise RuntimeError("Motor 3022 não possui o contrato R11/R12 exigido: " + _json(support))
    engine_dir = Path(engine_dir).resolve()
    if str(engine_dir) not in sys.path:
        sys.path.insert(0, str(engine_dir))
    browser_mod = importlib.import_module("ames.browser")
    navigation_mod = importlib.import_module("ames.navigation")
    tela3022_mod = importlib.import_module("ames.tela_3022")
    settings = {}
    try: settings = json.loads((engine_dir/"config"/"settings.json").read_text(encoding="utf-8"))
    except Exception: pass
    time_cfg = settings.get("mes_time", {}) or {}
    defect_offset = float(time_cfg.get("defect_local_utc_offset_hours", -3))
    grid_offset = float(time_cfg.get("grid_naive_utc_offset_hours", 0))
    perf = str(performance or "balanced").lower()
    pause = 0.0 if perf == "fast" else (0.12 if perf == "safe" else 0.03)
    by_pcba: Dict[str,List[Dict[str,Any]]] = {}
    for rec in records or []:
        pcba = str((rec or {}).get("pcba_sn") or "").strip()
        if pcba: by_pcba.setdefault(pcba, []).append(dict(rec))
    targets = list(by_pcba)
    if max_pcbas: targets = targets[:max(0,int(max_pcbas))]
    entries=[];all_contexts=[];event_count=0;warnings=[]
    browser = session_object(browser_mod.AmesBrowser(engine_dir)).connect()
    try:
        nav = session_object(navigation_mod.AmesNavigation(browser._target))
        if targets:
            if line_callback: line_callback("3022 preparando AWIP3022 / View Lot History")
            nav.ensure_3022()
        tela = session_object(tela3022_mod.Tela3022(browser._target, engine_dir)) if targets else None
        if tela: tela._page()
        for i,pcba in enumerate(targets,1):
            try:
                if line_callback: line_callback(f"3022 [{i}/{len(targets)}] {pcba}")
                rr = tela.consultar(pcba)
                rows = rr.get("rows") or []
                passages = list(rr.get("process_passages") or tela3022_mod.extrair_passagens_processo(rows))
                contexts=[]
                context_by_pass={}
                for rec in by_pcba.get(pcba,[]):
                    corr = tela3022_mod.correlacionar_falha_3022(
                        engine_dir, rows, rec, registration_value=rec.get("manual_or_auto"), registration_source="3028",
                        defect_local_offset_hours=defect_offset, event_naive_offset_hours=grid_offset)
                    ctx = _context_from_correlation(rec,corr); contexts.append(ctx); all_contexts.append(ctx)
                    chosen = corr.get("reference_process") or corr.get("previous_process") or {}
                    chosen_time = chosen.get("event_time_utc") or chosen.get("event_time")
                    if chosen_time:
                        context_by_pass.setdefault(str(chosen_time),[]).append({k:v for k,v in ctx.items() if k not in {"details_json"}})
                _persist_legacy_events(store,snapshot_id,pcba,passages)
                _persist_contexts(store,snapshot_id,contexts)
                products=sorted({canonical.cph(r.get("product_model")) for r in by_pcba.get(pcba,[]) if canonical.cph(r.get("product_model"))})
                for product in products:
                    events=[]
                    for p in passages:
                        event_time=_event_time_utc(engine_dir,p.get("event_time"),grid_offset)
                        if not event_time: continue
                        hist=p.get("hist_seq")
                        op=str(p.get("operation_code") or p.get("station") or "").strip()
                        if not op: continue
                        raw_key=[snapshot_id,line,product,pcba,op,event_time,hist]
                        event_id=hashlib.sha256(_json(raw_key).encode()).hexdigest()[:32]
                        adapter={
                            "contract":"R11_DERIVED_REQUIRES_R12_FACTORY_GATE","hist_seq":hist,
                            "current_operation_code":p.get("current_operation_code"),"event_group":p.get("event_group"),
                            "defect_contexts":context_by_pass.get(event_time,[]),
                        }
                        events.append({
                            "event_id":event_id,"line_id":line,"product":product,"pcba_sn":pcba,
                            "process":p.get("operation_name") or op,"station":op,"event_time":event_time,"source_view":"3022",
                            "snapshot_id":int(snapshot_id),"snapshot_revision":1,
                            "provenance":adapter,"raw_ref":f"sqlite:3022:{snapshot_id}:{pcba}:{hist}:{event_id}",
                            "coverage":{"status":"partial","source_complete":False},"valid":True,
                        })
                    if events:
                        process_timeline.ingest(store,events);event_count += len(events)
                entries.append({"pcba_sn":pcba,"status":"COMPLETE","events":len(passages),"contexts":len(contexts)})
                if event_callback:event_callback({"stage":"3022","kind":"pcba","current":i,"total":len(targets),"pcba":pcba,"status":"COMPLETE","events":len(passages)})
            except Exception as exc:
                err=f"{type(exc).__name__}: {exc}";warnings.append(f"3022 {pcba}: {err}");entries.append({"pcba_sn":pcba,"status":"ERROR","error":err})
                if event_callback:event_callback({"stage":"3022","kind":"pcba","current":i,"total":len(targets),"pcba":pcba,"status":"ERROR","error":err})
            if pause: time.sleep(pause)
    finally:
        browser.disconnect()
    store.rebuild_cora_index(int(snapshot_id))
    return {"source":"3022","contract":"R11_DERIVED_REQUIRES_R12_FACTORY_GATE","pcbas":entries,"events":event_count,"contexts":len(all_contexts),"warnings":warnings,"support":support}
