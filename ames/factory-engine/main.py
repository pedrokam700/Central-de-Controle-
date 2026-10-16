import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from storage.database import Database

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "ames.db"

# Garante as pastas locais mesmo quando o ZIP foi extraído sem diretórios vazios.
for _folder in ("data", "logs", "output"):
    (BASE_DIR / _folder).mkdir(parents=True, exist_ok=True)

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


def cmd_init_db():
    db = Database(DB_PATH)
    db.initialize()
    print(f"[OK] Banco inicializado: {db.path}")


def _browser():
    from ames.browser import AmesBrowser
    return AmesBrowser(BASE_DIR).connect()


def cmd_diagnostico():
    from ames.diagnostico import executar_diagnostico
    b = _browser()
    try:
        executar_diagnostico(b, BASE_DIR / "logs")
    finally:
        b.disconnect()


def cmd_inspect(tela):
    from ames.inspector import inspecionar_tela
    b = _browser()
    try:
        p = inspecionar_tela(b, BASE_DIR / "logs", tela)
        print(f"[OK] Estrutura capturada: {p}")
    finally:
        b.disconnect()


def cmd_query_3074(sn):
    from ames.tela_3074 import Tela3074, salvar_json
    b = _browser()
    try:
        r = Tela3074(b, BASE_DIR).consultar(sn)
        out = BASE_DIR / "output" / f"3074_{sn}_{datetime.now():%Y%m%d_%H%M%S}.json"
        salvar_json(r, out)
        print(f"[OK] Linhas retornadas: {len(r['rows'])}")
        print(f"[OK] Resultado: {out}")
    finally:
        b.disconnect()


def cmd_g1(sn):
    from ames.tela_3074 import Tela3074, componentes_serializados, pcbas_historicas, salvar_json
    b = _browser()
    try:
        t = Tela3074(b, BASE_DIR)
        print(f"[1/3] Consultando PCBA {sn}...")
        base = t.consultar(sn)
        comps = componentes_serializados(base["rows"], sn)
        print(f"[OK] Componentes serializados unicos: {len(comps)}")
        if not comps:
            raise RuntimeError("Nenhum componente serializado foi extraido.")

        print("\nComponentes encontrados:")
        for i, c in enumerate(comps, 1):
            print(f" {i:02d}. {c['item_type']} | {c['item_sn']}")

        escolha = input(f"\nEscolha UM componente [1-{len(comps)}; Enter=1]: ").strip()
        idx = int(escolha) if escolha else 1
        if idx < 1 or idx > len(comps):
            raise ValueError("Indice invalido.")

        item = comps[idx - 1]
        hist = t.consultar(item["item_sn"])
        pcbas = pcbas_historicas(hist["rows"])
        result = {
            "pcba_query": sn,
            "components": comps,
            "selected_item": {"item_sn": item["item_sn"], "item_type": item["item_type"]},
            "historical_pcbas": pcbas,
            "distinct_pcba_count": len(pcbas),
            "item_query_rows": hist["rows"],
        }
        out = BASE_DIR / "output" / f"G1_3074_{datetime.now():%Y%m%d_%H%M%S}.json"
        salvar_json(result, out)
        print(f"\n[OK] Resultado salvo: {out}")
    finally:
        b.disconnect()


def cmd_scan_all_3074(sn):
    from ames.tela_3074 import Tela3074, salvar_json
    from core.varredura_3074 import executar_varredura
    from reports.varredura_3074_excel import gerar_excel_varredura

    def progress(i, total, item, source):
        tipo = item.get("item_type", "")
        origem = "retomado" if source == "CHECKPOINT" else "MES"
        print(f"[{i}/{total}] {tipo} | {item['item_sn']} | {origem}")

    b = _browser()
    try:
        print(f"\nConsultando PCBA base: {sn}")
        resultado = executar_varredura(
            Tela3074(b, BASE_DIR),
            sn,
            progress=progress,
            checkpoint_cb=None,
            existing=None,
            query_memo={},
            pause_s=0.25,
        )
    finally:
        b.disconnect()

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_json = BASE_DIR / "output" / f"G1_VARREDURA_3074_{stamp}.json"
    out_xlsx = BASE_DIR / "output" / f"G1_VARREDURA_3074_{stamp}.xlsx"
    salvar_json(resultado, out_json)
    gerar_excel_varredura(resultado, out_xlsx)

    s = resultado["summary"]
    print("\n================ RESUMO ================")
    print(f"Registros serializados ..... {s.get('component_records_total', s.get('components_total', 0))}")
    print(f"Consultas OK ............... {s['components_ok']}")
    print(f"Erros ...................... {s['components_error']}")
    print(f"Sem vinculo PCBA ........... {s.get('sem_vinculo_pcba', 0)}")
    print(f"Sem reutilizacao ........... {s['sem_reutilizacao']}")
    print(f"Segundo uso ................ {s['segundo_uso']}")
    print(f"Reutilizacao multipla ...... {s['reutilizacao_multipla']}")
    print(f"Reutilizados total ......... {s['reutilizados_total']}")

    print(f"\n[OK] JSON : {out_json}")
    print(f"[OK] Excel: {out_xlsx}")


