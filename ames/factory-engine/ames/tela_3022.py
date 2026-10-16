import json
import hashlib
import re
import time
import fnmatch
import unicodedata
from pathlib import Path

from ames.ui_helpers import find_text_input, find_button, extract_extjs_store_grid, extract_best_grid  # diagnostic API
from core.normalizacao import normalizar_sn, normalizar_texto, parse_datetime
from core.temporal_3074 import defect_time_to_utc, grid_time_to_utc


# Confirmado em fábrica: A5700 é o último posto da linha de montagem/teste.
# O histórico bruto da 3022 continua integralmente preservado. Esta regra serve
# apenas para separar a visão operacional principal do trecho de packing.
DEFAULT_TEST_END_CODE = "A5700"


# Eventos que representam passagem concluída por um posto. A evidência real
# observada na 3022 usa END LOT para as etapas de montagem/teste e packing.
PROCESS_PASS_DESCS = {"END LOT"}


def _grid_signature_3022(grid):
    if grid is None:
        return None
    payload = {"headers": grid.get("headers") or [], "rows": grid.get("rows") or []}
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:16]
    return {"sha256_16": digest, "rows": len(payload["rows"]), "headers": len(payload["headers"])}


def _pcba_column(key, *, row=False):
    # Exact primary identifiers only: IMEI/component SN may legitimately differ.
    key = re.sub(r"[^a-z0-9]", "", str(key).split("__", 1)[0].lower())
    return key in {"lotid", "pcba", "pcbasn", "pcbaid", "pcbaserialnumber"} or (row and key in {"sn", "serialnumber"})


def _result_identity_3022(rows, fields, target):
    """Return only explicit response identity from the 3022 result itself.

    The physical AWIP3022 history grid normally does not repeat the queried
    PCBA/SN in each history row. The editable query field is validated only at
    submit time. A-MES is allowed to clear/recreate that field after View; the
    returned dataset is proven separately by the grid/store refresh lifecycle.
    """
    values = [normalizar_sn(v) for row in rows for k, v in row.items()
              if _pcba_column(k, row=True) and normalizar_sn(v)]
    headers = [normalizar_sn(f.get("raw") or f.get("value")) for f in fields
               if f.get("visible") is True and f.get("read_only") is True
               and any(_pcba_column(f.get(k)) for k in ("label", "name", "itemId"))
               and normalizar_sn(f.get("raw") or f.get("value"))]
    if any(v != target for v in values + headers):
        return "MISMATCH"
    if rows and all(any(_pcba_column(k, row=True) and normalizar_sn(v) == target for k, v in row.items()) for row in rows):
        return "GRID_IDENTITY_CONFIRMED"
    return "RESULT_HEADER_MATCH" if headers else "UNCONFIRMED"


def _row_value(row, aliases):
    """Read a value tolerating header variations between MES releases."""
    if not isinstance(row, dict):
        return ""
    for alias in aliases:
        if alias in row and str(row.get(alias) or "").strip():
            return row.get(alias)
    wanted = [normalizar_texto(a) for a in aliases]
    for key, value in row.items():
        nk = normalizar_texto(str(key).split("__", 1)[0])
        if any(nk == a or a in nk or nk in a for a in wanted if a and nk):
            if str(value or "").strip():
                return value
    return ""


def normalizar_evento_3022(row):
    """Canonical projection without discarding any original 3022 columns.

    Important semantic distinction observed in real factory histories:
      * Working Oper = the operation represented by the event / just executed;
      * Current Oper = the operation the unit is in / moves to after the event.

    For process-pass correlation we therefore prefer Working Oper on END LOT.
    """
    hist_seq_raw = _row_value(row, ("Hist Seq", "History Seq", "Sequence", "Seq"))
    try:
        hist_seq = int(str(hist_seq_raw).strip()) if str(hist_seq_raw or "").strip() else None
    except Exception:
        hist_seq = None
    return {
        "operation_code": str(_row_value(row, (
            "Current Oper Code", "Current Operation Code", "Oper Code", "Operation Code"
        )) or "").strip(),
        "operation_name": str(_row_value(row, (
            "Current Oper", "Current Operation", "Operation", "Operação"
        )) or "").strip(),
        "working_oper_code": str(_row_value(row, (
            "Working Oper Code", "Working Operation Code"
        )) or "").strip(),
        "working_oper": str(_row_value(row, (
            "Working Oper", "Working Operation"
        )) or "").strip(),
        "station": str(_row_value(row, (
            "Station", "Station Code", "Work Station", "Workstation"
        )) or "").strip(),
        "event_time": str(_row_value(row, (
            "Tran Time", "Transaction Time", "Event Time", "Create Time", "Update Time"
        )) or "").strip(),
        "hist_seq": hist_seq,
        "shift_desc": str(_row_value(row, (
            "Shift Desc", "Shift", "Shift Description", "Shift English"
        )) or "").strip(),
        "tran_user_id": str(_row_value(row, (
            "Tran User Id", "Tran User", "Transaction User", "User Id"
        )) or "").strip(),
        "tran_desc": str(_row_value(row, ("Tran Desc", "Transaction Desc", "Transaction")) or "").strip(),
        "tran_desc_english": str(_row_value(row, ("Tran Desc English", "Transaction Desc English")) or "").strip(),
        "tran_cmf3": str(_row_value(row, ("TRAN CMF3", "Tran Cmf3", "CMF3")) or "").strip(),
        "line_code": str(_row_value(row, ("Line Code", "Line")) or "").strip(),
        "imei": str(_row_value(row, ("IMEI", "Lot Cmf2")) or "").strip(),
        "material_id": str(_row_value(row, ("Mat Id", "Material Id")) or "").strip(),
        "raw": dict(row or {}),
    }


def _code_matches(value, code):
    target = str(code or "").strip().upper()
    txt = str(value or "").strip().upper()
    return bool(target and txt and (txt == target or txt.startswith(target)))


def _event_codes(ev):
    """All operation/station codes represented by one transition."""
    out = []
    for value in (ev.get("working_oper_code"), ev.get("operation_code"), ev.get("station")):
        txt = str(value or "").strip().upper()
        if txt and txt not in out:
            out.append(txt)
    return out


