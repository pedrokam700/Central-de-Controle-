from core.failure_taxonomy import normalize as normalizar_texto, describe, compare


def familia_falha(desc, code=""):
    return describe(code, desc)["family"]


def comparar_falhas(current_code, current_desc, old_code, old_desc):
    result = compare(current_code, current_desc, old_code, old_desc)
    return {**result, "relation": {"EXACT":"MESMA_FALHA", "SIMILAR":"FALHA_SIMILAR",
            "OTHER":"FALHA_DIFERENTE", "UNKNOWN":"INDETERMINADA"}[result["classification"]],
            "reason": result["reason_code"]}


def _hist_seq_value(hist, fallback=0):
    value = str((hist or {}).get("Defect Hist Seq") or "").strip()
    try:
        return int(float(value))
    except Exception:
        return int(fallback)


def selecionar_ocorrencia_atual(current_code, current_desc, histories):
    """Escolhe a ocorrência 2114 que representa a falha analisada.

    Regra operacional V0.14:
    1) entre os registros que são a MESMA_FALHA do 3028, usa o maior Hist Seq;
    2) se nenhum casar, usa o maior Hist Seq geral como fallback;
    3) registros com Hist Seq menor são históricos ANTERIORES;
    4) registros com Hist Seq maior são posteriores ao evento selecionado e não
       entram nas contagens de recorrência anterior.

    Isso evita usar um Repair Status Y antigo como status atual quando o último
    registro da falha está N.
    """
    hs = list(histories or [])
    if not hs:
        return {
            "current_history": None,
            "prior_histories": [],
            "later_histories": [],
            "selection_method": "SEM_HISTORICO",
            "current_seq": None,
        }

    indexed = []
    for idx, hist in enumerate(hs):
        cmp = comparar_falhas(current_code, current_desc, hist.get("Defect Code", ""), hist.get("Defect Description", ""))
        indexed.append((idx, _hist_seq_value(hist, idx), hist, cmp))

    exact = [x for x in indexed if x[3].get("relation") == "MESMA_FALHA"]
    pool = exact or indexed
    chosen = max(pool, key=lambda x: (x[1], x[0]))
    chosen_idx, chosen_seq, chosen_hist, _ = chosen
    method = "MESMA_FALHA_MAIS_RECENTE" if exact else "ULTIMO_HIST_SEQ_FALLBACK"

    prior, later = [], []
    for idx, seq, hist, _cmp in indexed:
        if hist is chosen_hist:
            continue
        if seq < chosen_seq or (seq == chosen_seq and idx < chosen_idx):
            prior.append(hist)
        else:
            later.append(hist)

    return {
        "current_history": chosen_hist,
        "prior_histories": prior,
        "later_histories": later,
        "selection_method": method,
        "current_seq": chosen_hist.get("Defect Hist Seq", ""),
    }


def classificar_historicos(current_code, current_desc, histories):
    details = []
    counts = {"MESMA_FALHA": 0, "FALHA_SIMILAR": 0, "FALHA_DIFERENTE": 0}
    for hist in histories or []:
        cmp = comparar_falhas(
            current_code, current_desc,
            hist.get("Defect Code", ""), hist.get("Defect Description", ""),
        )
        counts[cmp["relation"]] += 1
        details.append({"history": hist, **cmp})

    if counts["MESMA_FALHA"]:
        strongest = "MESMA_FALHA"
    elif counts["FALHA_SIMILAR"]:
        strongest = "FALHA_SIMILAR"
    elif counts["FALHA_DIFERENTE"]:
        strongest = "FALHA_DIFERENTE"
    else:
        strongest = "SEM_HISTORICO"

    return {
        "strongest": strongest,
        "same_count": counts["MESMA_FALHA"],
        "similar_count": counts["FALHA_SIMILAR"],
        "different_count": counts["FALHA_DIFERENTE"],
        "details": details,
    }


def analisar_historico_pcba_atual(current_code, current_desc, histories):
    selection = selecionar_ocorrencia_atual(current_code, current_desc, histories)
    # Recorrência é calculada SOMENTE contra o que aconteceu antes da ocorrência
    # atual selecionada. A ocorrência atual não é subtraída por heurística.
    prior_result = classificar_historicos(current_code, current_desc, selection["prior_histories"])
    all_result = classificar_historicos(current_code, current_desc, histories)
    result = dict(prior_result)
    # Compatibilidade: same_count/similar_count/different_count continuam sendo
    # os totais visíveis na 2114. As métricas "prior_*" são as usadas para
    # recorrência anterior na V0.14.
    result["same_count"] = all_result["same_count"]
    result["similar_count"] = all_result["similar_count"]
    result["different_count"] = all_result["different_count"]
    result["prior_same_count"] = prior_result["same_count"]
    result["prior_similar_count"] = prior_result["similar_count"]
    result["prior_different_count"] = prior_result["different_count"]
    result["same_repetitions"] = prior_result["same_count"]
    result["total"] = len(histories or [])
    result["previous_total"] = len(selection["prior_histories"])
    result["later_total"] = len(selection["later_histories"])
    result["current_history"] = selection["current_history"]
    result["current_seq"] = selection["current_seq"]
    result["selection_method"] = selection["selection_method"]
    result["prior_histories"] = selection["prior_histories"]
    result["later_histories"] = selection["later_histories"]

    if result["same_repetitions"] > 0:
        status = "MESMA_FALHA_REPETIDA"
    elif result["prior_similar_count"] > 0:
        status = "FALHA_SIMILAR_NA_MESMA_PCBA"
    elif result["previous_total"] > 0:
        status = "OUTRAS_FALHAS_NA_MESMA_PCBA"
    elif result["total"] > 0:
        status = "APENAS_UM_HISTORICO"
    else:
        status = "SEM_HISTORICO_2114"
    result["status"] = status
    return result