def cmd_validate_3028(path):
    from ames.tela_3028 import ler_export_detalhado_3028
    from reports.relatorio_3028 import gerar_excel_3028
    result = ler_export_detalhado_3028(path)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_json = BASE_DIR / "output" / f"3028_IMPORT_{stamp}.json"
    out_xlsx = BASE_DIR / "output" / f"3028_IMPORT_{stamp}.xlsx"
    out_json.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8"
    )
    gerar_excel_3028(result, out_xlsx)

    print("\n================ 3028 ================")
    print(f"Falhas detalhadas .......... {result['records_count']}")
    print(f"PCBAs unicas ............... {result['unique_pcba_count']}")
    sc = result["search_condition"]
    print(f"Filtro Line Id ............. {sc.get('Line Id','(todas)')}")
    print(f"Periodo .................... {sc.get('Date From','')} {sc.get('Start Time Zone','')}:00 -> {sc.get('Date To','')} {sc.get('End Time Zone','')}:00")
    print(f"Modelo ..................... {sc.get('Prod Model','')}")
    print(f"Total DefectQty ............ {result['overall_summary'].get('Total DefectQty','')}")
    if result["warnings"]:
        for w in result["warnings"]:
            print(f"[AVISO] {w}")
    print(f"\n[OK] JSON : {out_json}")
    print(f"[OK] Excel: {out_xlsx}")


def cmd_3028_to_3074(path, max_pcbas):
    from ames.tela_3028 import ler_export_detalhado_3028
    from ames.tela_3074 import Tela3074, salvar_json
    from core.fluxo_3028_3074 import executar_fluxo, fingerprint_file
    from reports.relatorio_3028_3074 import gerar_excel_3028_3074, listar_reusos_terminal

    parsed = ler_export_detalhado_3028(path)
    source_hash = fingerprint_file(path)[:12]
    # V0.8.2 preserva o checkpoint V0.8 antigo porque agora cada item também
    # guarda o histórico completo de PCBAs para o Excel operacional.
    checkpoint = BASE_DIR / "output" / f"3028_PARA_3074_V081_CHECKPOINT_{source_hash}.json"
    live_result = BASE_DIR / "output" / f"3028_PARA_3074_V081_EM_ANDAMENTO_{source_hash}.json"

    settings = json.loads((BASE_DIR / "config" / "settings.json").read_text(encoding="utf-8"))
    time_cfg = settings.get("mes_time", {})
    defect_offset = float(time_cfg.get("defect_local_utc_offset_hours", -3))
    grid_offset = float(time_cfg.get("grid_naive_utc_offset_hours", 0))

    print(f"\nCheckpoint temporal: {checkpoint.name}")
    if checkpoint.exists():
        print("[RETOMADA] Existe progresso temporal deste mesmo Excel.")

    def progress_pcba(i, total, sn, falhas, status):
        if status == "CHECKPOINT_COMPLETE":
            print(f"[{i}/{total}] PCBA {sn} | JA CONCLUIDA - pulando")
        else:
            print(f"\n[{i}/{total}] PCBA {sn} | falhas no Excel: {falhas}")

    def progress_component(pi, pt, di, dt, ci, ct, sn, defect_time, item, source):
        tipo = item.get("item_type", "")
        origem = "retomado" if source == "CHECKPOINT" else "MES"
        iss = item.get("iss_status_now", "") or "-"
        print(f"    [{pi}/{pt}] falha [{di}/{dt}] {defect_time} | componente [{ci}/{ct}] {tipo} | Iss agora={iss} | {origem}")

    b = _browser()
    result = None
    try:
        result = executar_fluxo(
            path,
            parsed,
            Tela3074(b, BASE_DIR),
            max_pcbas=max_pcbas,
            progress_pcba=progress_pcba,
            progress_component=progress_component,
            checkpoint_path=checkpoint,
            defect_local_offset_hours=defect_offset,
            grid_naive_offset_hours=grid_offset,
        )
    except KeyboardInterrupt:
        print("\n[PARADO PELO USUARIO] Checkpoint temporal salvo. Execute novamente para retomar.")
        return
    finally:
        b.disconnect()

    salvar_json(result, live_result)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    final_out = BASE_DIR / "output" / f"3028_PARA_3074_V081_{stamp}.json"
    final_excel = BASE_DIR / "output" / f"3028_3074_ANALISE_REUSO_{stamp}.xlsx"
    salvar_json(result, final_out)
    excel_error = None
    try:
        gerar_excel_3028_3074(result, final_excel)
    except Exception as exc:
        excel_error = f"{type(exc).__name__}: {exc}"

    print("\n================ RESULTADO TEMPORAL ================")
    print(f"Falhas no arquivo .......... {result['records_count']}")
    print(f"PCBAs unicas no arquivo .... {result['unique_pcba_count']}")
    print(f"PCBAs solicitadas .......... {result['requested_pcba_count']}")
    print(f"PCBAs concluidas ........... {result['processed_pcba_count']}")
    print(f"PCBAs com erro ............. {result['pcba_error_count']}")

    for item in result["items"]:
        print(f"\nPCBA {item['pcba_sn']} | {item['status']}")
        if item.get("error"):
            print(f"  erro ..................... {item['error']}")
            continue
        for d in item.get("defect_traces", []):
            defect = d.get("defect") or {}
            tr = d.get("trace_3074") or {}
            ts = (tr.get("temporal_filter") or {}).get("summary") or {}
            s = tr.get("summary") or {}
            print(f"  Falha {defect.get('defect_time','')} | {defect.get('defect_desc','')}")
            print(f"    status temporal ........ {tr.get('status','')}")
            print(f"    ativos na falha ........ {ts.get('active_at_defect',0)}")
            print(f"    removidos antes ........ {ts.get('ended_before_defect',0)}")
            print(f"    vinculados depois ...... {ts.get('bound_after_defect',0)}")
            print(f"    Iss Y agora (ativos la)  {ts.get('iss_status_y_now_among_active_then',0)}")
            print(f"    Iss N agora (ativos la)  {ts.get('iss_status_n_now_among_active_then',0)}")
            print(f"    com reuso anterior ..... {s.get('componentes_com_reuso_anterior',0)}")
            print(f"    erros de item .......... {s.get('components_error',0)}")

    reusos = listar_reusos_terminal(result)
    print("\n================ MATERIAIS DE REUSO ================")
    if not reusos:
        print("Nenhum material de reuso identificado neste lote.")
    else:
        for r in reusos:
            uses = r.get("Usos totais conhecidos") or r.get("Usos ate a falha") or 0
            reuses = r.get("Reusos totais conhecidos")
            if reuses is None:
                reuses = r.get("Reusos anteriores a falha") or 0
            print(f"- {r.get('Tipo material','')} | {r.get('Material SN','')} | usos={uses} | reusos={reuses}")
            print(f"  PCBAs antigas: {r.get('PCBAs antigas') or '-'}")
            if r.get("PCBAs atuais Y"):
                print(f"  PCBA(s) Y agora: {r.get('PCBAs atuais Y')}")

    print(f"\n[OK] Resultado temporal: {final_out}")
    print(f"[OK] Checkpoint temporal: {checkpoint}")
    if excel_error:
        print(f"[AVISO] JSON concluido, mas o Excel nao foi gerado: {excel_error}")
    else:
        print(f"[OK] Excel organizado: {final_excel}")