def _event_reaches_code(ev, code):
    return any(_code_matches(txt, code) for txt in _event_codes(ev))


def _event_completes_code(ev, code):
    """Strong evidence that a station was actually completed.

    Current Oper=A5700 alone only means the unit reached/entered A5700. It does
    NOT prove A5700 was completed. Real factory examples show completion as
    Working Oper=A5700 + END LOT, often with Current Oper already K6070.
    """
    if not _code_matches(ev.get("working_oper_code"), code):
        return False
    desc = str(ev.get("tran_desc") or "").strip().upper()
    current = str(ev.get("operation_code") or "").strip().upper()
    if desc in PROCESS_PASS_DESCS:
        return True
    # Defensive fallback for releases that omit END LOT but clearly transition
    # away from A5700. This remains stronger than Current Oper=A5700 alone.
    if current and not _code_matches(current, code):
        return True
    return False


def _event_order_key(ev):
    """Chronological order with Hist Seq as deterministic tie-breaker."""
    dt = ev.get("_dt")
    seq = ev.get("hist_seq")
    return (dt, seq if seq is not None else -1)


def _normalize_for_order(rows):
    normalized = []
    for idx, row in enumerate(rows or []):
        ev = normalizar_evento_3022(row)
        ev["_index"] = idx
        ev["_dt"] = parse_datetime(ev.get("event_time"))
        normalized.append(ev)
    return normalized


def extrair_passagens_processo(rows, test_end_code=DEFAULT_TEST_END_CODE):
    """Extract actual process-pass evidence from the full 3022 history.

    Only END LOT is treated as a completed production/test passage. CHANGE CMF,
    REPAIR, REPAIR END, MO_MAPPING, RECEIVE and similar history records remain in
    the raw history but are not mislabeled as process stations.
    """
    focus = preparar_foco_montagem_teste(rows, test_end_code=test_end_code, include_passages=False)
    boundary_dt = parse_datetime(focus.get("boundary_event_time")) if focus.get("boundary_event_time") else None
    boundary_seq = focus.get("boundary_hist_seq")
    out = []
    for ev in _normalize_for_order(rows):
        if str(ev.get("tran_desc") or "").strip().upper() not in PROCESS_PASS_DESCS:
            continue
        code = str(ev.get("working_oper_code") or "").strip()
        name = str(ev.get("working_oper") or "").strip()
        if not code and not name:
            continue
        scope = "FOCO_MONTAGEM_TESTE"
        if focus.get("boundary_found") and ev.get("_dt") and boundary_dt:
            key = (ev.get("_dt"), ev.get("hist_seq") if ev.get("hist_seq") is not None else -1)
            bkey = (boundary_dt, boundary_seq if boundary_seq is not None else -1)
            if key > bkey:
                scope = "POS_A5700_PACKING"
        out.append({
            "operation_code": code,
            "operation_name": name,
            "current_operation_code": str(ev.get("operation_code") or "").strip(),
            "current_operation_name": str(ev.get("operation_name") or "").strip(),
            "station": str(ev.get("station") or "").strip(),
            "event_time": str(ev.get("event_time") or "").strip(),
            "hist_seq": ev.get("hist_seq"),
            "event_group": scope,
            "source": "3022",
            "raw": dict(ev.get("raw") or {}),
        })
    return out


def preparar_foco_montagem_teste(rows, test_end_code=DEFAULT_TEST_END_CODE, include_passages=True):
    """Split full 3022 history into assembly/test focus and post-test/packing.

    Rules hardened from multiple real factory examples:
      * A5700 is the last assembly/test station.
      * Current Oper=A5700 means the unit reached A5700, not that it completed it.
      * Completion boundary requires Working Oper=A5700 with END LOT (or a clear
        transition away from A5700 when END LOT is absent).
      * Hist Seq resolves same-second handoffs.
      * If completion is not proven, nothing is hidden as packing.
    """
    normalized = _normalize_for_order(rows)

    reached_candidates = [
        ev for ev in normalized
        if _event_reaches_code(ev, test_end_code) and ev.get("_dt")
    ]
    completed_candidates = [
        ev for ev in normalized
        if _event_completes_code(ev, test_end_code) and ev.get("_dt")
    ]
    reached = max(reached_candidates, key=_event_order_key) if reached_candidates else None
    boundary = max(completed_candidates, key=_event_order_key) if completed_candidates else None

    focus_rows, post_rows, annotated = [], [], []
    for ev in normalized:
        raw = dict(ev["raw"])
        if boundary and ev.get("_dt"):
            # Same-second transition is resolved with Hist Seq from the MES grid.
            if _event_order_key(ev) <= _event_order_key(boundary):
                scope = "FOCO_MONTAGEM_TESTE_ATE_A5700"
                focus_rows.append(raw)
            else:
                scope = "POS_A5700_PACKING"
                post_rows.append(raw)
        else:
            # No completed A5700 => do not guess or hide any history.
            scope = "SEM_LIMITE_A5700_CONCLUIDO"
            focus_rows.append(raw)
        raw["_analysis_scope"] = scope
        annotated.append(raw)

    post_count = len(post_rows)
    if boundary:
        phase_status = "AFTER_A5700" if post_count else "A5700_COMPLETED"
    elif reached:
        phase_status = "AT_A5700"
    else:
        phase_status = "BEFORE_A5700"

    out = {
        "test_end_code": str(test_end_code or DEFAULT_TEST_END_CODE),
        "boundary_event": dict(boundary["raw"]) if boundary else None,
        "boundary_event_time": boundary.get("event_time") if boundary else None,
        "boundary_hist_seq": boundary.get("hist_seq") if boundary else None,
        "a5700_reached": bool(reached),
        "a5700_reached_event_time": reached.get("event_time") if reached else None,
        "a5700_reached_hist_seq": reached.get("hist_seq") if reached else None,
        "a5700_completed": bool(boundary),
        "phase_status": phase_status,
        "all_rows": annotated,
        "focus_rows": focus_rows,
        "post_test_rows": post_rows,
        "all_count": len(annotated),
        "focus_count": len(focus_rows),
        "post_test_count": post_count,
        # Compatibility with R2/R3 consumers. From R4 it means COMPLETED A5700.
        "boundary_found": bool(boundary),
    }
    if include_passages:
        # Avoid recursion by asking the extractor not to request passages again.
        out["process_passages"] = extrair_passagens_processo(rows, test_end_code=test_end_code)
    return out


