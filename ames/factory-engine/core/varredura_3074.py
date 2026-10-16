from datetime import datetime
import time
from core.normalizacao import normalizar_sn
from core.temporal_3074 import (
    componentes_no_momento_da_falha,
    pcbas_do_item_ate_a_falha,
    historico_completo_pcbas_do_item,
)


def classificar_reuso_anterior(previous_count):
    if previous_count <= 0:
        return "SEM_REUSO_ANTERIOR"
    if previous_count == 1:
        return "SEGUNDO_USO_NO_MOMENTO_DA_FALHA"
    return "REUSO_MULTIPLO_ANTERIOR"


def resumir_resultados(resultados, temporal_summary=None):
    total = len(resultados)
    ok = sum(1 for r in resultados if not r.get("error"))
    erros = total - ok
    sem = sum(1 for r in resultados if r.get("status") == "SEM_REUSO_ANTERIOR")
    segundo = sum(1 for r in resultados if r.get("status") == "SEGUNDO_USO_NO_MOMENTO_DA_FALHA")
    multiplo = sum(1 for r in resultados if r.get("status") == "REUSO_MULTIPLO_ANTERIOR")
    out = {
        "components_scanned_total": total,
        "components_ok": ok,
        "components_error": erros,
        "sem_reuso_anterior": sem,
        "segundo_uso_no_momento_da_falha": segundo,
        "reuso_multiplo_anterior": multiplo,
        "componentes_com_reuso_anterior": segundo + multiplo,
    }
    if temporal_summary:
        out.update({f"temporal_{k}": v for k, v in temporal_summary.items()})
    return out