def cmd_report_3028_3074(json_path):
    from reports.relatorio_3028_3074 import gerar_excel_3028_3074
    path = Path(json_path)
    result = json.loads(path.read_text(encoding="utf-8"))
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = BASE_DIR / "output" / f"3028_3074_ANALISE_REUSO_{stamp}.xlsx"
    gerar_excel_3028_3074(result, out)
    print(f"[OK] Excel organizado: {out}")
    print("Abas: Falhas_3028, Materiais e REUSO.")



def cmd_query_3022(sn):
    from ames.tela_3022 import Tela3022
    from ames.tela_3074 import salvar_json

    b = _browser()
    try:
        from ames.navigation import AmesNavigation
        nav = AmesNavigation(b)
        nav.ensure_3022()
        print(f"\n[3022] Consultando SN/IMEI/A-S {sn} ...")
        result = Tela3022(b, BASE_DIR).consultar(sn)
    finally:
        b.disconnect()

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe = "".join(c for c in str(sn) if c.isalnum() or c in "-_")[:64] or "SN"
    out = BASE_DIR / "output" / f"3022_{safe}_{stamp}.json"
    salvar_json(result, out)

    focus = result.get("process_focus") or {}
    print("\n================ 3022 ================")
    print(f"Consulta .................... {result.get('query_sn','')}")
    print(f"Eventos totais .............. {len(result.get('rows') or [])}")
    print(f"Foco montagem/teste ......... {len(result.get('focus_rows') or [])}")
    print(f"Pós-A5700 / packing ......... {len(result.get('post_test_rows') or [])}")
    print(f"Passagens de processo ....... {len(result.get('process_passages') or [])}")
    print(f"A5700 alcançado ............. {'SIM' if focus.get('a5700_reached') else 'NÃO'}")
    print(f"A5700 concluído ............. {'SIM' if focus.get('a5700_completed') else 'NÃO'}")
    print(f"Estado de fase .............. {focus.get('phase_status') or '—'}")
    print(f"Horário limite A5700 ........ {focus.get('boundary_event_time') or '—'}")
    print(f"Hist Seq limite A5700 ....... {focus.get('boundary_hist_seq') if focus.get('boundary_hist_seq') is not None else '—'}")
    print(f"[OK] Resultado: {out}")
    print("Regra: histórico bruto completo preservado; packing só é separado após A5700 comprovadamente concluído.")
    return result

