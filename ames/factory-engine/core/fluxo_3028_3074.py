import hashlib
import json
from datetime import datetime
from pathlib import Path
from core.varredura_3074 import executar_varredura
from ames.coverage_3074 import classify_3074_page


def agrupar_falhas_por_pcba(records):
    out = {}
    for r in records:
        sn = r.get("pcba_sn")
        if sn:
            out.setdefault(sn, []).append(r)
    return out


def fingerprint_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _atomic_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)


def _defect_key(rec, index):
    raw = "|".join(str(rec.get(k) or "") for k in (
        "pcba_sn", "defect_time", "defect_code", "defect_desc", "repair_comment"
    ))
    return hashlib.sha1((raw + f"|{index}").encode("utf-8")).hexdigest()[:12]


def _new_checkpoint(source_path, parser_result, targets, source_hash):
    return {
        "version": "0.8.1",
        "analysis_mode": "TEMPORAL_DEFECT_TIME",
        "source_3028": str(source_path),
        "source_sha256": source_hash,
        "records_count": parser_result["records_count"],
        "unique_pcba_count": parser_result["unique_pcba_count"],
        "targets": targets,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "pcbas": {},
    }



def _incomplete_3074_result(trace):
    """A finished job is not proof of complete ExtJS paging/capture."""
    if not isinstance(trace, dict):
        return False
    if (trace.get("base_coverage") or {}).get("status") == "incomplete_page":
        return True
    if any((row.get("coverage") or {}).get("status") == "incomplete_page"
           or row.get("status") in {"HISTORICO_3074_PARCIAL", "ERRO_CONSULTA"}
           for row in (trace.get("results") or [])):
        return True
    return any((row.get("coverage") or {}).get("status") == "incomplete_page"
               for row in (trace.get("candidate_material_history") or []))



