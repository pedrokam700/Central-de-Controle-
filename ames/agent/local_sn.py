from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List

import repair_3012
import production_shift
from operator_evidence import operator_evidence


def _dedupe(rows: Iterable[Dict[str, Any]], keys: Iterable[str]) -> List[Dict[str, Any]]:
    out=[];seen=set();keys=list(keys)
    for row in rows:
        key=tuple(str(row.get(k) or "") for k in keys)
        if key in seen:continue
        seen.add(key);out.append(row)
    return out


def _json_object(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        parsed=json.loads(value or "{}")
        return parsed if isinstance(parsed,dict) else {}
    except Exception:
        return {}


def _hydrate_history(row: Dict[str, Any]) -> Dict[str, Any]:
    """Restore useful 2114 fields kept in raw_json without inventing values."""
    out=dict(row or {})
    raw=_json_object(out.get("raw_json") or out.get("raw"))
    out["raw"]=raw or out.get("raw") or {}
    mapping={
        "defect_time":("Defect Time","defect_time"),
        "defect_code":("Defect Code","defect_code"),
        "defect_desc":("Defect Description","defect_desc"),
        "manual_or_auto":("Manual/Automatic","manual_or_auto"),
        "repair_status":("Repair Status","repair_status"),
        "defect_type":("Defect Type","defect_type"),
    }
    for target,aliases in mapping.items():
        if out.get(target) not in (None,""):
            continue
        for alias in aliases:
            if raw.get(alias) not in (None,""):
                out[target]=raw.get(alias);break
    return out


def _hydrate_process(row: Dict[str, Any]) -> Dict[str, Any]:
    """Expose only operator/name fields explicitly returned by 3022 raw evidence."""
    out=dict(row or {})
    raw=_json_object(out.get("raw_json") or out.get("raw"))
    evidence=operator_evidence(raw)
    for key in ("operator_id","operator_name","station","operation_name","event_time"):
        if out.get(key) in (None,"") and evidence.get(key) not in (None,""):
            out[key]=evidence.get(key)
    out["operator_fields"]=evidence.get("operator_fields") or out.get("operator_fields") or {}
    out["raw"]=raw or out.get("raw") or {}
    return out


def lookup(store, sn: str, *, limit: int = 5000) -> Dict[str, Any]:
    sn=str(sn or "").strip()
    if not sn:raise ValueError("Informe uma SN")
    limit=max(1,min(int(limit or 5000),50000))
    repair_3012.ensure_schema(store)
    with store.connect() as con:
        direct_defects=[dict(r) for r in con.execute("SELECT * FROM defect_observations WHERE pcba_sn=? ORDER BY snapshot_id DESC,defect_time DESC LIMIT ?",(sn,limit)).fetchall()]
        direct_hist=[_hydrate_history(dict(r)) for r in con.execute("SELECT * FROM pcba_history WHERE pcba_sn=? ORDER BY snapshot_id DESC,hist_seq DESC LIMIT ?",(sn,limit)).fetchall()]
        direct_material=[dict(r) for r in con.execute("SELECT * FROM material_reuse WHERE current_pcba_sn=? OR item_sn=? ORDER BY snapshot_id DESC,id DESC LIMIT ?",(sn,sn,limit)).fetchall()]

    cached_lookup=None;cached_at=None
    with store.connect() as con:
        cached=con.execute("SELECT result_json,finished_at FROM jobs WHERE kind='sn_lookup' AND status='done' AND json_valid(result_json) AND json_extract(config_json,'$.sn')=? ORDER BY finished_at DESC LIMIT 1",(sn,)).fetchone()
        if cached:cached_lookup=json.loads(cached['result_json']);cached_at=cached['finished_at']
    material_query=any(str(r.get("item_sn") or "").strip()==sn for r in direct_material) and not (direct_defects or direct_hist)
    targets=[];seen=set()
    def add(value):
        value=str(value or "").strip()
        if value and value not in seen:seen.add(value);targets.append(value)
    if not material_query:add(sn)
    for row in direct_material:
        add(row.get("current_pcba_sn"))
        for key in ("previous_pcbas_json","inactive_now_pcbas_json","active_now_pcbas_json"):
            try:values=json.loads(row.get(key) or "[]")
            except Exception:values=[]
            for value in values:add(value)
    if not targets:add(sn)

    with store.connect() as con:
        marks=",".join("?" for _ in targets)
        histories=[_hydrate_history(dict(r)) for r in con.execute(f"SELECT * FROM pcba_history WHERE pcba_sn IN ({marks}) ORDER BY snapshot_id DESC,hist_seq DESC LIMIT ?",[*targets,limit]).fetchall()] if targets else []
        defects=[dict(r) for r in con.execute(f"SELECT * FROM defect_observations WHERE pcba_sn IN ({marks}) ORDER BY snapshot_id DESC,defect_time DESC LIMIT ?",[*targets,limit]).fetchall()] if targets else []
        process=[_hydrate_process(dict(r)) for r in con.execute(f"SELECT * FROM process_events WHERE pcba_sn IN ({marks}) ORDER BY event_time DESC LIMIT ?",[*targets,limit]).fetchall()] if targets else []
        contexts=[dict(r) for r in con.execute(f"SELECT * FROM history_contexts WHERE current_pcba IN ({marks}) OR historical_pcba IN ({marks}) ORDER BY snapshot_id DESC,id DESC LIMIT ?",[*targets,*targets,limit]).fetchall()] if targets else []

    if cached_lookup:
        for h in (cached_lookup.get('trace_2114') or {}).get('pcbas') or []:
            for r in (h.get('result') or {}).get('rows') or []:
                histories.append({'pcba_sn':h.get('pcba_sn'),'hist_seq':r.get('Defect Hist Seq'),'defect_code':r.get('Defect Code'),'defect_desc':r.get('Defect Description'),'defect_time':r.get('Defect Time'),'repair_status':r.get('Repair Status'),'manual_or_auto':r.get('Manual/Automatic'),'defect_type':r.get('Defect Type'),'source':'2114','raw':r})
            add(h.get('pcba_sn'))
        cached3022=cached_lookup.get('trace_3022') or {}
        process.extend(_hydrate_process(r) for r in (cached3022.get('process_passages') or []))
        process.extend(_hydrate_process(r) for r in (cached3022.get('operator_evidence') or []))
        for m in (cached_lookup.get('trace_3074') or {}).get('reused_components') or []:
            direct_material.append({**m,'current_pcba_sn':sn,'previous_pcbas_json':json.dumps(m.get('previous_pcbas') or []),'source':'3074'})
    for row in process:
        if not row.get('production_shift_source'):
            # Canonical timestamp has explicit offset; legacy naive grid is UTC by engine contract.
            row.update(production_shift.classify(row.get('event_time'),naive_offset=0))
    repairs=[]
    for target in targets:
        repairs.extend(repair_3012.history(store,sn=target,limit=min(limit,5000)))

    defects=_dedupe(defects,["defect_key"])
    histories=_dedupe(histories,["pcba_sn","hist_seq","defect_code","defect_desc","defect_time"])
    process=_dedupe(process,["pcba_sn","station","operation_code","event_time","operator_id","operator_name"])
    repairs=_dedupe(repairs,["row_key"])
    materials=_dedupe(direct_material,["current_pcba_sn","item_sn","current_defect_key","bind_time_utc","unbind_time_utc"])
    return {
        "source":"LOCAL_SQLITE",
        "cached_lookup":cached_lookup,"cached_at":cached_at,
        "coverage_note":"Somente evidencias armazenadas; ausencia local nao prova ausencia no MES",
        "offline":True,
        "query_sn":sn,
        "detected_type":"MATERIAL_SN" if material_query else ("PCBA" if defects or histories or process or repairs else "SN_INDETERMINADO"),
        "targets":targets,
        "summary":{
            "pcbas_related":len(targets),"defects_3028":len(defects),"history_2114":len(histories),"material_links_3074":len(materials),"process_3022":len(process),"repair_3012":len(repairs),
        },
        "defects":defects,
        "pcba_history":histories,
        "material_reuse":materials,
        "history_contexts":contexts,
        "process_events":process,
        "repair_3012":repairs,
        "coverage":{
            "3028":bool(defects),"3074":bool(materials),"2114":bool(histories),"3022":bool(process),"3012":bool(repairs),
        },
    }