def cmd_query_2114(sn):
    from ames.tela_2114 import Tela2114
    from ames.tela_3074 import salvar_json

    b = _browser()
    try:
        print(f"\n[2114] Consultando PCBA {sn} ...")
        result = Tela2114(b, BASE_DIR).consultar(sn)
    finally:
        b.disconnect()

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = BASE_DIR / "output" / f"2114_{sn}_{stamp}.json"
    salvar_json(result, out)

    s = result.get("summary") or {}
    print("\n================ 2114 ================")
    print(f"PCBA ....................... {result.get('query_sn','')}")
    print(f"Shift ...................... {result.get('shift','')}")
    print(f"Modelo ..................... {result.get('model','')}")
    print(f"Material ................... {result.get('material','')}")
    print(f"MFG Order .................. {result.get('mfg_order','')}")
    print(f"Históricos ................. {s.get('histories_total',0)}")
    print(f"Phone Disassembly .......... {s.get('phone_disassembly',0)}")
    print(f"MainBoard .................. {s.get('mainboard',0)}")
    print(f"Outros Defect Type ......... {s.get('other_defect_type',0)}")
    print(f"Repair Status Y ............ {s.get('repair_status_y',0)}")
    print(f"Repair Status N ............ {s.get('repair_status_n',0)}")

    for row in result.get("rows", []):
        print(
            f"  Seq={row.get('Defect Hist Seq','')} | "
            f"{row.get('Defect Code','')} | "
            f"{row.get('Defect Description','')} | "
            f"Type={row.get('Defect Type','')} | "
            f"Repair={row.get('Repair Status','')}"
        )

    print(f"\n[OK] Resultado 2114: {out}")


def _run_2114_phase(result_3074, browser, checkpoint_2114, seed_result=None):
    from ames.tela_2114 import Tela2114
    from core.fluxo_2114 import executar_fluxo_2114, extrair_plano_2114_completo

    plan = extrair_plano_2114_completo(result_3074)
    print("\n================ FASE 2114 V0.11 ================")
    print(f"PCBAs atuais unicas ........ {plan['current_target_count']}")
    print(f"PCBAs historicas unicas .... {plan['historical_target_count']}")
    print(f"PCBAs 2114 unicas total .... {plan['target_count']}")
    print(f"Contextos de reuso ......... {plan['historical_context_count']}")

    if not plan["targets"]:
        print("Nenhuma PCBA para consultar na 2114.")
        return {
            "version": "0.16", "shift": "", "source_sha256": result_3074.get("source_sha256", ""),
            "requested_pcba_count": 0, "processed_pcba_count": 0, "pcba_error_count": 0,
            "pcba_no_data_count": 0, "historical_target_count": 0, "current_target_count": 0,
            "context_count": 0, "current_context_count": 0,
            "checkpoint_path": str(checkpoint_2114), "contexts": [], "current_contexts": [], "pcbas": [],
        }

    tela = Tela2114(browser, BASE_DIR)
    print(f"Turno 2114 selecionado ..... {tela.turno_atual()}")
    print(f"Checkpoint 2114 ............ {Path(checkpoint_2114).name}")

    legacy_checkpoint = Path(str(checkpoint_2114).replace("V011_", "V010_"))
    if Path(checkpoint_2114).exists():
        print("[RETOMADA] Existe checkpoint V0.11 deste mesmo relatorio/turno.")
    elif legacy_checkpoint.exists():
        print("[MIGRACAO] Reaproveitando consultas COMPLETE do checkpoint V0.10.")
    if seed_result:
        print("[MIGRACAO] Reaproveitando resultados 2114 já existentes no JSON anterior.")

    def progress(i, total, pcba, status, state):
        if status == "CHECKPOINT_COMPLETE":
            print(f"[{i}/{total}] 2114 {pcba} | JA CONCLUIDA - pulando")
        elif status == "RUNNING":
            print(f"[{i}/{total}] 2114 {pcba} | consultando...")
        elif status == "COMPLETE":
            r = state.get("result") or {}
            s = r.get("summary") or {}
            print(
                f"           OK | historicos={s.get('histories_total',0)} | "
                f"Phone_Disassembly={s.get('phone_disassembly',0)} | MainBoard={s.get('mainboard',0)}"
            )
        else:
            print(f"           {status} | {state.get('error') or ''}")

    return executar_fluxo_2114(
        result_3074, tela,
        source_sha256=result_3074.get("source_sha256", ""),
        checkpoint_path=checkpoint_2114,
        progress=progress, pause_s=0.25,
        seed_result=seed_result,
        seed_checkpoint_path=legacy_checkpoint,
        include_current=True,
    )



