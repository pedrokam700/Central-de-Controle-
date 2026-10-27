from __future__ import annotations

from mes_scheduler import MES, session_object

from operator_evidence import operator_evidence

import importlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


def _has_partial_3074_page(value):
    """Propagate collector pagination proof through the existing result tree."""
    if not isinstance(value, dict):
        return False
    coverage = value.get("coverage")
    if isinstance(coverage, dict) and coverage.get("status") == "incomplete_page":
        return True
    for key in ("base_query", "query", "trace_3074"):
        if _has_partial_3074_page(value.get(key)):
            return True
    return any(_has_partial_3074_page(child)
               for key in ("items", "defect_traces", "results", "component_usage")
               for child in (value.get(key) or []))


def discover_engine(config: Dict[str, Any], agent_dir: Path) -> Optional[Path]:
    candidates = []
    env = os.environ.get("AMES_ENGINE_DIR")
    if env:
        candidates.append(Path(env))
    if config.get("engine_dir"):
        candidates.append(Path(config["engine_dir"]))
    candidates.extend([
        agent_dir.parent / "factory-engine",
        agent_dir.parent / "AMES_Automacao_V0_16_PADRAO_VALIDADO",
        agent_dir.parent.parent / "AMES_Automacao_V0_16_PADRAO_VALIDADO",
        Path.cwd() / "AMES_Automacao_V0_16_PADRAO_VALIDADO",
        Path.cwd(),
    ])
    for p in candidates:
        try:
            p = p.resolve()
        except Exception:
            continue
        if (p / "main.py").exists() and (p / "ames" / "browser.py").exists():
            return p
    return None


def load_engine(engine_dir: Path):
    engine_dir = Path(engine_dir).resolve()
    if str(engine_dir) not in sys.path:
        sys.path.insert(0, str(engine_dir))
    browser_mod = importlib.import_module("ames.browser")
    tela_2114_mod = importlib.import_module("ames.tela_2114")
    return browser_mod.AmesBrowser, tela_2114_mod.Tela2114


def repair_state(row: Dict[str, Any]) -> str:
    status = str(row.get("Repair Status") or "").strip().upper()
    dtype = str(row.get("Defect Type") or "").strip()
    norm = dtype.replace(" ", "").replace("-", "_").lower()
    if status == "N" and not dtype:
        return "AGUARDANDO_ANALISE_AUXILIAR"
    if norm in ("mainboard", "main_board") and status == "N":
        return "AGUARDANDO_REPARO_PLACA"
    if norm in ("mainboard", "main_board") and status == "Y":
        return "REPARO_PLACA_CONCLUIDO"
    if norm in ("phone_disassembly", "phonedisassembly") and status == "Y":
        return "PHONE_DISASSEMBLY_CONCLUIDO"
    if status == "Y":
        return f"FINALIZADO_{dtype or 'OUTRO'}"
    return f"OUTRO_{dtype or 'SEM_TIPO'}_{status or 'SEM_STATUS'}"


def choose_current_history(rows: List[Dict[str, Any]], defect_code: str | None, defect_desc: str | None):
    def seq(r):
        try:
            return int(str(r.get("Defect Hist Seq") or "-1").strip())
        except ValueError:
            return -1
    code = str(defect_code or "").strip()
    desc = str(defect_desc or "").strip().lower()
    same = [r for r in rows if code and str(r.get("Defect Code") or "").strip() == code]
    if not same and desc:
        same = [r for r in rows if str(r.get("Defect Description") or "").strip().lower() == desc]
    pool = same or rows
    return max(pool, key=seq) if pool else None


def refresh_2114(engine_dir: Path, pcbas: Iterable[str]) -> Dict[str, Any]:
    AmesBrowser, Tela2114 = load_engine(engine_dir)
    browser = session_object(AmesBrowser(engine_dir)).connect()
    out = []
    try:
        tela = session_object(Tela2114(browser._target, engine_dir))
        shift = tela.turno_atual()
        for sn in pcbas:
            try:
                result = tela.consultar(sn)
                out.append({"pcba_sn": sn, "status": "COMPLETE", "result": result, "error": None})
            except Exception as exc:
                out.append({"pcba_sn": sn, "status": "ERROR", "result": None,
                            "error": f"{type(exc).__name__}: {exc}"})
        return {"shift": shift, "pcbas": out}
    finally:
        browser.disconnect()


def run_full_v016(engine_dir: Path, export_path: str | Path, line_callback=None) -> Dict[str, Any]:
    """Same V0.16 flows/checkpoints/report, in-process so every MES call uses MES.

    Running the old CLI as a child bypassed the agent coordinator. Parsing,
    checkpointing, transformation and Excel remain outside the gate.
    """
    from datetime import datetime
    from uuid import uuid4
    engine_dir = Path(engine_dir).resolve()
    export_path = Path(export_path).resolve()
    if str(engine_dir) not in sys.path:
        sys.path.insert(0, str(engine_dir))
    parser = importlib.import_module("ames.tela_3028")
    flow = importlib.import_module("core.fluxo_3028_3074")
    history_flow = importlib.import_module("core.fluxo_2114")
    browser_module = importlib.import_module("ames.browser")
    material_module = importlib.import_module("ames.tela_3074")
    history_module = importlib.import_module("ames.tela_2114")
    report = importlib.import_module("reports.relatorio_v016")
    parsed = parser.ler_export_detalhado_3028(export_path)
    fingerprint = flow.fingerprint_file(export_path)[:12]
    output = engine_dir / "output"
    output.mkdir(parents=True, exist_ok=True)
    settings = json.loads((engine_dir / "config" / "settings.json").read_text(encoding="utf-8"))
    times = settings.get("mes_time", {})
    browser = session_object(browser_module.AmesBrowser(engine_dir)).connect()
    try:
        material = session_object(material_module.Tela3074(browser._target, engine_dir))
        history = session_object(history_module.Tela2114(browser._target, engine_dir))
        material._page()
        if not history.turno_atual():
            raise RuntimeError("A 2114 está aberta, mas o Shift não foi selecionado.")
        if line_callback: line_callback("3074 FASE 1")
        result_3074 = flow.executar_fluxo(export_path, parsed, material, max_pcbas=0,
            progress_pcba=lambda i,total,sn,failures,status: line_callback(f"3074 [{i}/{total}] {sn} {status}") if line_callback else None,
            progress_component=lambda pi,pt,di,dt,ci,ct,sn,time,item,source: line_callback(f"3074 [{pi}/{pt}] {sn} componente {ci}/{ct}") if line_callback else None,
            checkpoint_path=output / f"V010_3074_CHECKPOINT_{fingerprint}.json",
            defect_local_offset_hours=float(times.get("defect_local_utc_offset_hours", -3)),
            grid_naive_offset_hours=float(times.get("grid_naive_utc_offset_hours", 0)))
        if _has_partial_3074_page(result_3074):
            result_3074["source_status"] = "PARTIAL"
        if line_callback: line_callback("2114 FASE 2114")
        result_2114 = history_flow.executar_fluxo_2114(result_3074, history,
            source_sha256=result_3074.get("source_sha256", fingerprint),
            checkpoint_path=output / f"V011_2114_CHECKPOINT_{fingerprint}.json",
            seed_checkpoint_path=output / f"V010_2114_CHECKPOINT_{fingerprint}.json",
            progress=lambda i,total,sn,status,state: line_callback(f"2114 [{i}/{total}] {sn} {status}") if line_callback else None,
            pause_s=0.25, include_current=True)
    finally:
        browser.disconnect()
    payload = {"version":"0.16", "generated_at":datetime.now().isoformat(timespec="seconds"),
        "source_3028":str(export_path), "trace_3074":result_3074, "trace_2114":result_2114}
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid4().hex[:8]
    target = output / f"3028_3074_2114_V016_{stamp}.json"
    material_module.salvar_json(payload, target)
    warnings = []
    try:
        report.gerar_excel_integrado(result_3074, result_2114, output / f"3028_3074_2114_ANALISE_V016_{stamp}.xlsx")
    except Exception as exc:
        warnings.append("JSON OK, mas Excel falhou: " + str(exc))
    return {"payload":payload, "json_path":str(target), "stdout_tail":warnings}