def selecionar_processo_anterior(
    eventos,
    defect_time,
    *,
    defect_local_offset_hours=-3,
    event_naive_offset_hours=0,
    test_end_code=DEFAULT_TEST_END_CODE,
    limit_to_test=True,
):
    """Select the last completed process passage at/before Defect Time.

    3028 Defect Time is factory local time (default UTC-3). 3022 Tran Time was
    observed in the real grid as UTC-aware. All comparisons are normalized to
    UTC, avoiding naive/aware datetime errors and silent 3-hour shifts.

    This function intentionally ignores CHANGE CMF/REPAIR metadata and uses the
    completed Working Oper from END LOT as process evidence. It does NOT infer
    root cause; it only identifies the previous completed process passage.
    """
    defect_utc = defect_time_to_utc(defect_time, defect_local_offset_hours)
    if defect_utc is None:
        return {
            "status": "INVALID_DEFECT_TIME",
            "defect_time": str(defect_time or ""),
            "defect_time_utc": None,
            "process": None,
        }

    passages = extrair_passagens_processo(eventos, test_end_code=test_end_code)
    candidates = []
    for p in passages:
        if limit_to_test and p.get("event_group") == "POS_A5700_PACKING":
            continue
        dt = grid_time_to_utc(p.get("event_time"), event_naive_offset_hours)
        if not dt or dt > defect_utc:
            continue
        seq = p.get("hist_seq")
        candidates.append((dt, seq if seq is not None else -1, p))

    if not candidates:
        return {
            "status": "NO_PRIOR_PROCESS",
            "defect_time": str(defect_time or ""),
            "defect_time_utc": defect_utc.isoformat(),
            "process": None,
        }

    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    dt, _, chosen = candidates[0]
    process = dict(chosen)
    process["event_time_utc"] = dt.isoformat()
    return {
        "status": "COMPLETE",
        "defect_time": str(defect_time or ""),
        "defect_time_utc": defect_utc.isoformat(),
        "process": process,
    }


def _norm_rule_text(value):
    txt = unicodedata.normalize("NFKD", str(value or ""))
    txt = "".join(ch for ch in txt if not unicodedata.combining(ch))
    txt = re.sub(r"[^a-zA-Z0-9]+", " ", txt).strip().lower()
    return re.sub(r"\s+", " ", txt)


def normalizar_modo_registro(value):
    """Normalize 3028/2114 Manual/Automatic semantics.

    3028 can expose a Manually Input Or Not style flag (Y/N) while 2114 may
    expose literal Manual/Automatic.  This function accepts both without
    changing the original value, which remains preserved in evidence.
    """
    raw = str(value or "").strip()
    n = _norm_rule_text(raw)
    if not n:
        return "UNKNOWN"
    if n in {"y", "yes", "sim", "1", "true"} or "manual" in n or "by hand" in n or n == "hand":
        return "MANUAL"
    if n in {"n", "no", "nao", "0", "false"} or "automatic" in n or n == "auto" or "testtools" in n or "test tools" in n:
        return "AUTOMATIC"
    return "UNKNOWN"


def _load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return default


def carregar_regras_processo_3022(base_dir):
    base = Path(base_dir)
    rules = _load_json(base / "config" / "regras_processo_3022.json", {})
    families = _load_json(base / "config" / "familias_falhas.json", {})
    return rules or {}, families or {}


def classificar_familia_falha(defect_code, defect_desc, families_cfg):
    hay = _norm_rule_text(f"{defect_code or ''} {defect_desc or ''}")
    if not hay:
        return "UNKNOWN"
    for family, keywords in (families_cfg or {}).items():
        for kw in keywords or []:
            nk = _norm_rule_text(kw)
            if nk and nk in hay:
                return str(family)
    return "UNKNOWN"


def _match_model(model, patterns):
    pats = patterns or ["*"]
    m = str(model or "").strip().upper()
    return any(fnmatch.fnmatch(m, str(p or "*").strip().upper()) for p in pats)


def resolver_regra_referencia(base_dir, *, product_model="", defect_code="", defect_desc="", manual_or_auto=""):
    """Resolve CPH/model + failure family/mode into a reference station rule.

    A returned rule is evidence-selection metadata, not a root-cause claim.
    Specific model rules can be added to config/regras_processo_3022.json later
    without changing Python code.
    """
    rules_cfg, families_cfg = carregar_regras_processo_3022(base_dir)
    registration_mode = normalizar_modo_registro(manual_or_auto)
    family = classificar_familia_falha(defect_code, defect_desc, families_cfg)
    hay = _norm_rule_text(f"{defect_code or ''} {defect_desc or ''} {family}")
    candidates = []
    for rule in rules_cfg.get("rules") or []:
        if not _match_model(product_model, rule.get("product_models")):
            continue
        modes = [str(x).upper() for x in (rule.get("registration_modes") or [])]
        if modes and registration_mode not in modes:
            continue
        fams = [str(x).upper() for x in (rule.get("families") or [])]
        if fams and str(family).upper() not in fams:
            continue
        codes = [str(x).upper() for x in (rule.get("defect_codes") or [])]
        if codes and not any(fnmatch.fnmatch(str(defect_code or "").upper(), pat) for pat in codes):
            continue
        all_kw = [_norm_rule_text(x) for x in (rule.get("all_keywords") or []) if _norm_rule_text(x)]
        any_kw = [_norm_rule_text(x) for x in (rule.get("any_keywords") or []) if _norm_rule_text(x)]
        if all_kw and not all(k in hay for k in all_kw):
            continue
        if any_kw and not any(k in hay for k in any_kw):
            continue
        candidates.append(rule)
    candidates.sort(key=lambda r: (int(r.get("priority") or 0), len([x for x in (r.get("product_models") or []) if x != "*"])), reverse=True)
    chosen = dict(candidates[0]) if candidates else None
    if chosen:
        return {
            "registration_mode": registration_mode,
            "failure_family": family,
            "analysis_kind": chosen.get("analysis_kind") or "REFERENCE_STATION",
            "rule_id": chosen.get("id") or "CONFIG_RULE",
            "reference_stations": list(chosen.get("reference_stations") or []),
            "reference_confidence": chosen.get("confidence") or "CONFIGURED",
            "reason": chosen.get("reason") or "Regra configurada.",
            "station_semantics": rules_cfg.get("station_semantics") or {},
        }
    return {
        "registration_mode": registration_mode,
        "failure_family": family,
        "analysis_kind": "FUNCTIONAL_AUTOMATIC_UNMAPPED" if registration_mode == "AUTOMATIC" else "UNMAPPED",
        "rule_id": None,
        "reference_stations": [],
        "reference_confidence": "UNMAPPED",
        "reason": (
            "Falha automatica/funcional sem posto de montagem mapeado para este CPH/familia; "
            "o ultimo processo concluido antes da falha fica apenas como contexto, nao como origem."
            if registration_mode == "AUTOMATIC" else
            "Nao existe regra CPH/familia/posto configurada para esta ocorrencia; ultimo processo anterior e apenas contexto."
        ),
        "station_semantics": rules_cfg.get("station_semantics") or {},
    }