def cmd_preflight_integrado():
    """
    Valida a MESMA conexão Playwright/CDP usada pela análise completa.
    Não usa PowerShell como critério de aprovação.
    Não altera dados do MES.
    """
    from ames.tela_2114 import Tela2114
    from ames.tela_3074 import Tela3074
    from ames.tela_3074 import salvar_json

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = BASE_DIR / "logs" / f"preflight_integrado_{stamp}.json"
    payload = {
        "version": "0.16",
        "captured_at": datetime.now().isoformat(timespec="seconds"),
        "status": "ERROR",
        "endpoint": "http://127.0.0.1:9222",
        "pages": [],
        "checks": {},
    }

    b = None
    try:
        b = _browser()
        payload["checks"]["playwright_cdp"] = "OK"

        for idx, page in enumerate(b.pages):
            try:
                title = page.title()
            except Exception:
                title = "<titulo indisponivel>"
            payload["pages"].append({
                "index": idx,
                "title": title,
                "url": page.url,
            })

        print(f"[OK] Playwright/CDP conectado. Abas abertas: {len(b.pages)}")
        for item in payload["pages"]:
            print(f"  [{item['index']}] {item['title']} | {item['url']}")

        # 3074: usa o adapter real que será usado logo depois.
        t3074 = Tela3074(b, BASE_DIR)
        p3074 = t3074._page()
        payload["checks"]["3074"] = {
            "status": "OK",
            "title": p3074.title(),
            "url": p3074.url,
        }
        print("[OK] Tela 3074 encontrada.")

        # 2114: usa a seleção robusta da V0.9.1/V0.10.
        t2114 = Tela2114(b, BASE_DIR)
        p2114 = t2114._page()
        shift = t2114.turno_atual()
        if not shift:
            raise RuntimeError(
                "A 2114 foi encontrada, mas o Shift nao esta selecionado/legivel."
            )
        payload["checks"]["2114"] = {
            "status": "OK",
            "title": p2114.title(),
            "url": p2114.url,
            "shift": shift,
        }
        print(f"[OK] Tela 2114 encontrada. Shift: {shift}")

        payload["status"] = "GREEN"
        salvar_json(payload, out)
        print(f"[OK] Preflight integrado GREEN: {out}")
        return 0

    except Exception as exc:
        payload["error_type"] = type(exc).__name__
        payload["error"] = str(exc)
        try:
            salvar_json(payload, out)
            print(f"[DIAGNOSTICO] {out}")
        except Exception:
            pass
        print(f"[ERRO] Preflight integrado falhou: {type(exc).__name__}: {exc}")
        raise
    finally:
        if b is not None:
            b.disconnect()

