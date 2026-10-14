import hashlib
import json
import time
from datetime import datetime
from pathlib import Path


SHIFT_UNCONFIRMED = "SHIFT_UNCONFIRMED"


def _atomic_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)


def _ctx_key(ctx):
    raw = "|".join(str(ctx.get(k) or "") for k in (
        "historical_pcba", "current_pcba", "material_sn", "defect_time", "defect_code", "defect_desc"
    ))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _current_ctx_key(ctx):
    raw = "|".join(str(ctx.get(k) or "") for k in (
        "current_pcba", "defect_time", "defect_code", "defect_desc"
    ))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def extrair_contextos_2114(resultado_3074):
    """Compatibilidade: retorna contextos HISTÓRICOS de material/PCBA."""
    contexts = []
    targets = []
    seen_targets = set()

    for item in resultado_3074.get("items", []) or []:
        current_pcba = item.get("pcba_sn", "")
        for dstate in item.get("defect_traces", []) or []:
            if dstate.get("status") not in (None, "COMPLETE"):
                continue
            defect = dstate.get("defect", {}) or {}
            trace = dstate.get("trace_3074", {}) or {}
            for r in trace.get("results", []) or []:
                if r.get("error"):
                    continue
                previous = [str(x).strip() for x in (r.get("previous_pcbas") or []) if str(x).strip()]
                if not previous:
                    continue

                for use_index, historical_pcba in enumerate(previous, 1):
                    ctx = {
                        "historical_pcba": historical_pcba,
                        "historical_use_index": use_index,
                        "previous_pcba_count": len(previous),
                        "current_pcba": current_pcba,
                        "material_sn": r.get("item_sn", ""),
                        "material_type": r.get("item_type", ""),
                        "material_status_at_defect": r.get("status", ""),
                        "known_total_uses_now": r.get("total_pcba_count_known_now"),
                        "known_reuse_count_now": r.get("reuse_count_known_now"),
                        "active_now_pcbas": list(r.get("active_now_pcbas") or []),
                        "defect_time": defect.get("defect_time", ""),
                        "defect_code": defect.get("defect_code", ""),
                        "defect_desc": defect.get("defect_desc", ""),
                        "repair_comment": defect.get("repair_comment", ""),
                        "line": defect.get("line", ""),
                        "product_model": defect.get("product_model", ""),
                    }
                    ctx["context_key"] = _ctx_key(ctx)
                    contexts.append(ctx)
                    if historical_pcba not in seen_targets:
                        seen_targets.add(historical_pcba)
                        targets.append(historical_pcba)

    return {
        "targets": targets,
        "contexts": contexts,
        "target_count": len(targets),
        "context_count": len(contexts),
    }


def extrair_contextos_pcbas_atuais(resultado_3074):
    """Uma entrada por falha atual da 3028, apontando para a própria PCBA.

    Essa consulta é essencial para detectar múltiplas falhas/reincidências da
    própria placa, não apenas falhas das PCBAs históricas ligadas a materiais.
    """
    contexts = []
    targets = []
    seen = set()
    for item in resultado_3074.get("items", []) or []:
        current_pcba = str(item.get("pcba_sn") or "").strip()
        if not current_pcba:
            continue
        for dstate in item.get("defect_traces", []) or []:
            if dstate.get("status") not in (None, "COMPLETE"):
                continue
            defect = dstate.get("defect", {}) or {}
            ctx = {
                "current_pcba": current_pcba,
                "defect_time": defect.get("defect_time", ""),
                "defect_code": defect.get("defect_code", ""),
                "defect_desc": defect.get("defect_desc", ""),
                "repair_comment": defect.get("repair_comment", ""),
                "line": defect.get("line", ""),
                "product_model": defect.get("product_model", ""),
            }
            ctx["context_key"] = _current_ctx_key(ctx)
            contexts.append(ctx)
        if current_pcba not in seen:
            seen.add(current_pcba)
            targets.append(current_pcba)
    return {
        "targets": targets,
        "contexts": contexts,
        "target_count": len(targets),
        "context_count": len(contexts),
    }


def extrair_plano_2114_completo(resultado_3074):
    historical = extrair_contextos_2114(resultado_3074)
    current = extrair_contextos_pcbas_atuais(resultado_3074)
    targets = []
    seen = set()
    for pcba in list(historical["targets"]) + list(current["targets"]):
        if pcba and pcba not in seen:
            seen.add(pcba)
            targets.append(pcba)
    return {
        "targets": targets,
        "historical_targets": historical["targets"],
        "current_targets": current["targets"],
        "historical_contexts": historical["contexts"],
        "current_contexts": current["contexts"],
        "target_count": len(targets),
        "historical_target_count": historical["target_count"],
        "current_target_count": current["target_count"],
        "historical_context_count": historical["context_count"],
        "current_context_count": current["context_count"],
    }