def selecionar_passagem_referencia(eventos, defect_time, postos, *, defect_local_offset_hours=-3, event_naive_offset_hours=0, test_end_code=DEFAULT_TEST_END_CODE):
    """Pick the latest completed passage through a mapped station before THIS defect.

    This is the core rule for repeated A5162/A5201 loops: every defect gets the
    latest qualifying pass <= its own Defect Time, so a later rework cycle cannot
    be used to explain an earlier failure.
    """
    defect_utc = defect_time_to_utc(defect_time, defect_local_offset_hours)
    if defect_utc is None:
        return {"status":"INVALID_DEFECT_TIME","process":None,"next_process":None,"prior_count":0,"defect_time_utc":None}
    targets = [str(x or "").strip().upper() for x in (postos or []) if str(x or "").strip()]
    passages = extrair_passagens_processo(eventos, test_end_code=test_end_code)
    before, after = [], []
    for p in passages:
        code = str(p.get("operation_code") or "").strip().upper()
        station = str(p.get("station") or "").strip().upper()
        if targets and not any(_code_matches(code, t) or _code_matches(station, t) for t in targets):
            continue
        dt = grid_time_to_utc(p.get("event_time"), event_naive_offset_hours)
        if not dt:
            continue
        seq = p.get("hist_seq") if p.get("hist_seq") is not None else -1
        item = (dt, seq, p)
        if dt <= defect_utc:
            before.append(item)
        else:
            after.append(item)
    before.sort(key=lambda x:(x[0],x[1]), reverse=True)
    after.sort(key=lambda x:(x[0],x[1]))
    chosen = before[0] if before else None
    nxt = after[0] if after else None
    proc = dict(chosen[2]) if chosen else None
    if proc: proc["event_time_utc"] = chosen[0].isoformat()
    next_proc = dict(nxt[2]) if nxt else None
    if next_proc: next_proc["event_time_utc"] = nxt[0].isoformat()
    return {
        "status":"COMPLETE" if proc else "NO_PRIOR_REFERENCE_PASSAGE",
        "defect_time_utc":defect_utc.isoformat(),
        "process":proc,
        "next_process":next_proc,
        "prior_count":len(before),
        "future_count":len(after),
    }


def _is_defect_registration_event(ev):
    raw_text = " ".join(str(ev.get(k) or "") for k in ("tran_desc", "tran_desc_english", "tran_cmf3"))
    text = _norm_rule_text(raw_text)
    manual = any(x in text for x in ("manually enter bad", "manual defect", "manual bad", "manual")) or "手动" in raw_text
    automatic = any(x in text for x in ("automatic defect", "testing tools", "auto defect")) or "自动" in raw_text
    return str(ev.get("tran_desc") or "").strip().upper() == "CHANGE CMF" and (manual or automatic)