def cmd_analise_completa(path, max_pcbas):
    from ames.tela_3028 import ler_export_detalhado_3028
    from ames.tela_3074 import Tela3074, salvar_json
    from core.fluxo_3028_3074 import executar_fluxo, fingerprint_file
    from reports.relatorio_v016 import gerar_excel_integrado

    parsed = ler_export_detalhado_3028(path)
    source_hash = fingerprint_file(path)[:12]
    checkpoint_3074 = BASE_DIR / "output" / f"V010_3074_CHECKPOINT_{source_hash}.json"
    checkpoint_2114 = BASE_DIR / "output" / f"V011_2114_CHECKPOINT_{source_hash}.json"

    settings = json.loads((BASE_DIR / "config" / "settings.json").read_text(encoding="utf-8"))
    time_cfg = settings.get("mes_time", {})
    defect_offset = float(time_cfg.get("defect_local_utc_offset_hours", -3))
    grid_offset = float(time_cfg.get("grid_naive_utc_offset_hours", 0))

    print("\n================ V0.16 - ANALISE COMPLETA ================")
    print(f"Falhas no export 3028 ...... {parsed['records_count']}")
    print(f"PCBAs unicas no export ..... {parsed['unique_pcba_count']}")
    print(f"Limite desta execucao ...... {'TODAS' if not max_pcbas else max_pcbas}")
    print("\nFASE 1: 3028 -> 3074 (componentes/reuso temporal)")

    def progress_pcba(i, total, sn, falhas, status):
        if status == "CHECKPOINT_COMPLETE":
            print(f"[{i}/{total}] 3074 {sn} | JA CONCLUIDA - pulando")
        else:
            print(f"\n[{i}/{total}] 3074 PCBA {sn} | falhas no Excel: {falhas}")

    def progress_component(pi, pt, di, dt, ci, ct, sn, defect_time, item, source):
        tipo = item.get("item_type", "")
        origem = "retomado" if source == "CHECKPOINT" else "MES"
        print(f"    falha [{di}/{dt}] {defect_time} | componente [{ci}/{ct}] {tipo} | {origem}")

    result_3074 = None
    result_2114 = None

    try:
        b = _browser()
    except Exception as exc:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        error_json = BASE_DIR / "output" / f"ERRO_ANALISE_COMPLETA_{stamp}.json"
        salvar_json({
            "version": "0.16",
            "status": "ERROR",
            "stage": "PRECHECK_BROWSER",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source_3028": str(path),
            "error_type": type(exc).__name__,
            "error": str(exc),
            "trace_3074": None,
            "trace_2114": None,
        }, error_json)
        print("\n[ERRO] Nao foi possivel conectar ao Chrome da automacao.")
        print(f"[DIAGNOSTICO SALVO] {error_json}")
        return False

    try:
        # Valida que as duas telas necessárias existem antes de iniciar lote grande.
        Tela3074(b, BASE_DIR)._page()
        from ames.tela_2114 import Tela2114
        tela_2114 = Tela2114(b, BASE_DIR)
        turno = tela_2114.turno_atual()
        if not turno:
            raise RuntimeError("A 2114 está aberta, mas o Shift não foi selecionado.")
        print(f"[OK] 3074 encontrada | [OK] 2114 encontrada | Shift={turno}")

        result_3074 = executar_fluxo(
            path,
            parsed,
            Tela3074(b, BASE_DIR),
            max_pcbas=max_pcbas,
            progress_pcba=progress_pcba,
            progress_component=progress_component,
            checkpoint_path=checkpoint_3074,
            defect_local_offset_hours=defect_offset,
            grid_naive_offset_hours=grid_offset,
        )

        print("\nFASE 1 CONCLUIDA")
        print(f"PCBAs 3074 concluidas ...... {result_3074['processed_pcba_count']}")
        print(f"PCBAs 3074 com erro ........ {result_3074['pcba_error_count']}")

        result_2114 = _run_2114_phase(result_3074, b, checkpoint_2114)

    except KeyboardInterrupt:
        print("\n[PARADO PELO USUARIO] Checkpoints salvos. Rode o mesmo BAT para retomar.")
        return
    except Exception as exc:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        error_json = BASE_DIR / "output" / f"ERRO_ANALISE_COMPLETA_{stamp}.json"
        salvar_json({
            "version": "0.16",
            "status": "ERROR",
            "stage": "EXECUCAO_INTEGRADA",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source_3028": str(path),
            "error_type": type(exc).__name__,
            "error": str(exc),
            "trace_3074": result_3074,
            "trace_2114": result_2114,
        }, error_json)
        print(f"\n[ERRO] A analise foi interrompida: {type(exc).__name__}: {exc}")
        print(f"[DIAGNOSTICO SALVO] {error_json}")
        return False
    finally:
        b.disconnect()

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_json = BASE_DIR / "output" / f"3028_3074_2114_V016_{stamp}.json"
    out_xlsx = BASE_DIR / "output" / f"3028_3074_2114_ANALISE_V016_{stamp}.xlsx"
    combined = {
        "version": "0.16",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_3028": str(path),
        "trace_3074": result_3074,
        "trace_2114": result_2114,
    }
    salvar_json(combined, out_json)

    excel_error = None
    report_stats = None
    try:
        report_stats = gerar_excel_integrado(result_3074, result_2114, out_xlsx)
    except Exception as exc:
        excel_error = f"{type(exc).__name__}: {exc}"

    print("\n================ RESULTADO V0.16 ================")
    print(f"3074 - PCBAs concluidas .... {result_3074['processed_pcba_count']}")
    print(f"3074 - erros ............... {result_3074['pcba_error_count']}")
    print(f"2114 - PCBAs atuais ........ {result_2114.get('current_target_count',0)}")
    print(f"2114 - PCBAs historicas .... {result_2114.get('historical_target_count',0)}")
    print(f"2114 - PCBAs unicas total .. {result_2114['requested_pcba_count']}")
    print(f"2114 - concluidas .......... {result_2114['processed_pcba_count']}")
    print(f"2114 - sem historico ....... {result_2114['pcba_no_data_count']}")
    print(f"2114 - erros ............... {result_2114['pcba_error_count']}")
    print(f"\n[OK] JSON integrado: {out_json}")
    if excel_error:
        print(f"[AVISO] JSON OK, mas Excel falhou: {excel_error}")
    else:
        print(f"[OK] Excel integrado: {out_xlsx}")
        print("     Abas: INDICADORES, ANALISE, HIST_PCBA, HIST_MATERIAL, BASE_DADOS, DETALHES_INDICADORES")
        if report_stats:
            print(f"     Falhas ................. {report_stats.get('falhas',0)}")
            print(f"     Materiais de reuso ..... {report_stats.get('materiais_reuso',0)}")
            print(f"     Linhas HIST_PCBA ........ {report_stats.get('linhas_hist_pcba',0)}")
            print(f"     Linhas HIST_MATERIAL .... {report_stats.get('linhas_hist_material',0)}")
    return True


def cmd_2114_from_3074_json(json_path):
    from ames.tela_3074 import salvar_json
    from reports.relatorio_v016 import gerar_excel_integrado

    path = Path(json_path)
    result_3074 = json.loads(path.read_text(encoding="utf-8"))
    # Aceita tanto o JSON V081 puro quanto um combinado futuro.
    if "trace_3074" in result_3074:
        result_3074 = result_3074["trace_3074"]

    source_hash = (result_3074.get("source_sha256") or "json")[:12]
    checkpoint_2114 = BASE_DIR / "output" / f"V011_2114_CHECKPOINT_{source_hash}.json"

    b = _browser()
    try:
        result_2114 = _run_2114_phase(result_3074, b, checkpoint_2114)
    except KeyboardInterrupt:
        print("\n[PARADO PELO USUARIO] Checkpoint 2114 salvo. Rode novamente para retomar.")
        return
    finally:
        b.disconnect()

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_json = BASE_DIR / "output" / f"2114_SOBRE_JSON_3074_{stamp}.json"
    out_xlsx = BASE_DIR / "output" / f"3028_3074_2114_ANALISE_V016_{stamp}.xlsx"
    salvar_json({"version":"0.16","trace_3074":result_3074,"trace_2114":result_2114}, out_json)
    gerar_excel_integrado(result_3074, result_2114, out_xlsx)
    print(f"\n[OK] JSON: {out_json}")
    print(f"[OK] Excel integrado: {out_xlsx}")