def _new_checkpoint(source_sha256, targets, shift):
    now = datetime.now().isoformat(timespec="seconds")
    return {
        "version": "0.11",
        "source_sha256": source_sha256,
        "shift": shift,
        "targets": list(targets),
        "created_at": now,
        "updated_at": now,
        "pcbas": {},
    }


def _seed_from_result(checkpoint, seed_result):
    if not seed_result:
        return
    for item in seed_result.get("pcbas", []) or []:
        pcba = str(item.get("pcba_sn") or "").strip()
        if not pcba or item.get("status") != "COMPLETE":
            continue
        checkpoint["pcbas"][pcba] = {
            "pcba_sn": pcba,
            "status": "COMPLETE",
            "error": None,
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "result": item.get("result"),
        }


def _seed_from_checkpoint_path(checkpoint, seed_path, source_sha256, shift):
    if not seed_path:
        return
    seed_path = Path(seed_path)
    if not seed_path.exists():
        return
    try:
        data = json.loads(seed_path.read_text(encoding="utf-8"))
    except Exception:
        return
    if data.get("source_sha256") != source_sha256 or data.get("shift") != shift:
        return
    for pcba, state in (data.get("pcbas") or {}).items():
        if state.get("status") == "COMPLETE":
            checkpoint["pcbas"][pcba] = state


def _unavailable_result(plan, source_sha256, checkpoint_path, reason):
    """Return explicit 2114 source failure without discarding the 3074 result.

    Composite collection treats 2114 as enrichment.  The source is still strict:
    no SN is submitted while Shift is unconfirmed, but the caller receives a
    structured partial result instead of an exception that aborts every source.
    """
    now = datetime.now().isoformat(timespec="seconds")
    targets = list(plan["targets"])
    pcbas = [{"pcba_sn": pcba, "status": "ERROR", "error": reason, "result": None} for pcba in targets]
    if checkpoint_path:
        checkpoint = _new_checkpoint(source_sha256, targets, None)
        checkpoint["source_status"] = "ERROR"
        checkpoint["source_error"] = reason
        for pcba in targets:
            checkpoint["pcbas"][pcba] = {
                "pcba_sn": pcba,
                "status": "ERROR",
                "error": reason,
                "updated_at": now,
                "result": None,
            }
        checkpoint["updated_at"] = now
        _atomic_json(checkpoint_path, checkpoint)
    return {
        "version": "0.11",
        "status": "partial",
        "source_status": "ERROR",
        "source_error": reason,
        "shift": None,
        "source_sha256": source_sha256,
        "requested_pcba_count": len(targets),
        "processed_pcba_count": 0,
        "pcba_error_count": len(targets),
        "pcba_no_data_count": 0,
        "historical_target_count": plan["historical_target_count"],
        "current_target_count": plan["current_target_count"],
        "context_count": plan["historical_context_count"],
        "current_context_count": plan["current_context_count"],
        "checkpoint_path": str(checkpoint_path) if checkpoint_path else None,
        "contexts": plan["historical_contexts"],
        "current_contexts": plan["current_contexts"],
        "historical_targets": plan["historical_targets"],
        "current_targets": plan["current_targets"],
        "pcbas": pcbas,
    }