def analisar_ciclo_reparo_apos_falha(eventos, defect_time, *, reference_stations=None, defect_local_offset_hours=-3, event_naive_offset_hours=0):
    """Describe the first AT/rework cycle after a defect without changing origin selection.

    Phone_Bat_Cover is highlighted because it removes/reworks the old battery
    cover and the unit returns through A5201 before a new A5162 cycle.  The full
    raw 3022 history is still preserved.
    """
    defect_utc = defect_time_to_utc(defect_time, defect_local_offset_hours)
    if defect_utc is None:
        return {"status":"INVALID_DEFECT_TIME"}
    normalized = _normalize_for_order(eventos)
    future=[]
    for ev in normalized:
        dt = grid_time_to_utc(ev.get("event_time"), event_naive_offset_hours)
        if dt and dt > defect_utc:
            future.append((dt, ev.get("hist_seq") if ev.get("hist_seq") is not None else -1, ev))
    future.sort(key=lambda x:(x[0],x[1]))
    # Do not let a repair belonging to a later defect be attached to this defect.
    next_defect_registration = next((item for item in future if _is_defect_registration_event(item[2])), None)
    cycle_end_dt = next_defect_registration[0] if next_defect_registration else None
    repair_candidates=[]
    for item in future:
        if cycle_end_dt is not None and item[0] >= cycle_end_dt:
            break
        ev=item[2]
        if str(ev.get("tran_desc") or "").strip().upper() == "REPAIR":
            repair_candidates.append(item)
    preferred=[]
    for item in repair_candidates:
        cmf=_norm_rule_text(item[2].get("tran_cmf3"))
        if "phone bat cover" in cmf or "phone battery cover" in cmf:
            preferred.append(item)
    repair = (preferred or repair_candidates)[0] if (preferred or repair_candidates) else None
    start_dt = repair[0] if repair else defect_utc

    passages = extrair_passagens_processo(eventos)
    def first_pass(codes=None):
        found=[]
        for p in passages:
            dt=grid_time_to_utc(p.get("event_time"), event_naive_offset_hours)
            if not dt or dt <= start_dt: continue
            if cycle_end_dt is not None and dt >= cycle_end_dt: continue
            code=str(p.get("operation_code") or "").strip().upper(); st=str(p.get("station") or "").strip().upper()
            if (codes is None and (code or st)) or any(_code_matches(code,c) or _code_matches(st,c) for c in (codes or [])):
                found.append((dt,p.get("hist_seq") if p.get("hist_seq") is not None else -1,p))
        found.sort(key=lambda x:(x[0],x[1]))
        if not found: return None
        x=dict(found[0][2]); x["event_time_utc"]=found[0][0].isoformat(); return x

    rep_ev=None
    if repair:
        rep_ev=normalizar_evento_3022(repair[2].get("raw") or repair[2])
        rep_ev["event_time_utc"]=repair[0].isoformat()
    action = str((rep_ev or {}).get("tran_cmf3") or "").strip()
    action_norm=_norm_rule_text(action)
    action_class = "PHONE_BAT_COVER" if ("phone bat cover" in action_norm or "phone battery cover" in action_norm) else ("OTHER_REPAIR" if repair else "")
    # A5201 -> A5162 is a confirmed return pattern only for Phone_Bat_Cover.
    # Other repair types have their own routes and must not inherit this rule.
    return_a5201=first_pass(["A5201"]) if action_class == "PHONE_BAT_COVER" else None
    next_ref=(first_pass([str(x).upper() for x in (reference_stations or [])]) if reference_stations else None) if action_class == "PHONE_BAT_COVER" else None
    return {
        "status":"COMPLETE" if repair else "NO_REPAIR_AFTER_DEFECT",
        "repair_action":action,
        "repair_action_class":action_class,
        "repair_event":rep_ev,
        "return_a5201":return_a5201,
        "return_process":first_pass() if repair else None,
        "next_reference_passage":next_ref,
        "next_defect_registration_time": (next_defect_registration[2].get("event_time") if next_defect_registration else None),
    }


def correlacionar_falha_3022(base_dir, eventos, defect_record, *, registration_value=None, registration_source="3028", defect_local_offset_hours=-3, event_naive_offset_hours=0):
    """Build a defect-specific temporal context from 3022.

    Keeps two different concepts explicit:
      1) previous_process = last completed process before detection (context only)
      2) reference_process = mapped assembly/control station for the failure type
    The second is selected by CPH/family/mode and always uses the latest valid
    pass before the CURRENT Defect Time, which is essential with repeated rework.
    """
    rec = dict(defect_record or {})
    reg_raw = registration_value if registration_value not in (None, "") else rec.get("manual_or_auto")
    rule = resolver_regra_referencia(
        base_dir,
        product_model=rec.get("product_model"), defect_code=rec.get("defect_code"),
        defect_desc=rec.get("defect_desc"), manual_or_auto=reg_raw,
    )
    generic = selecionar_processo_anterior(
        eventos, rec.get("defect_time"), defect_local_offset_hours=defect_local_offset_hours,
        event_naive_offset_hours=event_naive_offset_hours, limit_to_test=True,
    )
    refsel = selecionar_passagem_referencia(
        eventos, rec.get("defect_time"), rule.get("reference_stations") or [],
        defect_local_offset_hours=defect_local_offset_hours, event_naive_offset_hours=event_naive_offset_hours,
    ) if rule.get("reference_stations") else {"status":"RULE_NOT_MAPPED","process":None,"next_process":None,"prior_count":0,"future_count":0,"defect_time_utc":generic.get("defect_time_utc")}
    cycle = analisar_ciclo_reparo_apos_falha(
        eventos, rec.get("defect_time"), reference_stations=rule.get("reference_stations") or [],
        defect_local_offset_hours=defect_local_offset_hours, event_naive_offset_hours=event_naive_offset_hours,
    )
    if rule.get("reference_stations"):
        status = "COMPLETE_REFERENCE" if refsel.get("process") else refsel.get("status")
    else:
        status = "GENERIC_ONLY_RULE_NOT_MAPPED" if generic.get("process") else generic.get("status")
    return {
        "status":status,
        "defect_time_utc":generic.get("defect_time_utc") or refsel.get("defect_time_utc"),
        "registration_mode":rule.get("registration_mode"),
        "registration_mode_source":registration_source,
        "failure_family":rule.get("failure_family"),
        "analysis_kind":rule.get("analysis_kind"),
        "reference_rule_id":rule.get("rule_id"),
        "reference_confidence":rule.get("reference_confidence"),
        "reference_stations":rule.get("reference_stations") or [],
        "reference_reason":rule.get("reason"),
        "station_semantics":rule.get("station_semantics") or {},
        "reference_selection":refsel,
        "reference_process":refsel.get("process"),
        "previous_process":generic.get("process"),
        "repair_cycle":cycle,
        "rule":rule,
    }


