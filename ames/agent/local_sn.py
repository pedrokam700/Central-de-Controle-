from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List

import repair_3012


def _dedupe(rows: Iterable[Dict[str, Any]], keys: Iterable[str]) -> List[Dict[str, Any]]:
    out=[];seen=set();keys=list(keys)
    for row in rows:
        key=tuple(str(row.get(k) or "") for k in keys)
        if key in seen:continue
        seen.add(key);out.append(row)
    return out


def lookup(store, sn: str, *, limit: int = 5000) -> Dict[str, Any]:
    sn=str(sn or "").strip()
    if not sn:raise ValueError("Informe uma SN")
    limit=max(1,min(int(limit or 5000),50000))
    repair_3012.ensure_schema(store)
    with store.connect() as con:
        direct_defects=[dict(r) for r in con.execute("SELECT * FROM defect_observations WHERE pcba_sn=? ORDER BY snapshot_id DESC,defect_time DESC LIMIT ?",(sn,limit)).fetchall()]
        direct_hist=[dict(r) for r in con.execute("SELECT * FROM pcba_history WHERE pcba_sn=? ORDER BY snapshot_id DESC,hist_seq DESC LIMIT ?",(sn,limit)).fetchall()]
        direct_material=[dict(r) for r in con.execute("SELECT * FROM material_reuse WHERE current_pcba_sn=? OR item_sn=? ORDER BY snapshot_id DESC,id DESC LIMIT ?",(sn,sn,limit)).fetchall()]

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
        histories=[dict(r) for r in con.execute(f"SELECT * FROM pcba_history WHERE pcba_sn IN ({marks}) ORDER BY snapshot_id DESC,hist_seq DESC LIMIT ?",[*targets,limit]).fetchall()] if targets else []
        defects=[dict(r) for r in con.execute(f"SELECT * FROM defect_observations WHERE pcba_sn IN ({marks}) ORDER BY snapshot_id DESC,defect_time DESC LIMIT ?",[*targets,limit]).fetchall()] if targets else []
        process=[dict(r) for r in con.execute(f"SELECT * FROM process_events WHERE pcba_sn IN ({marks}) ORDER BY event_time DESC LIMIT ?",[*targets,limit]).fetchall()] if targets else []
        contexts=[dict(r) for r in con.execute(f"SELECT * FROM history_contexts WHERE current_pcba IN ({marks}) OR historical_pcba IN ({marks}) ORDER BY snapshot_id DESC,id DESC LIMIT ?",[*targets,*targets,limit]).fetchall()] if targets else []

    repairs=[]
    for target in targets:
        repairs.extend(repair_3012.history(store,sn=target,limit=min(limit,5000)))

    defects=_dedupe(defects,["defect_key"])
    histories=_dedupe(histories,["pcba_sn","hist_seq","defect_code","defect_desc"])
    process=_dedupe(process,["pcba_sn","station","operation_code","event_time"])
    repairs=_dedupe(repairs,["row_key"])
    materials=_dedupe(direct_material,["current_pcba_sn","item_sn","current_defect_key"])
    return {
        "source":"LOCAL_SQLITE",
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
