from datetime import datetime, timezone, timedelta
from core.normalizacao import normalizar_sn, normalizar_texto


def _parse_datetime(value, default_offset_hours=0):
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value).strip()
        if not s:
            return None
        s = s.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y%m%d%H%M%S"):
                try:
                    dt = datetime.strptime(s, fmt)
                    break
                except ValueError:
                    dt = None
            if dt is None:
                return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone(timedelta(hours=float(default_offset_hours))))
    return dt.astimezone(timezone.utc)


def defect_time_to_utc(value, local_offset_hours=-3):
    return _parse_datetime(value, default_offset_hours=local_offset_hours)


def grid_time_to_utc(value, naive_offset_hours=0):
    return _parse_datetime(value, default_offset_hours=naive_offset_hours)


def _iso(dt):
    return dt.isoformat() if dt else None


def _is_component_row(row, pcba_sn):
    barcode = normalizar_sn(row.get("Barcode"))
    tipo = normalizar_texto(row.get("Sn Type") or "")
    if not barcode:
        return False
    if barcode == normalizar_sn(pcba_sn):
        return False
    if "pcba" in tipo:
        return False
    return True


def componentes_no_momento_da_falha(
    rows,
    pcba_sn,
    defect_time,
    defect_local_offset_hours=-3,
    grid_naive_offset_hours=0,
):
    """Seleciona o que estava fisicamente vinculado no instante da falha.

    Regra causal:
      Bind Time <= Defect Time
      e (Unbind Time vazio OU Unbind Time >= Defect Time)

    Iss Status NAO decide o passado: ele e preservado como fotografia do estado
    atual da consulta. Um item pode estar N agora e ter estado montado na falha.
    """
    defect_utc = defect_time_to_utc(defect_time, defect_local_offset_hours)
    if defect_utc is None:
        raise ValueError(f"Defect Time invalido: {defect_time!r}")

    buckets = {
        "active": [],
        "ended_before_defect": [],
        "bound_after_defect": [],
        "time_unknown": [],
        "boundary_ambiguous": [],
    }

    for row in rows or []:
        if not _is_component_row(row, pcba_sn):
            continue
        bind = grid_time_to_utc(row.get("Bind Time"), grid_naive_offset_hours)
        unbind = grid_time_to_utc(row.get("Unbind Time"), grid_naive_offset_hours)
        item = {
            "item_sn": normalizar_sn(row.get("Barcode")),
            "item_type": str(row.get("Sn Type") or "").strip(),
            "bind_time_utc": _iso(bind),
            "unbind_time_utc": _iso(unbind),
            "iss_status_now": str(row.get("Iss Status") or "").strip(),
            "binding_operation": str(row.get("Operation") or "").strip(),
            "binding_line": str(row.get("Line Id") or "").strip(),
            "binding_product": str(row.get("Product Model") or "").strip(),
            "source_view": "3074",
            "row": row,
        }
        if bind is None or (unbind is not None and unbind < bind):
            item["temporal_reason"] = "invalid_or_missing_binding_interval"
            buckets["time_unknown"].append(item)
        elif bind > defect_utc:
            buckets["bound_after_defect"].append(item)
        elif unbind is not None and unbind < defect_utc:
            buckets["ended_before_defect"].append(item)
        elif unbind is not None and unbind == defect_utc:
            item["temporal_reason"] = "unbind_equals_defect_time"
            buckets["boundary_ambiguous"].append(item)
        elif unbind is None and item["iss_status_now"].strip().upper() == "N":
            # Currently unlinked without an end instant cannot establish
            # whether it was present when the defect occurred.
            item["temporal_reason"] = "unlinked_now_missing_unbind_time"
            buckets["time_unknown"].append(item)
        else:
            item["temporal_reason"] = "bind_interval_contains_defect"
            buckets["active"].append(item)

    # O mesmo SN pode aparecer em mais de um posto/registro. Se houver duplicata
    # ativa, mantemos a vinculacao mais recente iniciada antes da falha.
    active_by_sn = {}
    conflicted = set()
    for item in buckets["active"]:
        sn = item["item_sn"]
        old = active_by_sn.get(sn)
        if old is None:
            active_by_sn[sn] = item
            continue
        if (old["bind_time_utc"], old["unbind_time_utc"]) != (item["bind_time_utc"], item["unbind_time_utc"]):
            # Two incompatible overlapping mounting intervals cannot be
            # resolved by Iss Status or by picking the most recent row.
            conflicted.add(sn)
        elif old.get("binding_operation") != item.get("binding_operation"):
            old.setdefault("binding_operations", [old.get("binding_operation")])
            if item.get("binding_operation") not in old["binding_operations"]:
                old["binding_operations"].append(item.get("binding_operation"))
    for sn in conflicted:
        item = active_by_sn.pop(sn)
        item["temporal_reason"] = "overlapping_or_conflicting_binding_cycles"
        buckets["time_unknown"].append(item)
    buckets["active"] = list(active_by_sn.values())

    y = sum(1 for x in buckets["active"] if x.get("iss_status_now", "").upper() == "Y")
    n = sum(1 for x in buckets["active"] if x.get("iss_status_now", "").upper() == "N")
    other = len(buckets["active"]) - y - n

    return {
        "defect_time_local": str(defect_time),
        "defect_time_utc": _iso(defect_utc),
        "active": buckets["active"],
        "ended_before_defect": buckets["ended_before_defect"],
        "bound_after_defect": buckets["bound_after_defect"],
        "time_unknown": buckets["time_unknown"],
        "summary": {
            "active_at_defect": len(buckets["active"]),
            "ended_before_defect": len(buckets["ended_before_defect"]),
            "bound_after_defect": len(buckets["bound_after_defect"]),
            "time_unknown": len(buckets["time_unknown"]),
            "boundary_ambiguous": len(buckets["boundary_ambiguous"]),
            "iss_status_y_now_among_active_then": y,
            "iss_status_n_now_among_active_then": n,
            "iss_status_other_now_among_active_then": other,
        },
    }