class Tela3022:
    """Read-only adapter for AWIP3022-Vw View Lot History."""

    def __init__(self, browser, base_dir: Path):
        self.browser = browser
        self.base_dir = Path(base_dir)
        cfg = json.loads((self.base_dir / "config" / "selectors.json").read_text(encoding="utf-8"))
        self.cfg = cfg["3022"]

    def _page(self):
        for hint in ("VwViewLotHistoryView", "AWIP3022", "3022"):
            try:
                p = self.browser.choose_active_page(hint)
                if hint.lower() in (p.url or "").lower():
                    return p
                try:
                    body = (p.locator("body").inner_text(timeout=700) or "").lower()
                    if "awip3022" in body or "view lot history" in body:
                        return p
                except Exception:
                    pass
            except Exception:
                pass
        return self.browser.choose_active_page("3022")

    def _query_control(self, page):
        """Return the current visible 3022 query input, never a stale Ext fallback.

        During a real SN-to-SN transition ExtJS can destroy/recreate the text field.
        If ExtJS is present but the live field is temporarily absent/unstable, return
        None so the caller can re-resolve it. Falling through to the generic locator
        in that state can bind to the just-destroyed `textfield-...-inputEl`.
        """
        js = r"""
        () => {
          if (!window.Ext || !Ext.ComponentQuery) return {ext:false, field:null};
          const visible = c => {
            try {
              if (c.isVisible && !c.isVisible(true)) return false;
              const el = (c.inputEl && c.inputEl.dom) || (c.inputId ? document.getElementById(c.inputId) : null);
              if (!el) return false;
              const r = el.getBoundingClientRect(), s = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
            } catch(e) { return false; }
          };
          const fs = Ext.ComponentQuery.query('field');
          const f = fs.find(c => {
            const t = [c.fieldLabel,c.name,c.itemId,c.id].filter(Boolean).join(' ').toLowerCase();
            return visible(c) && ((t.includes('sn') && t.includes('imei')) || t.includes('a-s'));
          });
          if (!f) return {ext:true, field:null};
          return {ext:true, field:{inputId:String(f.inputId||''), id:String(f.id||''), name:String(f.name||'')}};
        }
        """
        saw_ext = False
        for frame in page.frames:
            try:
                probe = frame.evaluate(js) or {}
                if probe.get("ext"):
                    saw_ext = True
                meta = probe.get("field") or {}
                if not meta:
                    continue
                selectors = []
                if meta.get("inputId"):
                    selectors.append(f"#{meta['inputId']}:visible")
                if meta.get("name"):
                    selectors.append(f'input[name="{meta["name"]}"]:visible')
                for sel in selectors:
                    loc = frame.locator(sel)
                    if loc.count() and loc.first.is_visible(timeout=350):
                        return loc.first
            except Exception:
                pass

        # ExtJS exists, therefore absence here is a transient lifecycle state.
        # Do not let a generic selector latch onto a component that is being removed.
        if saw_ext:
            return None

        _, campo, _ = find_text_input(
            page,
            labels=self.cfg.get("sn_labels") or ("SN / IMEI / A-S", "SN"),
            name_contains=self.cfg.get("sn_name_contains") or ("sn", "imei"),
            frame_hints=("3022", "View Lot History"),
        )
        return campo

    def _header_fields(self, page, frame=None):
        """Best-effort read of visible ExtJS fields for evidence payload only."""
        js = r"""
        () => {
          if (!window.Ext || !Ext.ComponentQuery) return [];
          return Ext.ComponentQuery.query('field').filter(f => {
            try {
              const el = (f.inputEl && f.inputEl.dom) || (f.el && f.el.dom);
              const r = el && el.getBoundingClientRect(), s = el && getComputedStyle(el);
              return (!f.isVisible || f.isVisible(true)) && r && r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
            } catch(e) { return false; }
          }).map(f => {
            let value = null, raw = null;
            try { value = f.getValue ? f.getValue() : null; } catch(e) {}
            try { raw = f.getRawValue ? f.getRawValue() : null; } catch(e) {}
            return {label:String(f.fieldLabel||''), name:String(f.name||''), itemId:String(f.itemId||''), value:value, raw:raw, visible:true, read_only:!!(f.readOnly || (f.isXType && f.isXType('displayfield')))};
          }).filter(x => String(x.raw??x.value??'').trim() !== '');
        }
        """
        out = []
        for frame in ([frame] if frame is not None else page.frames):
            try:
                for item in frame.evaluate(js) or []:
                    if item not in out:
                        out.append(item)
            except Exception:
                pass
        return out

    def _grid_store_token(self, frame, grid_id):
        """Stable runtime identity for the concrete ExtJS store bound to a grid."""
        return frame.evaluate(r"""id => {
          const g = window.Ext && Ext.getCmp(id), s = g && g.getStore && g.getStore();
          if (!s) return null;
          if (!s.__ames3022StoreToken) {
            const root = globalThis.__ames3022StoreTokens || (globalThis.__ames3022StoreTokens = {next: 1});
            const token = 'store-' + (root.next++);
            try { Object.defineProperty(s, '__ames3022StoreToken', {value: token, configurable: true}); }
            catch(e) { s.__ames3022StoreToken = token; }
          }
          return String(s.__ames3022StoreToken || '');
        }""", grid_id)

    def _history_response(self, frame, grid_id, action, token):
        """Observe one submitted query without assuming grid/store identity survives View."""
        return frame.evaluate(r"""args => {
          if (!window.Ext) throw new Error('3022 ExtJS unavailable');
          const root = globalThis.__ames3022Responses || (globalThis.__ames3022Responses = {});
          const dispose = st => {
            if (!st || !st.store) return;
            try { st.store.un('datachanged', st.changed); } catch(e) {}
            try { st.store.un('load', st.loaded); } catch(e) {}
          };
          if (args.action === 'dispose') {
            const st = root[args.token]; dispose(st); delete root[args.token]; return null;
          }
          if (args.action === 'arm') {
            const prior = root[args.token]; dispose(prior); delete root[args.token];
            const g = Ext.getCmp(args.id), s = g && g.getStore && g.getStore();
            if (!s) throw new Error('3022 history store unavailable');
            const state = {store:s, grid_id:args.id, changes:0, loads:0, success:null};
            state.changed = () => { state.changes += 1; };
            state.loaded = (_store, _records, success) => {
              state.loads += 1; state.success = success !== false;
            };
            s.on('datachanged', state.changed); s.on('load', state.loaded);
            root[args.token] = state;
          }
          const st = root[args.token];
          return st ? {grid_id:st.grid_id, changes:st.changes, loads:st.loads, success:st.success} : null;
        }""", {"id": grid_id, "action": action, "token": token})

    def consultar(self, pcba_sn, timeout_s=18.0, empty_confirm_s=3.0):
        started = time.perf_counter()
        self._active_response = None
        telemetry = {"query_started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                     "milestones_ms": {"query_start": 0.0}, "polls": 0, "input_retries": 0,
                     "poll_errors": 0, "mismatch_polls": 0, "status": "UNCONFIRMED",
                     "target_confirmed_before_submit": False, "query_context_ok": False,
                     "timeout_s": timeout_s, "empty_confirm_s": empty_confirm_s}
        def mark(name):
            telemetry["milestones_ms"].setdefault(name, round((time.perf_counter() - started) * 1000, 2))
        try:
            result = self._consultar(pcba_sn, timeout_s, empty_confirm_s, telemetry, mark)
            telemetry["status"] = "CONFIRMED_EMPTY" if result["no_data"] else "CONFIRMED"
            result["query_diagnostics"] = telemetry
            return result
        except Exception as exc:
            if telemetry["status"] == "UNCONFIRMED" and telemetry.get("last_identity") == "MISMATCH":
                telemetry["status"] = "MISMATCH"
            exc.query_diagnostics = telemetry
            raise
        finally:
            if self._active_response is not None:
                frame, token = self._active_response
                try:
                    self._history_response(frame, None, "dispose", token)
                except Exception:
                    telemetry["response_cleanup_failed"] = True
                self._active_response = None
            telemetry["total_ms"] = round((time.perf_counter() - started) * 1000, 2)
            self.last_query_diagnostics = telemetry

    def _consultar(self, pcba_sn, timeout_s, empty_confirm_s, telemetry, mark):
        pcba_sn = normalizar_sn(pcba_sn)
        if not pcba_sn:
            raise ValueError("SN vazio.")
        page = self._page()

        # The real ExtJS form can recreate its SN field for longer than one short
        # retry when moving from one PCBA to the next. Re-resolve the *live* field
        # until it is stable enough to fill and read back; there is no fixed delay.
        input_ready_timeout_s = min(5.0, max(2.0, float(timeout_s)))
        telemetry["input_ready_timeout_s"] = input_ready_timeout_s
        input_deadline = time.time() + input_ready_timeout_s
        last_input_error = None
        campo = None
        while time.time() < input_deadline:
            try:
                campo = self._query_control(page)
                if campo is None:
                    raise RuntimeError("campo SN/IMEI ExtJS em transição")
                mark("input_located")
                campo.wait_for(state="visible", timeout=700)
                campo.fill(pcba_sn, timeout=1200)
                mark("input_filled")
                if normalizar_sn(campo.input_value(timeout=700)) != pcba_sn:
                    raise RuntimeError("3022 input não confirmou a PCBA alvo")
                telemetry["target_confirmed_before_submit"] = True
                telemetry["query_context_ok"] = True  # compatibility: confirmed at submit time
                mark("input_applied")
                last_input_error = None
                break
            except Exception as exc:
                last_input_error = exc
                telemetry["input_retries"] += 1
                if time.time() >= input_deadline:
                    break
                time.sleep(0.10)
        if last_input_error is not None:
            raise RuntimeError(f"3022 não encontrou um campo SN/IMEI visível e estável: {last_input_error}")

        # Resolve View only after the field is stable. The same Ext transition that
        # recreates the input can also invalidate a button locator discovered early.
        query_frame, view, _ = find_button(
            page,
            texts=self.cfg["view_texts"],
            frame_hints=("3022", "View Lot History")
        )
        mark("view_located")

        # Select the visible history before ranking by row count, and keep the
        # same frame/grid through this query. Hidden previous views must not win.
        before = extract_extjs_store_grid(page, self.cfg["expected_headers"],
                                          frame=query_frame, visible_only=True)
        grid_id = before["grid_id"]
        store_token = self._grid_store_token(query_frame, grid_id)
        before_sig = _grid_signature_3022(before)
        telemetry["before_grid"] = before_sig
        telemetry["before_binding"] = {"grid_id": grid_id, "store_token": store_token}
        response_token = f"q-{time.perf_counter_ns()}"
        self._active_response = (query_frame, response_token)
        self._history_response(query_frame, grid_id, "arm", response_token)
        mark("submit")
        view.click(timeout=5000)
        mark("view_clicked")

        inicio = time.time()
        ultima_exc = None
        empty_since = None
        last_grid = None
        while time.time() - inicio < timeout_s:
            telemetry["polls"] += 1
            try:
                rebound = False
                rebound_reason = None
                try:
                    grid = extract_extjs_store_grid(page, self.cfg["expected_headers"],
                                                    frame=query_frame, visible_only=True, grid_id=grid_id)
                except Exception:
                    grid = extract_extjs_store_grid(page, self.cfg["expected_headers"],
                                                    frame=query_frame, visible_only=True)
                    if grid.get("grid_id") != grid_id:
                        rebound = True
                        rebound_reason = "GRID_REPLACED_AFTER_VIEW"
                        grid_id = grid.get("grid_id")
                current_store_token = self._grid_store_token(query_frame, grid.get("grid_id"))
                if store_token and current_store_token and current_store_token != store_token:
                    rebound = True
                    rebound_reason = rebound_reason or "STORE_REBOUND_AFTER_VIEW"
                if rebound:
                    telemetry["binding_rebinds"] = telemetry.get("binding_rebinds", 0) + 1
                    telemetry["binding_rebound"] = True
                    telemetry["binding_rebound_reason"] = rebound_reason
                    mark("binding_rebound_observed")
                    store_token = current_store_token

                last_grid = grid
                mark("first_grid")
                rows = grid.get("rows") or []
                loading = grid.get("store_loading")
                if rows:
                    mark("first_rows_observed")
                telemetry["after_grid"] = _grid_signature_3022(grid)
                telemetry["after_binding"] = {"grid_id": grid.get("grid_id"), "store_token": current_store_token}
                telemetry["grid_changed"] = before_sig != telemetry["after_grid"]
                telemetry["store_loading"] = loading
                response = self._history_response(query_frame, None, "read", response_token) or {}
                telemetry["store_response"] = response
                if response.get("success") is False:
                    raise RuntimeError("3022 consulta falhou na store")
                store_event = bool(response.get("changes") or response.get("loads"))
                refreshed = store_event or rebound or bool(telemetry.get("binding_rebound"))
                telemetry["refresh_proven"] = refreshed
                telemetry["refresh_evidence"] = (rebound_reason if rebound else
                                                   telemetry.get("binding_rebound_reason") if telemetry.get("binding_rebound") else
                                                   "STORE_DATASET_EVENT" if store_event else None)
                if loading is True or refreshed:
                    mark("response_started_observed")
                # Do not re-read `campo` after View. On the real 3022 ExtJS page the
                # query control may be cleared or replaced even though the new history
                # dataset has already arrived. Freshness is a result-store property,
                # not a post-submit input-field property.
                if not refreshed or loading is True:
                    empty_since = None
                    time.sleep(0.12)
                    continue

                mark("grid_ready")
                fields = self._header_fields(page, query_frame)
                identity = _result_identity_3022(rows, fields, pcba_sn)
                telemetry["last_identity"] = identity
                if identity == "MISMATCH":
                    telemetry["mismatch_polls"] += 1
                    raise RuntimeError("3022 retornou identidade explícita diferente da PCBA consultada")
                confirmation = telemetry.get("refresh_evidence") or "STORE_RESPONSE_CONFIRMED"
                telemetry["confirmation"] = confirmation
                mark("response_confirmed")
                mark("identity_confirmed")  # target confirmed pre-submit; row SN remains optional
                if rows:
                    focus = preparar_foco_montagem_teste(rows)
                    mark("parse_completed")
                    return {
                        "query_sn": pcba_sn,
                        "headers": grid.get("headers") or [],
                        "rows": rows,
                        "focus_rows": focus["focus_rows"],
                        "post_test_rows": focus["post_test_rows"],
                        "process_passages": focus.get("process_passages") or [],
                        "process_focus": {
                            "rule": "A5700 é o último posto da linha de teste; packing só começa após A5700 concluído",
                            "test_end_code": focus["test_end_code"],
                            "boundary_found": focus["boundary_found"],
                            "boundary_event_time": focus["boundary_event_time"],
                            "boundary_hist_seq": focus["boundary_hist_seq"],
                            "a5700_reached": focus["a5700_reached"],
                            "a5700_reached_event_time": focus["a5700_reached_event_time"],
                            "a5700_reached_hist_seq": focus["a5700_reached_hist_seq"],
                            "a5700_completed": focus["a5700_completed"],
                            "phase_status": focus["phase_status"],
                            "all_count": focus["all_count"],
                            "focus_count": focus["focus_count"],
                            "post_test_count": focus["post_test_count"],
                            "process_passage_count": len(focus.get("process_passages") or []),
                        },
                        "header_fields": fields,
                        "response_identity": confirmation,
                        "no_data": False,
                    }

                if loading is False:
                    if empty_since is None:
                        empty_since = time.time()
                    if time.time() - empty_since >= empty_confirm_s:
                        mark("empty_confirmed")
                        mark("parse_completed")
                        return {
                            "query_sn": pcba_sn,
                            "headers": grid.get("headers") or [],
                            "rows": [],
                            "focus_rows": [],
                            "post_test_rows": [],
                            "process_passages": [],
                            "process_focus": {
                                "rule": "A5700 é o último posto da linha de teste; packing só começa após A5700 concluído",
                                "test_end_code": DEFAULT_TEST_END_CODE,
                                "boundary_found": False,
                                "boundary_event_time": None,
                                "boundary_hist_seq": None,
                                "a5700_reached": False,
                                "a5700_reached_event_time": None,
                                "a5700_reached_hist_seq": None,
                                "a5700_completed": False,
                                "phase_status": "NO_DATA",
                                "all_count": 0,
                                "focus_count": 0,
                                "post_test_count": 0,
                                "process_passage_count": 0,
                            },
                            "header_fields": fields,
                            "response_identity": confirmation,
                            "no_data": True,
                        }
                else:
                    empty_since = None
            except RuntimeError as exc:
                # Explicit identity contradiction is terminal; other runtime
                # extraction errors remain bounded/transient and are retried.
                if "identidade explícita diferente" in str(exc) or "consulta falhou na store" in str(exc):
                    raise
                telemetry["poll_errors"] += 1
                empty_since = None
                ultima_exc = exc
            except Exception as exc:
                telemetry["poll_errors"] += 1
                empty_since = None
                ultima_exc = exc
            time.sleep(0.12)

        count = len((last_grid or {}).get("rows") or [])
        raise RuntimeError(
            f"A 3022 não confirmou atualização para {pcba_sn}. "
            f"alvo antes do View: {telemetry.get('target_confirmed_before_submit', False)}; "
            f"refresh: {telemetry.get('refresh_proven', False)}; "
            f"última grade: {count}; último erro: {ultima_exc}"
        )