def run_deep_v016_records(engine_dir: Path, records: List[Dict[str, Any]], source_key: str, work_dir: str | Path, line_callback=None, event_callback=None, max_pcbas=0, shared_query_memo=None, performance="balanced") -> Dict[str, Any]:
    """Run the validated V0.16 3074 -> 2114 pipeline from records already collected by live 3028.

    This avoids requiring a manual 3028 Excel export.  The tiny JSON source file is
    only a deterministic fingerprint/checkpoint anchor; it is not a MES export and
    is never shown to the operator.  All 3074/2114 business logic remains the
    validated V0.16 implementation.
    """
    import hashlib
    from datetime import datetime

    engine_dir = Path(engine_dir).resolve()
    work_dir = Path(work_dir).resolve()
    work_dir.mkdir(parents=True, exist_ok=True)
    if str(engine_dir) not in sys.path:
        sys.path.insert(0, str(engine_dir))

    browser_mod = importlib.import_module("ames.browser")
    tela3074_mod = importlib.import_module("ames.tela_3074")
    tela2114_mod = importlib.import_module("ames.tela_2114")
    navigation_mod = importlib.import_module("ames.navigation")
    fluxo3074_mod = importlib.import_module("core.fluxo_3028_3074")
    fluxo2114_mod = importlib.import_module("core.fluxo_2114")

    normalized = [dict(r) for r in (records or []) if str((r or {}).get("pcba_sn") or "").strip()]
    shared_query_memo = shared_query_memo if shared_query_memo is not None else {}
    perf = str(performance or "balanced").lower()
    pause_3074 = 0.0 if perf == "fast" else (0.12 if perf == "safe" else 0.03)
    pause_2114 = 0.0 if perf == "fast" else (0.12 if perf == "safe" else 0.03)
    if not normalized:
        return {
            "version": "0.16-live",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source_3028": "LIVE_3028",
            "trace_3074": {"version":"0.8.1","items":[],"processed_pcba_count":0,"pcba_error_count":0,"records_count":0,"unique_pcba_count":0},
            "trace_2114": {"version":"0.16","pcbas":[],"processed_pcba_count":0,"pcba_error_count":0,"pcba_no_data_count":0,"contexts":[],"current_contexts":[]},
        }

    canonical = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",",":"), default=str)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    safe_key = "".join(ch for ch in str(source_key or "live") if ch.isalnum() or ch in "-_")[:48] or "live"
    source_path = work_dir / f"LIVE_3028_{safe_key}_{digest[:12]}.json"
    source_path.write_text(canonical, encoding="utf-8")

    parser_result = {
        "source": str(source_path),
        "records_count": len(normalized),
        "unique_pcba_count": len({str(r.get("pcba_sn") or "").strip() for r in normalized}),
        "unique_pcbas": list(dict.fromkeys(str(r.get("pcba_sn") or "").strip() for r in normalized)),
        "records": normalized,
    }
    checkpoint_3074 = work_dir / f"V020_3074_CHECKPOINT_{digest[:12]}.json"
    checkpoint_2114 = work_dir / f"V020_2114_CHECKPOINT_{digest[:12]}.json"

    settings = {}
    settings_path = engine_dir / "config" / "settings.json"
    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
    except Exception:
        settings = {}
    time_cfg = settings.get("mes_time", {}) or {}
    defect_offset = float(time_cfg.get("defect_local_utc_offset_hours", -3))
    grid_offset = float(time_cfg.get("grid_naive_utc_offset_hours", 0))

    browser = session_object(browser_mod.AmesBrowser(engine_dir)).connect()
    try:
        navigator = session_object(navigation_mod.AmesNavigation(browser._target))
        if line_callback:
            line_callback("3074 preparando view A-MES")
        navigator.ensure_3074()
        if line_callback:
            line_callback("2114 preparando OPC / view")
        page2114 = navigator.ensure_2114()
        navigator.ensure_current_shift_2114(page2114)
        tela3074 = session_object(tela3074_mod.Tela3074(browser._target, engine_dir))
        tela2114 = session_object(tela2114_mod.Tela2114(browser._target, engine_dir))
        # Fail fast with the exact missing real-world prerequisite instead of
        # silently consulting a stale/wrong tab.
        tela3074._page()
        tela2114._page()
        shift = tela2114.turno_atual()
        if not shift:
            raise RuntimeError("AWIP2114 encontrada, mas o Shift nao esta selecionado/legivel.")

        def pcba_progress(i, total, sn, failures, status):
            if line_callback:
                line_callback(f"3074 [{i}/{total}] {sn} {status}")
            if event_callback:
                event_callback({"stage":"3074","kind":"pcba","current":i,"total":total,"sn":sn,"failures":failures,"status":status})

        def component_progress(pi, pt, di, dt, ci, ct, sn, defect_time, item, source):
            if line_callback and (ci == 1 or ci == ct):
                line_callback(f"3074 [{pi}/{pt}] {sn} falha {di}/{dt} componente {ci}/{ct}")
            if event_callback:
                event_callback({"stage":"3074","kind":"component","current":pi,"total":pt,"sn":sn,"defect_index":di,"defect_total":dt,"component_index":ci,"component_total":ct,"item_sn":str((item or {}).get("item_sn") or ""),"item_type":str((item or {}).get("item_type") or ""),"source":source})

        def pcba_result_progress(i, total, item):
            if event_callback:
                event_callback({"stage":"3074","kind":"pcba_result","current":i,"total":total,"sn":str((item or {}).get("pcba_sn") or ""),"status":str((item or {}).get("status") or ""),"item":item})

        result_3074 = fluxo3074_mod.executar_fluxo(
            source_path, parser_result, tela3074, max_pcbas=max(0, int(max_pcbas or 0)),
            progress_pcba=pcba_progress, progress_component=component_progress, progress_result=pcba_result_progress,
            checkpoint_path=checkpoint_3074, query_memo=shared_query_memo, pause_s=pause_3074,
            defect_local_offset_hours=defect_offset, grid_naive_offset_hours=grid_offset,
        )
        if _has_partial_3074_page(result_3074):
            result_3074["source_status"] = "PARTIAL"
        if event_callback:
            done_3074 = int(result_3074.get("requested_pcba_count") or parser_result.get("unique_pcba_count") or 0)
            event_callback({"stage":"3074","kind":"result","current":done_3074,"total":done_3074,"status":str(result_3074.get("source_status") or result_3074.get("status") or "done"),"result":result_3074})

        def hist_progress(i, total, pcba, status, state):
            if line_callback:
                line_callback(f"2114 [{i}/{total}] {pcba} {status}")
            if event_callback:
                event_callback({"stage":"2114","kind":"pcba","current":i,"total":total,"pcba":pcba,"status":status,"state":state if status in {"COMPLETE","ERROR"} else None})

        result_2114 = fluxo2114_mod.executar_fluxo_2114(
            result_3074, tela2114, source_sha256=result_3074.get("source_sha256", digest),
            checkpoint_path=checkpoint_2114, progress=hist_progress, pause_s=pause_2114,
            include_current=True,
        )
        if event_callback:
            done_2114 = int(result_2114.get("requested_pcba_count") or len(result_2114.get("pcbas") or []))
            event_callback({"stage":"2114","kind":"result","current":done_2114,"total":done_2114,"status":str(result_2114.get("status") or "done"),"result":result_2114})
        return {
            "version": "0.16-live",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source_3028": "LIVE_3028",
            "source_fingerprint": digest,
            "shift_2114": shift,
            "trace_3074": result_3074,
            "trace_2114": result_2114,
        }
    finally:
        browser.disconnect()