def pcbas_do_item_ate_a_falha(
    rows,
    defect_time,
    current_pcba_sn,
    defect_local_offset_hours=-3,
    grid_naive_offset_hours=0,
):
    """Retorna PCBAs em que o Item SN ja havia aparecido ate a falha atual.

    Associacoes iniciadas DEPOIS do Defect Time nao participam da causalidade.
    Iss Status Y/N e preservado como estado atual, sem apagar historico N.
    """
    defect_utc = defect_time_to_utc(defect_time, defect_local_offset_hours)
    if defect_utc is None:
        raise ValueError(f"Defect Time invalido: {defect_time!r}")

    events = []
    future = []
    unknown = []
    for row in rows or []:
        tipo = normalizar_texto(row.get("Sn Type") or "")
        barcode = normalizar_sn(row.get("Barcode"))
        if not barcode or "pcba" not in tipo:
            continue
        bind = grid_time_to_utc(row.get("Bind Time"), grid_naive_offset_hours)
        unbind = grid_time_to_utc(row.get("Unbind Time"), grid_naive_offset_hours)
        event = {
            "pcba_sn": barcode,
            "bind_time_utc": _iso(bind),
            "unbind_time_utc": _iso(unbind),
            "iss_status_now": str(row.get("Iss Status") or "").strip(),
            "row": row,
        }
        if bind is None:
            unknown.append(event)
        elif bind <= defect_utc:
            events.append(event)
        else:
            future.append(event)

    # Dedupe por PCBA. Mantemos o primeiro uso conhecido ate a falha e agregamos
    # quantas linhas/operacoes confirmam a associacao.
    by_pcba = {}
    for ev in sorted(events, key=lambda x: x.get("bind_time_utc") or ""):
        sn = ev["pcba_sn"]
        if sn not in by_pcba:
            by_pcba[sn] = dict(ev)
            by_pcba[sn]["event_count"] = 1
        else:
            by_pcba[sn]["event_count"] += 1
            # Estado atual mais informativo, se aparecer.
            if ev.get("iss_status_now"):
                by_pcba[sn]["iss_status_now"] = ev.get("iss_status_now")
            # Ultimo unbind conhecido.
            if (ev.get("unbind_time_utc") or "") > (by_pcba[sn].get("unbind_time_utc") or ""):
                by_pcba[sn]["unbind_time_utc"] = ev.get("unbind_time_utc")

    associations = list(by_pcba.values())
    current = normalizar_sn(current_pcba_sn)
    previous = [x for x in associations if x["pcba_sn"] != current]
    current_found = any(x["pcba_sn"] == current for x in associations)

    return {
        "defect_time_utc": _iso(defect_utc),
        "associations_until_defect": associations,
        "previous_pcbas": previous,
        "previous_pcba_count": len(previous),
        "current_pcba_confirmed": current_found,
        "future_associations_ignored": future,
        "time_unknown_associations": unknown,
    }