def executar_varredura(
    tela3074,
    pcba_sn,
    defect_time,
    progress=None,
    checkpoint_cb=None,
    existing=None,
    query_memo=None,
    pause_s=0.25,
    base_query=None,
    defect_local_offset_hours=-3,
    grid_naive_offset_hours=0,
):
    """Rastreia SOMENTE componentes que estavam vinculados no Defect Time.

    A consulta atual da 3074 pode conter passado, presente e vinculos criados
    depois da falha. O filtro temporal estabiliza a analise mesmo que o produto
    seja desmontado, remontado ou receba novos vinculos depois.
    """
    pcba_sn = normalizar_sn(pcba_sn)
    existing = existing or {}
    query_memo = query_memo if query_memo is not None else {}

    base = base_query or existing.get("base_query")
    if not base:
        base = tela3074.consultar(pcba_sn)
    existing["base_query"] = base

    temporal = componentes_no_momento_da_falha(
        base.get("rows", []),
        pcba_sn,
        defect_time,
        defect_local_offset_hours=defect_local_offset_hours,
        grid_naive_offset_hours=grid_naive_offset_hours,
    )
    componentes = temporal["active"]
    existing["temporal_filter"] = temporal

    if checkpoint_cb:
        checkpoint_cb(existing)

    if not componentes:
        if not base.get("rows"):
            status = "SEM_REGISTROS_3074_NA_CONSULTA"
        elif temporal["summary"]["bound_after_defect"] > 0:
            status = "SEM_COMPONENTES_NO_MOMENTO_DA_FALHA_VINCULOS_POSTERIORES"
        else:
            status = "SEM_COMPONENTES_NO_MOMENTO_DA_FALHA"
        final = {
            "pcba_query": pcba_sn,
            "defect_time": defect_time,
            "scanned_at": datetime.now().isoformat(timespec="seconds"),
            "status": status,
            "temporal_filter": temporal,
            "summary": resumir_resultados([], temporal["summary"]),
            "results": [],
            "base_query": base,
        }
        if checkpoint_cb:
            checkpoint_cb(final)
        return final

    existing_results = {
        r.get("item_sn"): r for r in existing.get("results", []) if r.get("item_sn")
    }
    resultados = []

    for idx, item in enumerate(componentes, 1):
        item_sn = normalizar_sn(item["item_sn"])
        if item_sn in existing_results:
            r = existing_results[item_sn]
            resultados.append(r)
            if progress:
                progress(idx, len(componentes), item, "CHECKPOINT")
            continue

        if progress:
            progress(idx, len(componentes), item, "LIVE")

        try:
            if item_sn in query_memo:
                hist = query_memo[item_sn]
                source = "RUN_MEMO"
            else:
                hist = tela3074.consultar(item_sn)
                query_memo[item_sn] = hist
                source = "LIVE"
                if pause_s:
                    time.sleep(pause_s)

            hist_temporal = pcbas_do_item_ate_a_falha(
                hist.get("rows", []),
                defect_time,
                current_pcba_sn=pcba_sn,
                defect_local_offset_hours=defect_local_offset_hours,
                grid_naive_offset_hours=grid_naive_offset_hours,
            )
            previous_count = hist_temporal["previous_pcba_count"]
            status = classificar_reuso_anterior(previous_count)
            full_history = historico_completo_pcbas_do_item(
                hist.get("rows", []),
                grid_naive_offset_hours=grid_naive_offset_hours,
            )
            r = {
                "item_sn": item_sn,
                "item_type": item.get("item_type", ""),
                "status": status,
                "bind_time_utc": item.get("bind_time_utc"),
                "unbind_time_utc": item.get("unbind_time_utc"),
                "iss_status_now": item.get("iss_status_now"),
                "previous_pcba_count": previous_count,
                "previous_pcbas": [x["pcba_sn"] for x in hist_temporal["previous_pcbas"]],
                "pcbas_until_defect": [x["pcba_sn"] for x in hist_temporal["associations_until_defect"]],
                "current_pcba_confirmed": hist_temporal["current_pcba_confirmed"],
                "future_association_count_ignored": len(hist_temporal["future_associations_ignored"]),
                # Visão completa do material no momento em que a consulta foi feita.
                # Diferente do filtro causal acima, esta lista NÃO corta pelo Defect Time.
                "total_pcba_count_known_now": full_history["distinct_pcba_count"],
                "reuse_count_known_now": full_history["reuse_count"],
                "active_now_pcbas": full_history["active_now_pcbas"],
                "inactive_now_pcbas": full_history["inactive_now_pcbas"],
                "all_pcba_history": [
                    {
                        "pcba_sn": x.get("pcba_sn"),
                        "iss_status_now": x.get("iss_status_now"),
                        "bind_time_utc": x.get("bind_time_utc"),
                        "unbind_time_utc": x.get("unbind_time_utc"),
                        "event_count": x.get("event_count", 1),
                    }
                    for x in full_history["associations"]
                ],
                "source": source,
                "error": None,
            }
        except Exception as exc:
            r = {
                "item_sn": item_sn,
                "item_type": item.get("item_type", ""),
                "status": "ERRO_CONSULTA",
                "bind_time_utc": item.get("bind_time_utc"),
                "unbind_time_utc": item.get("unbind_time_utc"),
                "iss_status_now": item.get("iss_status_now"),
                "previous_pcba_count": None,
                "previous_pcbas": [],
                "pcbas_until_defect": [],
                "current_pcba_confirmed": False,
                "future_association_count_ignored": 0,
                "total_pcba_count_known_now": None,
                "reuse_count_known_now": None,
                "active_now_pcbas": [],
                "inactive_now_pcbas": [],
                "all_pcba_history": [],
                "source": "LIVE",
                "error": f"{type(exc).__name__}: {exc}",
            }

        resultados.append(r)
        existing["results"] = resultados + [
            x for sn, x in existing_results.items()
            if sn not in {rr.get("item_sn") for rr in resultados}
        ]
        existing["summary"] = resumir_resultados(existing["results"], temporal["summary"])
        existing["updated_at"] = datetime.now().isoformat(timespec="seconds")
        if checkpoint_cb:
            checkpoint_cb(existing)

    return {
        "pcba_query": pcba_sn,
        "defect_time": defect_time,
        "scanned_at": datetime.now().isoformat(timespec="seconds"),
        "status": "COMPONENTES_DO_MOMENTO_DA_FALHA_PROCESSADOS",
        "temporal_filter": temporal,
        "summary": resumir_resultados(resultados, temporal["summary"]),
        "results": resultados,
        "base_query": base,
    }