def executar_fluxo(
    arquivo3028,
    parser_result,
    tela3074,
    max_pcbas=1,
    progress_pcba=None,
    progress_component=None,
    checkpoint_path=None,
    query_memo=None,
    pause_s=0.25,
    defect_local_offset_hours=-3,
    grid_naive_offset_hours=0,
    progress_result=None,
):
    arquivo3028 = Path(arquivo3028)
    grupos = agrupar_falhas_por_pcba(parser_result["records"])
    sns = list(grupos.keys())
    if max_pcbas and max_pcbas > 0:
        sns = sns[:max_pcbas]

    source_hash = fingerprint_file(arquivo3028)
    checkpoint_path = Path(checkpoint_path) if checkpoint_path else None

    checkpoint = None
    if checkpoint_path and checkpoint_path.exists():
        try:
            loaded = json.loads(checkpoint_path.read_text(encoding="utf-8"))
            if loaded.get("source_sha256") == source_hash and loaded.get("version") == "0.8.1":
                checkpoint = loaded
        except Exception:
            checkpoint = None
    if checkpoint is None:
        checkpoint = _new_checkpoint(arquivo3028, parser_result, sns, source_hash)
    else:
        checkpoint["targets"] = sns
        checkpoint["updated_at"] = datetime.now().isoformat(timespec="seconds")

    if checkpoint_path:
        _atomic_json(checkpoint_path, checkpoint)

    query_memo = query_memo if query_memo is not None else {}

    for idx, sn in enumerate(sns, 1):
        state = checkpoint["pcbas"].get(sn, {})
        if state.get("status") == "COMPLETE":
            if progress_pcba:
                progress_pcba(idx, len(sns), sn, len(grupos[sn]), "CHECKPOINT_COMPLETE")
            continue

        if progress_pcba:
            progress_pcba(idx, len(sns), sn, len(grupos[sn]), "RUNNING")

        state.setdefault("pcba_sn", sn)
        state.setdefault("current_defects", grupos[sn])
        state.setdefault("defect_traces", {})
        state["status"] = "RUNNING"
        state["updated_at"] = datetime.now().isoformat(timespec="seconds")
        checkpoint["pcbas"][sn] = state
        if checkpoint_path:
            _atomic_json(checkpoint_path, checkpoint)

        try:
            # Uma unica consulta da PCBA e reutilizada para todas as falhas dessa PCBA.
            base_query = state.get("base_query")
            if not base_query or classify_3074_page(base_query)["status"] == "incomplete_page":
                base_query = tela3074.consultar(sn)
                state["base_query"] = base_query
                if checkpoint_path:
                    _atomic_json(checkpoint_path, checkpoint)

            defects = grupos[sn]
            for di, defect in enumerate(defects, 1):
                key = _defect_key(defect, di)
                dstate = state["defect_traces"].get(key, {})
                if dstate.get("status") == "COMPLETE":
                    continue

                defect_time = defect.get("defect_time")
                dstate.setdefault("defect_key", key)
                dstate.setdefault("defect", defect)
                dstate["status"] = "RUNNING"
                state["defect_traces"][key] = dstate

                def save_partial(partial_trace):
                    dstate["trace_3074"] = partial_trace
                    dstate["updated_at"] = datetime.now().isoformat(timespec="seconds")
                    state["defect_traces"][key] = dstate
                    state["updated_at"] = dstate["updated_at"]
                    checkpoint["pcbas"][sn] = state
                    checkpoint["updated_at"] = state["updated_at"]
                    if checkpoint_path:
                        _atomic_json(checkpoint_path, checkpoint)

                def comp_progress(ci, ct, item, source):
                    if progress_component:
                        progress_component(idx, len(sns), di, len(defects), ci, ct, sn, defect_time, item, source)

                trace = executar_varredura(
                    tela3074,
                    sn,
                    defect_time=defect_time,
                    progress=comp_progress,
                    checkpoint_cb=save_partial,
                    existing=dstate.get("trace_3074") or {},
                    query_memo=query_memo,
                    pause_s=pause_s,
                    base_query=base_query,
                    defect_local_offset_hours=defect_local_offset_hours,
                    grid_naive_offset_hours=grid_naive_offset_hours,
                )
                dstate["trace_3074"] = trace
                dstate["status"] = "PARTIAL" if _incomplete_3074_result(trace) else "COMPLETE"
                dstate["error"] = None
                dstate["updated_at"] = datetime.now().isoformat(timespec="seconds")
                state["defect_traces"][key] = dstate
                if checkpoint_path:
                    _atomic_json(checkpoint_path, checkpoint)

            state["status"] = ("PARTIAL" if
                classify_3074_page(state.get("base_query") or {})["status"] == "incomplete_page"
                or any(d.get("status") == "PARTIAL" for d in state["defect_traces"].values())
                else "COMPLETE")
            state["error"] = None

        except KeyboardInterrupt:
            state["status"] = "INTERRUPTED"
            state["error"] = "KeyboardInterrupt"
            state["updated_at"] = datetime.now().isoformat(timespec="seconds")
            checkpoint["pcbas"][sn] = state
            if checkpoint_path:
                _atomic_json(checkpoint_path, checkpoint)
            raise
        except Exception as exc:
            state["status"] = "ERROR"
            state["error"] = f"{type(exc).__name__}: {exc}"

        state["updated_at"] = datetime.now().isoformat(timespec="seconds")
        checkpoint["pcbas"][sn] = state
        checkpoint["updated_at"] = state["updated_at"]
        if checkpoint_path:
            _atomic_json(checkpoint_path, checkpoint)
        if progress_result:
            progress_result(idx, len(sns), {
                "pcba_sn": sn,
                "status": state.get("status", "PENDING"),
                "error": state.get("error"),
                "current_defects": state.get("current_defects", grupos.get(sn, [])),
                "base_query": state.get("base_query"),
                "defect_traces": list((state.get("defect_traces") or {}).values()),
            })

    items = []
    for sn in sns:
        state = checkpoint["pcbas"].get(sn, {})
        items.append({
            "pcba_sn": sn,
            "status": state.get("status", "PENDING"),
            "error": state.get("error"),
            "current_defects": state.get("current_defects", grupos.get(sn, [])),
            "base_query": state.get("base_query"),
            "defect_traces": list((state.get("defect_traces") or {}).values()),
        })

    completed = sum(1 for x in items if x["status"] == "COMPLETE")
    errors = sum(1 for x in items if x["status"] == "ERROR")
    return {
        "version": "0.8.1",
        "analysis_mode": "TEMPORAL_DEFECT_TIME",
        "source_3028": str(arquivo3028),
        "source_sha256": source_hash,
        "records_count": parser_result["records_count"],
        "unique_pcba_count": parser_result["unique_pcba_count"],
        "requested_pcba_count": len(sns),
        "processed_pcba_count": completed,
        "pcba_error_count": errors,
        "checkpoint_path": str(checkpoint_path) if checkpoint_path else None,
        "items": items,
    }