def cmd_upgrade_v011_json(json_path):
    """Completa um JSON V0.10 já pronto consultando SOMENTE o que falta na 2114.

    Reaproveita trace_3074 e todos os resultados 2114 COMPLETE existentes.
    Não consulta 3074 novamente.
    """
    from ames.tela_3074 import salvar_json
    from reports.relatorio_v016 import gerar_excel_integrado

    path = Path(json_path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "trace_3074" not in payload:
        raise ValueError("JSON integrado invalido: trace_3074 ausente.")
    result_3074 = payload["trace_3074"]
    seed_2114 = payload.get("trace_2114") or {}
    source_hash = (result_3074.get("source_sha256") or "json")[:12]
    checkpoint_2114 = BASE_DIR / "output" / f"V011_2114_CHECKPOINT_{source_hash}.json"

    b = _browser()
    try:
        from ames.tela_2114 import Tela2114
        tela = Tela2114(b, BASE_DIR)
        if not tela.turno_atual():
            raise RuntimeError("A 2114 está aberta, mas o Shift não foi selecionado.")
        result_2114 = _run_2114_phase(result_3074, b, checkpoint_2114, seed_result=seed_2114)
    except KeyboardInterrupt:
        print("\n[PARADO PELO USUARIO] Checkpoint V0.11 salvo. Rode novamente para retomar.")
        return False
    finally:
        b.disconnect()

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_json = BASE_DIR / "output" / f"3028_3074_2114_V016_{stamp}.json"
    out_xlsx = BASE_DIR / "output" / f"3028_3074_2114_ANALISE_V016_{stamp}.xlsx"
    combined = {
        "version": "0.16",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_3028": payload.get("source_3028", ""),
        "trace_3074": result_3074,
        "trace_2114": result_2114,
    }
    salvar_json(combined, out_json)
    report_stats = gerar_excel_integrado(result_3074, result_2114, out_xlsx)
    print("\n================ UPGRADE V0.16 CONCLUIDO ================")
    print(f"[OK] JSON V0.16: {out_json}")
    print(f"[OK] Excel V0.16: {out_xlsx}")
    print(f"     Materiais de reuso ..... {report_stats.get('materiais_reuso',0)}")
    print(f"     Linhas HIST_PCBA ........ {report_stats.get('linhas_hist_pcba',0)}")
    print(f"     Linhas HIST_MATERIAL .... {report_stats.get('linhas_hist_material',0)}")
    print("     A 3074 NAO foi consultada novamente.")
    return True

def cmd_report_integrado_json(json_path):
    """Regenera somente o Excel a partir de um JSON integrado 3028+3074+2114.

    Não abre Chrome e não consulta o MES.
    """
    from reports.relatorio_v014 import gerar_excel_integrado

    path = Path(json_path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "trace_3074" not in payload or "trace_2114" not in payload:
        raise ValueError(
            "JSON integrado invalido: esperado trace_3074 e trace_2114."
        )

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_xlsx = BASE_DIR / "output" / f"3028_3074_2114_ANALISE_V014_{stamp}.xlsx"
    stats = gerar_excel_integrado(payload["trace_3074"], payload["trace_2114"], out_xlsx)

    print("\n[OK] Excel regenerado sem consultar o MES:")
    print(out_xlsx)
    print(f"Falhas: {stats.get('falhas',0)} | Materiais de reuso: {stats.get('materiais_reuso',0)} | HIST_PCBA: {stats.get('linhas_hist_pcba',0)} | HIST_MATERIAL: {stats.get('linhas_hist_material',0)}")
    print("Relatorio V0.14 reestruturado:")
    print("- ANALISE: uma linha por falha + um material de reuso por coluna;")
    print("- HIST_PCBA: falhas da propria PCBA;")
    print("- HIST_MATERIAL: falhas das PCBAs anteriores dos materiais reutilizados;")
    print("- sem freeze/split panes.")
    return True


def cmd_report_v015_json(json_path):
    """Regenera apenas o Excel V0.15 a partir de JSON integrado já concluído."""
    from reports.relatorio_v015 import gerar_excel_integrado
    path = Path(json_path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "trace_3074" not in payload or "trace_2114" not in payload:
        raise ValueError("JSON integrado inválido: esperado trace_3074 e trace_2114.")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_xlsx = BASE_DIR / "output" / f"3028_3074_2114_ANALISE_V015_{stamp}.xlsx"
    stats = gerar_excel_integrado(payload["trace_3074"], payload["trace_2114"], out_xlsx)
    print("\n[OK] Excel V0.15 regenerado sem consultar o MES:")
    print(out_xlsx)
    print(f"Falhas={stats.get('falhas',0)} | Reuso único={stats.get('materiais_reuso',0)} | Reuso sem falha anterior={stats.get('materiais_reuso_sem_falha_anterior',0)} | Reuso com falha anterior={stats.get('materiais_reuso_com_falha_anterior',0)}")
    print("Abas: INDICADORES, ANALISE, DETALHE_PCBA, DETALHE_MATERIAL")
    print("Nas abas de detalhe, use os controles + / - à esquerda para expandir os históricos.")
    return True


def cmd_report_v016_json(json_path):
    """Regenera somente o Excel no padrão V0.16 a partir de JSON integrado concluído.

    Não abre Chrome e não consulta o MES.
    """
    from reports.relatorio_v016 import gerar_excel_integrado
    path = Path(json_path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "trace_3074" not in payload or "trace_2114" not in payload:
        raise ValueError("JSON integrado inválido: esperado trace_3074 e trace_2114.")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_xlsx = BASE_DIR / "output" / f"3028_3074_2114_ANALISE_V016_{stamp}.xlsx"
    stats = gerar_excel_integrado(payload["trace_3074"], payload["trace_2114"], out_xlsx)
    print("\n[OK] Excel V0.16 regenerado sem consultar o MES:")
    print(out_xlsx)
    print(f"Falhas={stats.get('falhas',0)} | Reuso único={stats.get('materiais_reuso',0)} | HIST_PCBA={stats.get('linhas_hist_pcba',0)} | HIST_MATERIAL={stats.get('linhas_hist_material',0)} | BASE_DADOS={stats.get('linhas_base_dados',0)}")
    print("Abas: INDICADORES, ANALISE, HIST_PCBA, HIST_MATERIAL, BASE_DADOS, DETALHES_INDICADORES")
    return True

def main():
    ap = argparse.ArgumentParser(description="A-MES Automacao V0.16 - 3028/3074/2114 Integrada")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init-db")
    sub.add_parser("diagnostico")

    p = sub.add_parser("inspect")
    p.add_argument("tela", choices=["3074", "3012", "3022", "2114"])

    p = sub.add_parser("query-3074")
    p.add_argument("sn")

    p = sub.add_parser("query-2114")
    p.add_argument("sn")

    p = sub.add_parser("query-3022")
    p.add_argument("sn")

    p = sub.add_parser("g1-3074")
    p.add_argument("sn")

    p = sub.add_parser("scan-all-3074")
    p.add_argument("sn")

    p = sub.add_parser("validate-3028")
    p.add_argument("path")

    p = sub.add_parser("3028-to-3074")
    p.add_argument("path")
    p.add_argument("--max-pcbas", type=int, default=1)

    p = sub.add_parser("report-3028-3074")
    p.add_argument("path")

    sub.add_parser("preflight-integrado")

    p = sub.add_parser("analise-completa")
    p.add_argument("path")
    p.add_argument("--max-pcbas", type=int, default=1)

    p = sub.add_parser("upgrade-v011-json")
    p.add_argument("json_path")

    p = sub.add_parser("report-integrado-json")
    p.add_argument("json_path")

    p = sub.add_parser("report-v015-json")
    p.add_argument("json_path")

    p = sub.add_parser("report-v016-json")
    p.add_argument("json_path")

    p = sub.add_parser("report-v012-json")
    p.add_argument("json_path")

    p = sub.add_parser("2114-from-3074-json")
    p.add_argument("path")

    a = ap.parse_args()

    if a.cmd == "init-db":
        cmd_init_db()
    elif a.cmd == "diagnostico":
        cmd_diagnostico()
    elif a.cmd == "inspect":
        cmd_inspect(a.tela)
    elif a.cmd == "query-3074":
        cmd_query_3074(a.sn)
    elif a.cmd == "query-2114":
        cmd_query_2114(a.sn)
    elif a.cmd == "query-3022":
        cmd_query_3022(a.sn)
    elif a.cmd == "g1-3074":
        cmd_g1(a.sn)
    elif a.cmd == "scan-all-3074":
        cmd_scan_all_3074(a.sn)
    elif a.cmd == "validate-3028":
        cmd_validate_3028(a.path)
    elif a.cmd == "3028-to-3074":
        cmd_3028_to_3074(a.path, a.max_pcbas)
    elif a.cmd == "report-3028-3074":
        cmd_report_3028_3074(a.path)
    elif a.cmd == "preflight-integrado":
        cmd_preflight_integrado()
    elif a.cmd == "analise-completa":
        ok = cmd_analise_completa(a.path, a.max_pcbas)
        if ok is False:
            sys.exit(1)
    elif a.cmd == "upgrade-v011-json":
        cmd_upgrade_v011_json(a.json_path)
    elif a.cmd == "report-v015-json":
        cmd_report_v015_json(a.json_path)
    elif a.cmd == "report-v016-json":
        cmd_report_v016_json(a.json_path)
    elif a.cmd == "report-integrado-json":
        cmd_report_integrado_json(a.json_path)
    elif a.cmd == "report-v012-json":
        cmd_report_integrado_json(a.json_path)
    elif a.cmd == "2114-from-3074-json":
        cmd_2114_from_3074_json(a.path)


if __name__ == "__main__":
    main()