def classify_individual_sn_target(query: str, rows_3074: list, has_2114_history: bool) -> dict:
    """Infer only a source-proven PCBA/material target; mixed grids stay unknown.

    The scanned SN need not appear in the 3074 Barcode column. A PCBA
    returns component barcodes; a material returns PCBA barcodes. 2114 history
    remains strongest evidence of a board. Never infer from SN prefixes.
    """
    if has_2114_history:
        return {"type": "PCBA", "basis": "2114_HISTORY"}
    query = str(query or "").strip().upper()
    kinds = []
    for row in rows_3074 or []:
        if not isinstance(row, dict):
            return {"type": "SN_INDETERMINADO", "basis": "3074_INVALID_ROW"}
        barcode = str(row.get("Barcode") or "").strip().upper()
        raw_kind = str(row.get("Sn Type") or "").strip().casefold().replace(" ", "")
        if not barcode or not raw_kind:
            return {"type": "SN_INDETERMINADO", "basis": "3074_MISSING_BARCODE_OR_KIND"}
        is_board = "pcba" in raw_kind
        if barcode == query and is_board:
            return {"type": "PCBA", "basis": "3074_EXPLICIT_PCBA_ROW"}
        kinds.append(is_board)
    if not kinds:
        return {"type": "SN_INDETERMINADO", "basis": "NO_TYPE_EVIDENCE"}
    if all(kinds):
        return {"type": "MATERIAL_SN", "basis": "3074_ONLY_RELATED_PCBAS"}
    if not any(kinds):
        return {"type": "PCBA", "basis": "3074_ONLY_LINKED_COMPONENTS"}
    return {"type": "SN_INDETERMINADO", "basis": "3074_MIXED_ROW_TYPES"}