def selecionar_passagem_anterior(eventos, defect_time, posto_codigo=None, posto_nome=None):
    """Compatibility helper used by older tests/modules.

    Without station filters it now delegates to the stronger completed-process
    selector. With a filter, it retains the legacy row-selection behavior while
    checking both Working Oper and Current Oper to tolerate MES transition rows.
    """
    if not posto_codigo and not posto_nome:
        selected = selecionar_processo_anterior(
            eventos, defect_time,
            defect_local_offset_hours=0,
            event_naive_offset_hours=0,
            limit_to_test=False,
        )
        return (selected.get("process") or {}).get("raw") if selected.get("process") else None

    alvo = parse_datetime(defect_time)
    if not alvo:
        return None

    candidatos = []
    for ev in eventos:
        canon = normalizar_evento_3022(ev)
        dt = parse_datetime(canon.get("event_time"))
        if not dt:
            continue
        # Legacy helper may receive all-naive synthetic timestamps.
        try:
            if dt > alvo:
                continue
        except TypeError:
            # Normalize through UTC if one side is timezone-aware.
            dt_utc = grid_time_to_utc(canon.get("event_time"), 0)
            alvo_utc = defect_time_to_utc(defect_time, 0)
            if not dt_utc or not alvo_utc or dt_utc > alvo_utc:
                continue
        codes = [canon.get("working_oper_code") or "", canon.get("operation_code") or ""]
        names = [canon.get("working_oper") or "", canon.get("operation_name") or ""]
        if posto_codigo and not any(str(posto_codigo).lower() in str(c).lower() for c in codes):
            continue
        if posto_nome and not any(str(posto_nome).lower() in str(n).lower() for n in names):
            continue
        candidatos.append((dt, canon.get("hist_seq") if canon.get("hist_seq") is not None else -1, ev))

    if not candidatos:
        return None
    candidatos.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return candidatos[0][2]