def executar_fluxo_2114(
    resultado_3074,
    tela2114,
    source_sha256="",
    checkpoint_path=None,
    progress=None,
    pause_s=0.25,
    seed_result=None,
    seed_checkpoint_path=None,
    include_current=False,
):
    """Consulta 2114 sem transformar uma fonte indisponível em falha global.

    - deduplica todas as PCBAs;
    - reaproveita resultado V0.10 como seed;
    - salva checkpoint V0.11 por PCBA;
    - erro isolado não aborta o lote;
    - Shift ausente retorna estado parcial estruturado, preservando 3074/3022.
    """
    if include_current:
        plan = extrair_plano_2114_completo(resultado_3074)
    else:
        historical = extrair_contextos_2114(resultado_3074)
        plan = {
            "targets": historical["targets"],
            "historical_targets": historical["targets"],
            "current_targets": [],
            "historical_contexts": historical["contexts"],
            "current_contexts": [],
            "target_count": historical["target_count"],
            "historical_target_count": historical["target_count"],
            "current_target_count": 0,
            "historical_context_count": historical["context_count"],
            "current_context_count": 0,
        }
    targets = plan["targets"]
    checkpoint_path = Path(checkpoint_path) if checkpoint_path else None

    shift = tela2114.turno_atual()
    if not shift or shift == SHIFT_UNCONFIRMED:
        reason = (
            "2114 indisponível nesta execução: Shift não confirmado no campo principal. "
            "3074/3022 podem continuar; nenhuma consulta 2114 foi enviada."
        )
        if progress:
            for idx, pcba in enumerate(targets, 1):
                progress(idx, len(targets), pcba, "ERROR", {
                    "pcba_sn": pcba, "status": "ERROR", "error": reason, "result": None,
                })
        return _unavailable_result(plan, source_sha256, checkpoint_path, reason)

    checkpoint = None
    if checkpoint_path and checkpoint_path.exists():
        try:
            loaded = json.loads(checkpoint_path.read_text(encoding="utf-8"))
            if (
                loaded.get("version") == "0.11"
                and loaded.get("source_sha256") == source_sha256
                and loaded.get("shift") == shift
            ):
                checkpoint = loaded
        except Exception:
            checkpoint = None

    if checkpoint is None:
        checkpoint = _new_checkpoint(source_sha256, targets, shift)
        _seed_from_checkpoint_path(checkpoint, seed_checkpoint_path, source_sha256, shift)
        _seed_from_result(checkpoint, seed_result)
    else:
        _seed_from_result(checkpoint, seed_result)

    checkpoint["targets"] = list(targets)
    checkpoint["updated_at"] = datetime.now().isoformat(timespec="seconds")
    if checkpoint_path:
        _atomic_json(checkpoint_path, checkpoint)

    for idx, pcba in enumerate(targets, 1):
        state = checkpoint["pcbas"].get(pcba, {})
        if state.get("status") == "COMPLETE":
            if progress:
                progress(idx, len(targets), pcba, "CHECKPOINT_COMPLETE", state)
            continue

        state = {
            "pcba_sn": pcba,
            "status": "RUNNING",
            "error": None,
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "result": state.get("result"),
        }
        checkpoint["pcbas"][pcba] = state
        checkpoint["updated_at"] = state["updated_at"]
        if checkpoint_path:
            _atomic_json(checkpoint_path, checkpoint)
        if progress:
            progress(idx, len(targets), pcba, "RUNNING", state)

        try:
            result = tela2114.consultar(pcba)
            state["result"] = result
            state["status"] = "COMPLETE"
            state["error"] = None
        except KeyboardInterrupt:
            state["status"] = "INTERRUPTED"
            state["error"] = "KeyboardInterrupt"
            state["updated_at"] = datetime.now().isoformat(timespec="seconds")
            checkpoint["pcbas"][pcba] = state
            checkpoint["updated_at"] = state["updated_at"]
            if checkpoint_path:
                _atomic_json(checkpoint_path, checkpoint)
            raise
        except Exception as exc:
            state["status"] = "ERROR"
            state["error"] = f"{type(exc).__name__}: {exc}"

        state["updated_at"] = datetime.now().isoformat(timespec="seconds")
        checkpoint["pcbas"][pcba] = state
        checkpoint["updated_at"] = state["updated_at"]
        if checkpoint_path:
            _atomic_json(checkpoint_path, checkpoint)
        if progress:
            progress(idx, len(targets), pcba, state["status"], state)
        if pause_s and state["status"] == "COMPLETE":
            time.sleep(pause_s)

    pcbas = []
    for pcba in targets:
        state = checkpoint["pcbas"].get(pcba, {})
        pcbas.append({
            "pcba_sn": pcba,
            "status": state.get("status", "PENDING"),
            "error": state.get("error"),
            "result": state.get("result"),
        })

    completed = sum(1 for x in pcbas if x["status"] == "COMPLETE")
    errors = sum(1 for x in pcbas if x["status"] == "ERROR")
    no_data = sum(1 for x in pcbas if x.get("result") and x["result"].get("no_data"))

    return {
        "version": "0.11",
        "status": "complete" if not errors else "partial",
        "source_status": "COMPLETE" if not errors else "PARTIAL",
        "source_error": None,
        "shift": shift,
        "source_sha256": source_sha256,
        "requested_pcba_count": len(targets),
        "processed_pcba_count": completed,
        "pcba_error_count": errors,
        "pcba_no_data_count": no_data,
        "historical_target_count": plan["historical_target_count"],
        "current_target_count": plan["current_target_count"],
        "context_count": plan["historical_context_count"],
        "current_context_count": plan["current_context_count"],
        "checkpoint_path": str(checkpoint_path) if checkpoint_path else None,
        # compatibilidade: contexts continua sendo o histórico dos materiais.
        "contexts": plan["historical_contexts"],
        "current_contexts": plan["current_contexts"],
        "historical_targets": plan["historical_targets"],
        "current_targets": plan["current_targets"],
        "pcbas": pcbas,
    }