def run_individual_lookup(engine_dir: Path, sn: str, include_3022: bool = True, line_callback=None) -> Dict[str, Any]:
    """Read one scanned SN/PCBA across 3074 + 2114 and, when possible, 3022.

    This is an on-demand diagnostic view. It does not mutate A-MES records and it
    does not require a 3028 export. If 3022 is not readable yet, 3074/2114 data is
    still returned together with an explicit warning.
    """
    from datetime import datetime
    engine_dir = Path(engine_dir).resolve()
    if str(engine_dir) not in sys.path:
        sys.path.insert(0, str(engine_dir))

    browser_mod = importlib.import_module("ames.browser")
    navigation_mod = importlib.import_module("ames.navigation")
    tela3074_mod = importlib.import_module("ames.tela_3074")
    tela2114_mod = importlib.import_module("ames.tela_2114")
    tela3022_mod = importlib.import_module("ames.tela_3022")
    correlacao_mod = importlib.import_module("core.correlacao_falhas")
    temporal3074 = importlib.import_module("core.temporal_3074")

    query = str(sn or "").strip()
    if not query:
        raise ValueError("SN vazio")

    browser = session_object(browser_mod.AmesBrowser(engine_dir)).connect()
    warnings = []
    try:
        nav = session_object(navigation_mod.AmesNavigation(browser._target))
        if line_callback: line_callback("3074", 12, "Abrindo AWIP3074")
        tela3074 = None
        r3074 = None
        source3074_error = None
        source3074_stage = "navigation"
        try:
            nav.ensure_3074()
            source3074_stage = "query"
            tela3074 = session_object(tela3074_mod.Tela3074(browser._target, engine_dir))
            r3074 = tela3074.consultar(query)
            if not isinstance(r3074, dict) or not isinstance(r3074.get("rows"), list):
                raise RuntimeError("3074_GRID_NOT_CONFIRMED")
            if not r3074["rows"] and r3074.get("no_data") is not True and not _has_partial_3074_page(r3074):
                raise RuntimeError("3074_ZERO_NOT_CONFIRMED")
            if r3074["rows"] and r3074.get("no_data") is True:
                raise RuntimeError("3074_GRID_CONTRADICTORY")
        except Exception as exc:
            # A failed AWIP3074 must not abort the independent 2114/3022
            # investigation or invent a zero-material result.
            detail = str(exc).lower()
            if "timeout" in detail or "timed out" in detail or "dentro de" in detail:
                source3074_error = "3074_TIMEOUT"
            elif "grid" in detail or "grade" in detail or "store" in detail or "not_confirmed" in detail:
                source3074_error = "3074_GRID_NOT_CONFIRMED"
            elif source3074_stage == "navigation":
                source3074_error = "3074_NAVIGATION_FAILED"
            else:
                source3074_error = "3074_QUERY_FAILED"
            warnings.append(f"3074 indisponível ({source3074_stage}, {source3074_error}); 2114/3022 continuam independentes.")
            r3074 = None
        rows3074 = (r3074 or {}).get("rows") or []

        # A 3074 pode ser consultada tanto por PCBA quanto por Material SN.
        # The raw grid is an audit trail across multiple mounting cycles, not
        # the bill of materials of any one defect occurrence.
        raw_components = tela3074_mod.componentes_serializados(rows3074, pcba_consultada=query)
        components = []
        material_scope = {"status": "not_collected" if source3074_error else "no_defect_anchor", "basis": None,
                          "scanned_components": 0,
                          "historical_components_ignored": len(raw_components)}
        historical_pcbas = tela3074_mod.pcbas_historicas(rows3074)

        # Material SN queries are deferred until a failure instant is known.
        # Never traverse every historical item of a previously assembled PCBA.
        component_usage = []

        pcba_candidates = []
        seen = set()
        # Always try the scanned SN in 2114; material SN simply returns no-data.
        # Determine whether the SN is a PCBA *before* looking up any other
        # PCBA. Old 3074 rows must not trigger broad 2114 collection.
        for x in [query]:
            x = str(x or "").strip()
            if x and x not in seen:
                seen.add(x); pcba_candidates.append(x)

        if line_callback: line_callback("2114", 35, "Abrindo OPC / AWIP2114")
        p2114 = nav.ensure_2114()
        shift = nav.ensure_current_shift_2114(p2114)
        tela2114 = session_object(tela2114_mod.Tela2114(browser._target, engine_dir))
        histories = []
        for i, pcba in enumerate(pcba_candidates, start=1):
            try:
                if line_callback:
                    line_callback("2114", min(72, 35 + int(37*i/max(1,len(pcba_candidates)))), f"Histórico {i}/{len(pcba_candidates)} · {pcba}")
                shift = nav.ensure_current_shift_2114(p2114)
                rr = tela2114.consultar(pcba)
                histories.append({"pcba_sn": pcba, "status": "COMPLETE", "result": rr, "error": None})
            except Exception as exc:
                histories.append({"pcba_sn": pcba, "status": "ERROR", "result": None, "error": f"{type(exc).__name__}: {exc}"})

        # 2114 history proves PCBA; without 2114, rows must support exactly one
        # interpretation. A mixed 3074 grid must NOT reclassify a PCBA as a
        # material (nor a material as a board) merely because it contains PCBAs.
        query_hist = next((h for h in histories if h["pcba_sn"] == query and h.get("result")
                           and not h["result"].get("no_data") and h["result"].get("rows")), None)
        target_classification = classify_individual_sn_target(query, rows3074, bool(query_hist))
        detected_type = target_classification["type"]
        material_cycles = []
        related_pcbas_total = len(historical_pcbas)
        if detected_type == "PCBA" and r3074 is not None:
            # Old PCBA-type rows on this PCBA's own 3074 page may belong to
            # unrelated mounting cycles. Only prior PCBAs found by querying
            # the selected materials can extend the investigation.
            historical_pcbas = []
        elif detected_type == "MATERIAL_SN" and r3074 is not None:
            material_cycles = temporal3074.ciclos_fisicos_do_material(rows3074)
            # Bounded, most recent related boards first. No implicit traversal
            # of every PCBA ever present in the material's history.
            ordered = sorted((c for c in material_cycles if c.get("bind_time_utc")),
                             key=lambda c: c["bind_time_utc"], reverse=True)
            ranked = list(dict.fromkeys(c["pcba_sn"] for c in ordered))
            ranked.extend(p for p in historical_pcbas if p not in ranked)
            related_pcbas_total = len(ranked)
            historical_pcbas = ranked[:25]
            if related_pcbas_total > 25:
                warnings.append(f"Material SN: {related_pcbas_total-25} PCBAs fora do limite de 25; investigação incremental necessária.")

        process = []
        if include_3022:
            targets3022 = [query] if detected_type == "PCBA" else list(historical_pcbas)
            if targets3022:
                try:
                    if line_callback: line_callback("3022", 78, "Abrindo AWIP3022 · View Lot History")
                    nav.ensure_3022()
                    tela3022 = session_object(tela3022_mod.Tela3022(browser._target, engine_dir))
                    for i, pcba in enumerate(targets3022[:25], start=1):
                        try:
                            rr = tela3022.consultar(pcba)
                            process.append({"pcba_sn": pcba, "status": "COMPLETE", "result": rr, "error": None})
                        except Exception as exc:
                            process.append({"pcba_sn": pcba, "status": "ERROR", "result": None, "error": f"{type(exc).__name__}: {exc}"})
                    if process and not any(p.get("status") == "COMPLETE" for p in process):
                        warnings.append("3022 abriu, mas ainda não retornou dados legíveis neste teste.")
                except Exception as exc:
                    warnings.append(f"3022 indisponível nesta execução: {type(exc).__name__}: {exc}")

        current_pcba_rows = []
        for h in histories:
            if h.get("pcba_sn") == query and h.get("status") == "COMPLETE":
                current_pcba_rows = list(((h.get("result") or {}).get("rows") or []))
                break
        sel = correlacao_mod.selecionar_ocorrencia_atual("", "", current_pcba_rows)
        current_failure_2114 = sel.get("current_history")
        # Latest 2114 is an investigation anchor, NOT proof that it is the
        # same 3028 occurrence requested by an operator. Deep-trace has the
        # exact 3028 timestamp and remains authoritative for failure KPIs.
        anchor_time = (current_failure_2114 or {}).get("Defect Time")
        mounting_views = None
        failure_components = []
        if detected_type == "PCBA" and r3074 is not None:
            selection = temporal3074.montagem_principal_da_consulta(rows3074, query, anchor_time)
            mounting_views = temporal3074.montagens_atual_e_ultima_falha(rows3074, query, anchor_time)
            failure_components = mounting_views["last_failure"]["components"]
            components = [
                {"item_sn": c["item_sn"], "item_type": c["item_type"],
                 "row": c.get("row"), "bind_time_utc": c.get("bind_time_utc"),
                 "unbind_time_utc": c.get("unbind_time_utc"),
                 "iss_status_now": c.get("iss_status_now"),
                 "binding_operation": c.get("binding_operation")}
                for c in selection["components"]
            ]
            is_new_cycle = selection["state"] == "current_new_cycle"
            current_without_2114_anchor = selection["state"] == "current_cycle_unanchored"
            material_scope = {
                "status": "current_mounting_new_cycle" if is_new_cycle else (
                    "current_mounting_unanchored" if current_without_2114_anchor else (
                    "selected_at_latest_2114_candidate" if selection["state"] in
                    ("last_failure_assembly", "current_same_cycle") else "indeterminate")),
                "cycle_state": selection["state"],
                "basis": selection["reference"],
                "defect_time": anchor_time,
                "defect_code": (current_failure_2114 or {}).get("Defect Code"),
                "defect_time_utc": selection["failure_time_utc"],
                "scanned_components": len(components),
                "historical_components_ignored": len(raw_components)-len(components),
                "selection_summary": selection.get("temporal_summary", {}),
                "temporal_unknown": len(selection["candidates"]),
            }
            candidate_components = selection["candidates"]
        else:
            candidate_components = []
            is_new_cycle = False
            current_without_2114_anchor = False
            if detected_type == "MATERIAL_SN" and r3074 is not None:
                warnings.append("3074: consulta Material SN requer histórico de vínculos independente da 2114 da própria SN.")
        component_query_cache = {}
        for idx, comp in enumerate(components, start=1):
            item_sn = str(comp.get("item_sn") or "").strip()
            if not item_sn:
                continue
            try:
                # The immediately preceding 2114/3022 work may leave the OPC
                # or process tab active. Resolve the actual 3074 view again
                # before reading each Material SN; otherwise _page() can pick
                # a view without input[name=sn] and silently lose reuse.
                nav.ensure_3074()
                if line_callback:
                    line_callback("3074", min(72, 35 + int(25 * idx / max(1, len(components)))),
                                  f"Material da montagem {idx}/{len(components)} · {item_sn}")
                item_query = tela3074.consultar(item_sn)
                component_query_cache[item_sn] = item_query
                # Only associations begun before this selected occurrence
                # belong to its reuse investigation. Later PCBAs stay audit-only.
                if is_new_cycle or current_without_2114_anchor:
                    whole = temporal3074.historico_completo_pcbas_do_item(item_query.get("rows") or [])
                    scoped = {
                        "associations_until_defect": whole["associations"],
                        "previous_pcbas": [v for v in whole["associations"] if v["pcba_sn"] != query],
                        "current_pcba_confirmed": query in whole["active_now_pcbas"],
                    }
                else:
                    scoped = temporal3074.pcbas_do_item_ate_a_falha(
                        item_query.get("rows") or [], anchor_time, current_pcba_sn=query,
                    )
                previous = [r["pcba_sn"] for r in scoped["previous_pcbas"]]
                incomplete_history = _has_partial_3074_page(item_query)
                reuse_proven = scoped["current_pcba_confirmed"] and (bool(previous) or not incomplete_history)
                component_usage.append({
                    "item_sn": item_sn, "item_type": comp.get("item_type") or "",
                    "known_pcbas": [r["pcba_sn"] for r in scoped["associations_until_defect"]],
                    "known_use_count": len(scoped["associations_until_defect"]) if scoped["current_pcba_confirmed"] else None,
                    "reuse_count": len(previous) if reuse_proven else None,
                    "is_reused": bool(previous) if reuse_proven else None,
                    "previous_pcbas": previous if scoped["current_pcba_confirmed"] else [],
                    "current_pcba_confirmed": scoped["current_pcba_confirmed"],
                    "binding_operation": comp.get("binding_operation"),
                    "bind_time_utc": comp.get("bind_time_utc"),
                    "unbind_time_utc": comp.get("unbind_time_utc"),
                    "query": item_query,
                })
                if scoped["current_pcba_confirmed"]:
                    for pc in previous:
                        if pc not in historical_pcbas:
                            historical_pcbas.append(pc)
            except Exception as exc:
                component_usage.append({
                    "item_sn": item_sn, "item_type": comp.get("item_type") or "",
                    "known_pcbas": [], "known_use_count": None,
                    "reuse_count": None, "is_reused": None, "previous_pcbas": [],
                    "error": f"{type(exc).__name__}: {exc}",
                })
                warnings.append(f"3074 material {item_sn}: {type(exc).__name__}: {exc}")
        # Investigate the 2114 failure mounting independently from today's Y
        # mounting. A replaced LCD (N now) may have belonged to the failed
        # assembly, even if its replacement has not failed. Never add these
        # historical counts to the current assembly KPI.
        failure_component_usage = []
        for comp in failure_components:
            item_sn = str(comp.get('item_sn') or '').strip()
            if not item_sn:
                continue
            try:
                if item_sn in component_query_cache:
                    item_query = component_query_cache[item_sn]
                else:
                    nav.ensure_3074()
                    item_query = tela3074.consultar(item_sn)
                    component_query_cache[item_sn] = item_query
                scoped = temporal3074.pcbas_do_item_ate_a_falha(
                    item_query.get('rows') or [], anchor_time, current_pcba_sn=query)
                previous = [r['pcba_sn'] for r in scoped['previous_pcbas']]
                verified = scoped['current_pcba_confirmed'] and not _has_partial_3074_page(item_query)
                failure_component_usage.append({
                    'item_sn': item_sn, 'item_type': comp.get('item_type') or '',
                    'known_use_count': len(scoped['associations_until_defect']) if verified else None,
                    'reuse_count': len(previous) if verified else None,
                    'is_reused': bool(previous) if verified else None,
                    'previous_pcbas': previous if verified else [],
                    'current_pcba_confirmed': scoped['current_pcba_confirmed'],
                    'bind_time_utc': comp.get('bind_time_utc'),
                    'unbind_time_utc': comp.get('unbind_time_utc'),
                    'query': item_query,
                })
                if verified:
                    for pc in previous:
                        if pc not in historical_pcbas:
                            historical_pcbas.append(pc)
            except Exception as exc:
                failure_component_usage.append({
                    'item_sn': item_sn, 'item_type': comp.get('item_type') or '',
                    'known_use_count': None, 'reuse_count': None,
                    'is_reused': None, 'previous_pcbas': [],
                    'error': f'{type(exc).__name__}: {exc}',
                })
                warnings.append(f'3074 material na ultima falha {item_sn}: {type(exc).__name__}: {exc}')
        # First query 2114 once per PCBA: current board and historical boards
        # reached through ONLY the selected material subset.
        for pc in historical_pcbas:
            if pc in seen or not pc:
                continue
            seen.add(pc)
            try:
                rr = tela2114.consultar(pc)
                histories.append({"pcba_sn": pc, "status": "COMPLETE", "result": rr, "error": None})
            except Exception as exc:
                histories.append({"pcba_sn": pc, "status": "ERROR", "result": None,
                                  "error": f"{type(exc).__name__}: {exc}"})
        all_hist_rows = []
        for h in histories:
            rr = h.get("result") or {}
            for row in rr.get("rows") or []:
                item = dict(row); item["PCBA Consultada"] = h.get("pcba_sn")
                all_hist_rows.append(item)
        repair_n = sum(1 for r in all_hist_rows if str(r.get("Repair Status") or "").strip().upper() == "N")
        repair_y = sum(1 for r in all_hist_rows if str(r.get("Repair Status") or "").strip().upper() == "Y")

        # Structure current vs previous PCBA failures and relate historical PCBAs
        # from reused components to the current failure. The relation is evidence
        # only (same code/family/different), never an automatic root cause.
        previous_failures_2114 = list(sel.get("prior_histories") or [])
        for hist in previous_failures_2114:
            hist["relation"] = correlacao_mod.comparar_falhas((current_failure_2114 or {}).get("Defect Code", ""), (current_failure_2114 or {}).get("Defect Description", ""), hist.get("Defect Code", ""), hist.get("Defect Description", "")).get("relation") if current_failure_2114 else "SEM_FALHA_ATUAL"
        history_by_pcba = {}
        for h in histories:
            if h.get("status") == "COMPLETE":
                history_by_pcba[h.get("pcba_sn")] = list(((h.get("result") or {}).get("rows") or []))
        material_investigation = None
        if detected_type == "MATERIAL_SN":
            temporal = temporal3074.falhas_durante_vinculos_do_material(
                [c for c in material_cycles if c["pcba_sn"] in historical_pcbas], history_by_pcba)
            recurrence = []
            confirmed = temporal["proven"]
            for index, newer in enumerate(confirmed):
                for older in confirmed[:index]:
                    if older["pcba_sn"] == newer["pcba_sn"]:
                        continue
                    rel = correlacao_mod.comparar_falhas(
                        newer["history"].get("Defect Code", ""), newer["history"].get("Defect Description", ""),
                        older["history"].get("Defect Code", ""), older["history"].get("Defect Description", ""))
                    if rel.get("relation") in ("MESMA_FALHA", "FALHA_SIMILAR"):
                        recurrence.append({"relation": rel["relation"], "reason": rel.get("reason"),
                                           "severity": "high" if rel["relation"] == "MESMA_FALHA" else "medium",
                                           "earlier": older, "later": newer,
                                           "message": "recorrência compatível associada ao material; causalidade não comprovada"})
            material_investigation = {
                "query_material_sn": query,
                "source_view": "3074",
                "observed_cycles": material_cycles,
                "known_use_count": sum(1 for c in material_cycles if c["bind_time_utc"]),
                "distinct_pcba_count": related_pcbas_total,
                "investigated_pcba_count": len(historical_pcbas),
                "omitted_pcba_count": related_pcbas_total-len(historical_pcbas),
                "active_pcbas": list(dict.fromkeys(c["pcba_sn"] for c in material_cycles
                    if c["iss_status_now"] == "Y" and c["bind_time_utc"] and not c["unbind_time_utc"])),
                "failure_links": temporal,
                "recurrences": recurrence,
                "coverage": "partial" if _has_partial_3074_page(r3074) or related_pcbas_total > len(historical_pcbas) or
                    temporal["candidates"] or any(h.get("status") != "COMPLETE" for h in histories[1:]) else "observed",
            }
        reused_components = []
        for comp in component_usage:
            if not comp.get("is_reused"):
                continue
            evidence = []
            strongest = "SEM_HISTORICO"
            for old_pcba in comp.get("previous_pcbas") or []:
                old_rows = history_by_pcba.get(old_pcba) or []
                rels = []
                for hist in old_rows:
                    if current_failure_2114 and not is_new_cycle and not current_without_2114_anchor:
                        cmp = correlacao_mod.comparar_falhas(
                            current_failure_2114.get("Defect Code", ""), current_failure_2114.get("Defect Description", ""),
                            hist.get("Defect Code", ""), hist.get("Defect Description", ""))
                        rel = cmp.get("relation") or "FALHA_DIFERENTE"
                        reason = cmp.get("reason") or ""
                    else:
                        rel, reason = "SEM_FALHA_ATUAL", "Falha atual da PCBA não confirmada na 2114"
                    rels.append(rel)
                    evidence.append({"pcba_sn":old_pcba,"relation":rel,"reason":reason,"history":hist})
                if "MESMA_FALHA" in rels:
                    strongest = "MESMA_FALHA"
                elif strongest != "MESMA_FALHA" and "FALHA_SIMILAR" in rels:
                    strongest = "FALHA_SIMILAR"
                elif strongest not in ("MESMA_FALHA","FALHA_SIMILAR") and rels:
                    strongest = "FALHA_DIFERENTE"
            reused_components.append({
                "item_sn":comp.get("item_sn"),"item_type":comp.get("item_type"),
                "known_use_count":comp.get("known_use_count"),"reuse_count":comp.get("reuse_count"),
                "previous_pcbas":comp.get("previous_pcbas") or [],"relation_to_current_failure":"SEM_FALHA_ATUAL" if is_new_cycle or current_without_2114_anchor else strongest,
                "previous_pcba_evidence":evidence,"error":comp.get("error"),
            })
        failure_reused_components = []
        for comp in failure_component_usage:
            if comp.get('is_reused') is not True:
                continue
            proof = []
            for old_pcba in comp['previous_pcbas']:
                for hist in history_by_pcba.get(old_pcba) or []:
                    comparison = correlacao_mod.comparar_falhas(
                        (current_failure_2114 or {}).get('Defect Code', ''),
                        (current_failure_2114 or {}).get('Defect Description', ''),
                        hist.get('Defect Code', ''), hist.get('Defect Description', ''))
                    proof.append({'pcba_sn': old_pcba, 'history': hist,
                                  'relation': comparison.get('relation') or 'SEM_HISTORICO'})
            failure_reused_components.append({
                'item_sn': comp['item_sn'], 'item_type': comp['item_type'],
                'known_use_count': comp['known_use_count'],
                'reuse_count': comp['reuse_count'],
                'previous_pcbas': comp['previous_pcbas'],
                'previous_pcba_evidence': proof,
            })
        if mounting_views is not None:
            mounting_views['current']['component_usage'] = component_usage
            mounting_views['current']['reused_components'] = reused_components
            mounting_views['last_failure']['component_usage'] = failure_component_usage
            mounting_views['last_failure']['reused_components'] = failure_reused_components
            for view in ('current', 'last_failure'):
                items = mounting_views[view]['component_usage']
                complete = bool(items) and all(item.get('is_reused') is not None for item in items)
                mounting_views[view]['reused_count'] = len(mounting_views[view]['reused_components']) if complete else None
                mounting_views[view]['incomplete_count'] = sum(item.get('is_reused') is None for item in items)

        process_rows = []
        process_focus_rows = []
        process_post_test_rows = []
        process_passages = []
        process_focus_meta = []
        for p in process:
            rr = p.get("result") or {}
            for row in rr.get("rows") or []:
                item = dict(row); item["PCBA Consultada"] = p.get("pcba_sn")
                process_rows.append(item)
            for row in rr.get("focus_rows") or []:
                item = dict(row); item["PCBA Consultada"] = p.get("pcba_sn")
                process_focus_rows.append(item)
            for row in rr.get("post_test_rows") or []:
                item = dict(row); item["PCBA Consultada"] = p.get("pcba_sn")
                process_post_test_rows.append(item)
            for row in rr.get("process_passages") or []:
                item = dict(row); item["pcba_sn"] = p.get("pcba_sn"); item.update(operator_evidence(row.get("raw") or {}))
                process_passages.append(item)
            if rr.get("process_focus"):
                process_focus_meta.append({"pcba_sn": p.get("pcba_sn"), **dict(rr.get("process_focus") or {})})

        # Corroborate the 3074 binding operation with a completed 3022
        # Working Oper between the mounting and the anchored failure.
        # Never assume Current Oper is a completed station.
        for comp in component_usage:
            comp["station_3022_evidence"] = temporal3074.corroborar_posto_3022(
                comp, process_passages, query, anchor_time,
            ) if material_scope["status"] == "selected_at_latest_2114_candidate" else {
                "status": "unavailable", "reason": "no_verified_failure_anchor"
            }

        model = ""
        line = ""
        for h in histories:
            rr = h.get("result") or {}
            if rr.get("model"): model = rr.get("model"); break
        for r in rows3074:
            if not line and r.get("Line Id"): line = r.get("Line Id")
            if not model and r.get("Product Model"): model = r.get("Product Model")

        return {
            "version": "0.5.23-individual",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "query_sn": query, "sn": query,
            "detected_type": detected_type,
            "detected_type_basis": target_classification["basis"],
            "line": line,
            "product_model": model,
            "shift_2114": shift,
            "summary": {
                "3074_rows": len(rows3074) if r3074 is not None else None,
                "serialized_components": len(components) if r3074 is not None else None,
                "raw_historical_component_candidates": len(raw_components) if r3074 is not None else None,
                "related_pcbas": len(historical_pcbas),
                "related_pcbas_total": related_pcbas_total,
                "reused_components": len(reused_components) if r3074 is not None else None,
                "pcba_previous_failures": len(previous_failures_2114),
                "2114_histories": len(all_hist_rows),
                "repair_n": repair_n,
                "repair_y": repair_y,
                "3022_events": len(process_rows) if any(p["status"] == "COMPLETE" for p in process) else None,
                "3022_focus_events": len(process_focus_rows),
                "3022_post_test_events": len(process_post_test_rows),
                "3022_process_passages": len(process_passages),
            },
            "trace_3074": {
                # Query success is independent of whether temporal forensics
                # could classify a reused material. Without this, a successful
                # grid with zero proven reuse was displayed as "not collected".
                "status": "error" if source3074_error else ("partial" if _has_partial_3074_page(r3074) or
                    any(c.get('error') or c.get('is_reused') is None or _has_partial_3074_page(c.get('query'))
                        for c in component_usage + failure_component_usage) else "complete"),
                "error": source3074_error,
                "query_stage": source3074_stage if source3074_error else None,
                "query_row_count": len(rows3074) if r3074 is not None else None,
                "query_no_data_confirmed": r3074.get("no_data") is True if r3074 else False,
                "query": r3074,
                "components": components,
                "candidate_components": candidate_components,
                "material_selection": material_scope,
                "component_usage": component_usage,
                "reused_components": reused_components,
                "mounting_views": mounting_views,
                "related_pcbas": historical_pcbas,
            },
            "material_investigation": material_investigation,
            "trace_2114": {
                "pcbas": histories, "rows": all_hist_rows,
                "current_failure": current_failure_2114,
                "previous_failures": previous_failures_2114 if any(h["pcba_sn"] == query and h["status"] == "COMPLETE" for h in histories) else None,
            },
            "trace_3022": {
                "pcbas": process,
                "rows": process_rows,
                "focus_rows": process_focus_rows,
                "post_test_rows": process_post_test_rows,
                "process_passages": process_passages if any(p["status"] == "COMPLETE" for p in process) else None,
                "operator_evidence": [{**operator_evidence(row), "pcba_sn": row.get("PCBA Consultada")} for row in process_rows if operator_evidence(row)["operator_fields"]],
                "focus_meta": process_focus_meta,
                "default_scope": "MONTAGEM_TESTE_ATE_A5700",
            },
            "warnings": warnings,
        }
    finally:
        browser.disconnect()

