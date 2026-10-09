from __future__ import annotations

from mes_scheduler import MES, session_object

import importlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


def discover_engine(config: Dict[str, Any], agent_dir: Path) -> Optional[Path]:
    candidates = []
    env = os.environ.get("AMES_ENGINE_DIR")
    if env:
        candidates.append(Path(env))
    if config.get("engine_dir"):
        candidates.append(Path(config["engine_dir"]))
    candidates.extend([
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
            checkpoint_path=output / f"V010_3074_CHECKPOINT_{fingerprint}.json",
            defect_local_offset_hours=float(times.get("defect_local_utc_offset_hours", -3)),
            grid_naive_offset_hours=float(times.get("grid_naive_utc_offset_hours", 0)))
        if line_callback: line_callback("2114 FASE 2114")
        result_2114 = history_flow.executar_fluxo_2114(result_3074, history,
            source_sha256=result_3074.get("source_sha256", fingerprint),
            checkpoint_path=output / f"V011_2114_CHECKPOINT_{fingerprint}.json", include_current=True)
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
        if event_callback:
            event_callback({"stage":"3074","kind":"result","result":result_3074})

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

    query = str(sn or "").strip()
    if not query:
        raise ValueError("SN vazio")

    browser = session_object(browser_mod.AmesBrowser(engine_dir)).connect()
    warnings = []
    try:
        nav = session_object(navigation_mod.AmesNavigation(browser._target))
        if line_callback: line_callback("3074", 12, "Abrindo AWIP3074")
        nav.ensure_3074()
        tela3074 = session_object(tela3074_mod.Tela3074(browser._target, engine_dir))
        r3074 = tela3074.consultar(query)
        rows3074 = r3074.get("rows") or []

        # A 3074 pode ser consultada tanto por PCBA quanto por Material SN.
        components = tela3074_mod.componentes_serializados(rows3074, pcba_consultada=query)
        historical_pcbas = tela3074_mod.pcbas_historicas(rows3074)
        pcba_candidates = []
        seen = set()
        # Always try the scanned SN in 2114; material SN simply returns no-data.
        for x in [query, *historical_pcbas]:
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
                rr = tela2114.consultar(pcba)
                histories.append({"pcba_sn": pcba, "status": "COMPLETE", "result": rr, "error": None})
            except Exception as exc:
                histories.append({"pcba_sn": pcba, "status": "ERROR", "result": None, "error": f"{type(exc).__name__}: {exc}"})

        # Detect likely current/query PCBA from 2114 evidence; if scanned SN has no
        # 2114 history and 3074 returned PCBA rows, treat it as a material query.
        query_hist = next((h for h in histories if h["pcba_sn"] == query and h.get("result") and not h["result"].get("no_data")), None)
        detected_type = "PCBA" if query_hist else ("MATERIAL_SN" if historical_pcbas else "SN_INDETERMINADO")

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
                    warnings.append(f"3022 ainda pendente de validação real: {type(exc).__name__}: {exc}")

        all_hist_rows = []
        for h in histories:
            rr = h.get("result") or {}
            for row in rr.get("rows") or []:
                item = dict(row); item["PCBA Consultada"] = h.get("pcba_sn")
                all_hist_rows.append(item)
        repair_n = sum(1 for r in all_hist_rows if str(r.get("Repair Status") or "").strip().upper() == "N")
        repair_y = sum(1 for r in all_hist_rows if str(r.get("Repair Status") or "").strip().upper() == "Y")

        process_rows = []
        for p in process:
            rr = p.get("result") or {}
            for row in rr.get("rows") or []:
                item = dict(row); item["PCBA Consultada"] = p.get("pcba_sn")
                process_rows.append(item)

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
            "query_sn": query,
            "detected_type": detected_type,
            "line": line,
            "product_model": model,
            "shift_2114": shift,
            "summary": {
                "3074_rows": len(rows3074),
                "serialized_components": len(components),
                "related_pcbas": len(historical_pcbas),
                "2114_histories": len(all_hist_rows),
                "repair_n": repair_n,
                "repair_y": repair_y,
                "3022_events": len(process_rows),
            },
            "trace_3074": {
                "query": r3074,
                "components": components,
                "related_pcbas": historical_pcbas,
            },
            "trace_2114": {"pcbas": histories, "rows": all_hist_rows},
            "trace_3022": {"pcbas": process, "rows": process_rows},
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
            "material_history":[corr_row(r) for r in hist_material_rows],
            "pcba_history":hist_pcba_rows,
        }
    })