def historico_completo_pcbas_do_item(rows, grid_naive_offset_hours=0):
    """Reconstrói TODAS as PCBAs distintas conhecidas para um Item SN.

    Esta visão não é causal e não corta pelo Defect Time. Ela serve para responder:
    - quantas PCBAs distintas já usaram o material;
    - quantas reutilizações o material acumulou;
    - quais vínculos estão Y agora e quais estão N agora;
    - histórico cronológico de PCBAs com Bind/Unbind.
    """
    events = []
    for row in rows or []:
        tipo = normalizar_texto(row.get("Sn Type") or "")
        barcode = normalizar_sn(row.get("Barcode"))
        if not barcode or "pcba" not in tipo:
            continue
        bind = grid_time_to_utc(row.get("Bind Time"), grid_naive_offset_hours)
        unbind = grid_time_to_utc(row.get("Unbind Time"), grid_naive_offset_hours)
        events.append({
            "pcba_sn": barcode,
            "bind_time_utc": _iso(bind),
            "unbind_time_utc": _iso(unbind),
            "iss_status_now": str(row.get("Iss Status") or "").strip().upper(),
            "row": row,
        })

    by_pcba = {}
    for ev in sorted(events, key=lambda x: x.get("bind_time_utc") or ""):
        sn = ev["pcba_sn"]
        if sn not in by_pcba:
            by_pcba[sn] = dict(ev)
            by_pcba[sn]["event_count"] = 1
            continue

        cur = by_pcba[sn]
        cur["event_count"] += 1
        # Mantém o primeiro Bind conhecido e o último Unbind conhecido.
        if ev.get("bind_time_utc") and (not cur.get("bind_time_utc") or ev["bind_time_utc"] < cur["bind_time_utc"]):
            cur["bind_time_utc"] = ev["bind_time_utc"]
        if ev.get("unbind_time_utc") and ev["unbind_time_utc"] > (cur.get("unbind_time_utc") or ""):
            cur["unbind_time_utc"] = ev["unbind_time_utc"]
        # Y é o estado mais forte para a fotografia atual. Caso contrário, usa o último valor não vazio.
        if ev.get("iss_status_now") == "Y":
            cur["iss_status_now"] = "Y"
        elif ev.get("iss_status_now") and cur.get("iss_status_now") != "Y":
            cur["iss_status_now"] = ev["iss_status_now"]

    associations = sorted(by_pcba.values(), key=lambda x: x.get("bind_time_utc") or "")
    active_now = [x for x in associations if x.get("iss_status_now") == "Y"]
    inactive_now = [x for x in associations if x.get("iss_status_now") == "N"]
    other_now = [x for x in associations if x.get("iss_status_now") not in ("Y", "N")]
    uses = len(associations)

    return {
        "associations": associations,
        "distinct_pcba_count": uses,
        "reuse_count": max(0, uses - 1),
        "active_now_pcbas": [x["pcba_sn"] for x in active_now],
        "inactive_now_pcbas": [x["pcba_sn"] for x in inactive_now],
        "other_status_pcbas": [x["pcba_sn"] for x in other_now],
    }


def corroborar_posto_3022(component, rows3022, pcba_sn, defect_time, defect_local_offset_hours=-3, grid_naive_offset_hours=0):
    """Optional, time-bounded cross-source support. Never invent a 3022 pass.

    3074 Operation is the binding station, not a promise that a 3022 event
    exists; lack of a passage cannot make material history a proven zero.
    The MES 3022 Working Oper is the completed operation; Current Oper often
    points to the *next* station and must not be used as a completion proof.
    """
    station = str(component.get("binding_operation") or "").strip().upper()
    cutoff = defect_time_to_utc(defect_time, defect_local_offset_hours)
    bind = grid_time_to_utc(component.get("bind_time_utc"), grid_naive_offset_hours)
    if not station or cutoff is None or bind is None:
        return {"status": "unavailable", "station_3074": station or None,
                "reason": "missing_station_or_time"}
    matches = []
    for row in rows3022 or []:
        if normalizar_sn(row.get("pcba_sn")) != normalizar_sn(pcba_sn):
            continue
        working = str(row.get("working_oper_code") or row.get("working_oper") or "").strip().upper()
        transaction = str(row.get("tran_desc") or "").strip().upper()
        # Actual completed station, not a next-operation or a generic repair.
        if working != station or transaction != "END LOT":
            continue
        when = grid_time_to_utc(row.get("event_time"), grid_naive_offset_hours)
        if when is not None and bind <= when <= cutoff:
            matches.append(when)
    if not matches:
        return {"status": "not_confirmed", "station_3074": station,
                "reason": "no_completed_3022_passage_in_mounting_interval"}
    return {"status": "corroborated", "station_3074": station,
            "event_time_utc": _iso(max(matches)),
            "source_view": "3022", "reason": "same_pcba_completed_station_between_bind_and_defect"}