def regenerate_v016_excel(engine_dir: Path, integrated_payload: Dict[str, Any], work_dir: str | Path) -> str:
    """Generate the approved V0.16 workbook from an integrated payload without MES access."""
    import subprocess
    import tempfile
    import time

    engine_dir = Path(engine_dir).resolve()
    work_dir = Path(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    output_dir = engine_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    before = {p.resolve() for p in output_dir.glob("3028_3074_2114_ANALISE_V016_*.xlsx")}
    started = time.time()
    tmp = work_dir / f"integrated_for_export_{int(started)}.json"
    tmp.write_text(json.dumps(integrated_payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    try:
        proc = subprocess.run(
            [sys.executable, str(engine_dir / "main.py"), "report-v016-json", str(tmp)],
            cwd=str(engine_dir), capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if proc.returncode != 0:
            raise RuntimeError((proc.stdout or "") + "\n" + (proc.stderr or ""))
        candidates = []
        for p in output_dir.glob("3028_3074_2114_ANALISE_V016_*.xlsx"):
            if p.resolve() not in before and p.stat().st_mtime >= started - 2:
                candidates.append(p)
        if not candidates:
            matches = sorted(output_dir.glob("3028_3074_2114_ANALISE_V016_*.xlsx"), key=lambda x: x.stat().st_mtime, reverse=True)
            if matches and matches[0].stat().st_mtime >= started - 2:
                candidates = [matches[0]]
        if not candidates:
            raise RuntimeError("Relatorio V0.16 nao foi localizado apos regeneracao")
        return str(max(candidates, key=lambda x: x.stat().st_mtime))
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass


def _insight_json_safe(value):
    """Convert validated V0.16 analysis objects into API-safe JSON without losing evidence rows."""
    if isinstance(value, dict):
        return {str(k): _insight_json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_insight_json_safe(v) for v in value]
    if isinstance(value, set):
        return sorted(_insight_json_safe(v) for v in value)
    return value


def build_trace_insights(engine_dir: Path, integrated_payload: Dict[str, Any], line: str | None = None) -> Dict[str, Any]:
    """Build dashboard + drill-downs by reusing the approved V0.16 correlation logic.

    No new MES interpretation is invented here.  The same _build_views and
    _build_indicators_v016 used by the approved Excel are the source of truth.
    """
    engine_dir = Path(engine_dir).resolve()
    if str(engine_dir) not in sys.path:
        sys.path.insert(0, str(engine_dir))
    rel15 = importlib.import_module("reports.relatorio_v015")
    rel16 = importlib.import_module("reports.relatorio_v016")
    trace_3074 = (integrated_payload or {}).get("trace_3074") or {}
    trace_2114 = (integrated_payload or {}).get("trace_2114") or {}
    views = rel15._build_views(trace_3074, trace_2114)

    target = str(line or "").strip()
    if target:
        fv = {}
        for key, val in views.items():
            if isinstance(val, list) and key in {"analise_rows","materiais","reusos","hist_pcba_rows","hist_material_rows","material_summary_rows"}:
                fv[key] = [r for r in val if str((r or {}).get("Linha") or "").strip() == target]
            else:
                fv[key] = val
        views = fv

    ind = rel16._build_indicators_v016(views)
    pcba_rows = list(ind.get("pcba_rows") or [])
    material_rows = list(views.get("material_summary_rows") or [])
    hist_material_rows = list(views.get("hist_material_rows") or [])
    hist_pcba_rows = list(views.get("hist_pcba_rows") or [])

    def iv(v):
        try: return int(v or 0)
        except Exception: return 0
    def pcba_row(r):
        return {k:r.get(k) for k in [
            "Linha","Modelo","PCBA","Defect Time","Defect Code","Defect Desc",
            "Uso da PCBA na falha","Usos conhecidos da PCBA","Reusos anteriores da PCBA",
            "Falhas registradas 2114","Falhas anteriores 2114","Mesma falha anterior",
            "Mesma família anterior","Falhas diferentes anteriores","Situação da PCBA",
            "Repair Status atual","Defect Type atual","Situação reparo atual","Hist Seq atual",
            "Materiais na falha","Materiais 2º+ uso","_pcba_use_index"
        ]}
    def mat_row(r):
        out={k:r.get(k) for k in [
            "Linha","Modelo","PCBA atual","Defect Time atual","Defect Code atual","Defect Desc atual",
            "Tipo material","Material SN","Uso material na falha","Reusos anteriores material",
            "Usos conhecidos material","Reusos conhecidos material","PCBAs desvinculadas únicas",
            "PCBAs com mesma falha","PCBAs com mesma família","PCBAs com falha diferente",
            "PCBAs sem histórico de falha","Falhas 2114 nas desvinculadas","Evidência histórica"
        ]}
        summaries=list(r.get("_pcba_summaries") or [])
        out["PCBAs desvinculadas"]=" | ".join(str(x.get("pcba") or "") for x in summaries if x.get("pcba"))
        out["PCBAs desvinculadas com mesma falha"]=" | ".join(str(x.get("pcba") or "") for x in summaries if x.get("relation")=="MESMA_FALHA" and x.get("pcba"))
        out["PCBAs desvinculadas com mesma família"]=" | ".join(str(x.get("pcba") or "") for x in summaries if x.get("relation")=="FALHA_SIMILAR" and x.get("pcba"))
        return out
    def corr_row(r):
        return {k:r.get(k) for k in [
            "Linha","Modelo","PCBA atual","Defect Time atual","Defect Code atual","Defect Desc atual",
            "Tipo material","Material SN","Uso material na falha","PCBA desvinculada","Estado vínculo atual",
            "Ordem de uso anterior","Falhas 2114 desta PCBA","Classificação desta PCBA",
            "Hist Seq","Defect Code antigo","Defect Description antigo","Defect Oper antigo",
            "Repair Status antigo","Defect Type antigo","Situação reparo antiga","Família falha antiga",
            "Relação desta ocorrência","Motivo da relação"
        ]}

    # Read-only evidence behind TIPOS_COMPONENTE, including non-reused items.
    # Keep physical rows; the UI deduplicates SN + type, never kit/part number.
    component_items = []
    for r in views.get("materiais", []):
        component_items.append({
            "Linha": r.get("Linha"), "Modelo": r.get("Modelo"),
            "PCBA atual": r.get("PCBA da falha"), "Material SN": r.get("Material SN"),
            "Tipo material": rel16._material_name(r.get("Tipo material")),
            "Defect Code atual": r.get("Defect Code"), "Defect Time atual": r.get("Defect Time"),
            "Reusos anteriores material": r.get("Reusos anteriores a falha"),
            "PCBAs desvinculadas": r.get("PCBAs antigas"),
        })

    # De-duplicate material summary rows by current context + Material SN.
    material_unique=[]; seen=set()
    for r in material_rows:
        key=(r.get("Linha"),r.get("PCBA atual"),r.get("Defect Code atual"),r.get("Defect Time atual"),r.get("Material SN"))
        if key in seen: continue
        seen.add(key); material_unique.append(r)

    pcba_second=[r for r in pcba_rows if iv(r.get("_pcba_use_index"))==2]
    pcba_multi=[r for r in pcba_rows if iv(r.get("_pcba_use_index"))>=3]
    pcba_prior=[r for r in pcba_rows if iv(r.get("_pcba_use_index"))>=2 and iv(r.get("Falhas anteriores 2114"))>0]
    pcba_same=[r for r in pcba_rows if iv(r.get("Mesma falha anterior"))>0]
    pcba_family=[r for r in pcba_rows if iv(r.get("Mesma família anterior"))>0]
    pcba_second_same=[r for r in pcba_second if iv(r.get("Mesma falha anterior"))>0]
    pcba_second_family=[r for r in pcba_second if iv(r.get("Mesma família anterior"))>0]

    mat_second=[r for r in material_unique if iv(r.get("Reusos anteriores material"))==1]
    mat_multi=[r for r in material_unique if iv(r.get("Reusos anteriores material"))>=2]
    mat_old=[r for r in material_unique if iv(r.get("Falhas 2114 nas desvinculadas"))>0]
    mat_same=[r for r in material_unique if iv(r.get("PCBAs com mesma falha"))>0]
    mat_family=[r for r in material_unique if iv(r.get("PCBAs com mesma família"))>0]
    corr_same=[r for r in hist_material_rows if str(r.get("Classificação desta PCBA") or "") == "MESMA FALHA"]
    corr_family=[r for r in hist_material_rows if str(r.get("Classificação desta PCBA") or "") == "MESMA FAMÍLIA"]

    # Rates are derived only from the validated V0.16 counts above.  They are
    # line-scoped and meant for prioritization, never for mixing operational KPIs.
    pmap=dict(ind.get("pcba_kpis") or [])
    mmap=dict(ind.get("material_kpis") or [])
    omap=dict(ind.get("overview_kpis") or [])
    def pct(num, den):
        try:
            return round((float(num or 0) / float(den or 0)) * 100.0, 1) if float(den or 0) else 0.0
        except Exception:
            return 0.0
    reused_pcba=iv(pmap.get("PCBA em 2º uso"))+iv(pmap.get("PCBA em 3º+ uso"))
    unique_pcba=iv(omap.get("PCBAs únicas com falha"))
    reused_mat=iv(mmap.get("Materiais únicos 2º+ uso"))
    total_mat=iv(omap.get("Materiais únicos presentes"))
    rate_kpis=[
        ("% PCBAs atuais em 2º+ uso", pct(reused_pcba, unique_pcba)),
        ("% PCBAs reutilizadas com falha anterior", pct(pmap.get("PCBAs 2º+ uso com falha anterior"), reused_pcba)),
        ("% PCBAs em 2º uso que repetiram mesma falha", pct(len(pcba_second_same), len(pcba_second))),
        ("% materiais presentes que são 2º+ uso", pct(reused_mat, total_mat)),
        ("% materiais reutilizados com falha anterior", pct(mmap.get("Reuso COM falha em PCBA desvinculada"), reused_mat)),
        ("% materiais reutilizados com mesma falha", pct(mmap.get("Reuso com a MESMA falha"), reused_mat)),
        ("% materiais reutilizados com mesma família", pct(mmap.get("Reuso com falha da MESMA família"), reused_mat)),
    ]

    return _insight_json_safe({
        "schema":"ames-insights-v1",
        "classifier_version":importlib.import_module("core.failure_taxonomy").configuration()["version"],
        "line":target or None,
        "overview_kpis":ind.get("overview_kpis") or [],
        "pcba_kpis":list(ind.get("pcba_kpis") or []) + [
            ("PCBAs em 2º uso com mesma falha anterior", len(pcba_second_same)),
            ("PCBAs em 2º uso com mesma família anterior", len(pcba_second_family)),
        ],
        "material_kpis":ind.get("material_kpis") or [],
        "correlation_kpis":ind.get("correlation_kpis") or [],
        "rate_kpis":rate_kpis,
        "component_types":ind.get("component_types") or [],
        "current_repair_states":ind.get("current_repair_states") or [],
        "families":ind.get("families") or [],
        "defect_types":ind.get("defect_types") or [],
        "drilldowns":{
            "pcba_second_use":[pcba_row(r) for r in pcba_second],
            "pcba_3plus_use":[pcba_row(r) for r in pcba_multi],
            "pcba_reused_with_prior_failure":[pcba_row(r) for r in pcba_prior],
            "pcba_same_failure":[pcba_row(r) for r in pcba_same],
            "pcba_same_family":[pcba_row(r) for r in pcba_family],
            "pcba_second_use_same_failure":[pcba_row(r) for r in pcba_second_same],
            "pcba_second_use_same_family":[pcba_row(r) for r in pcba_second_family],
            "material_second_use":[mat_row(r) for r in mat_second],
            "material_3plus_use":[mat_row(r) for r in mat_multi],
            "material_with_old_failure":[mat_row(r) for r in mat_old],
            "material_same_failure":[mat_row(r) for r in mat_same],
            "material_same_family":[mat_row(r) for r in mat_family],
            "correlation_same_failure":[corr_row(r) for r in corr_same],
            "correlation_same_family":[corr_row(r) for r in corr_family],
            "pcba_analysis":[pcba_row(r) for r in pcba_rows],
            "material_analysis":[mat_row(r) for r in material_unique],
            "component_type_items":component_items,
            "material_history":[corr_row(r) for r in hist_material_rows],
            "pcba_history":hist_pcba_rows,
        }
    })
