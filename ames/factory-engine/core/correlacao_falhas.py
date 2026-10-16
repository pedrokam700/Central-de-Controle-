import re
import unicodedata
import json
from pathlib import Path


def normalizar_texto(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


# As famílias servem SOMENTE para classificar semelhança operacional.
# Elas não afirmam causa do defeito nem culpa do material.
_FAMILIAS = [
    ("CAMERA", ["camera", "rear camera", "front camera"]),
    ("RF_ANTENA", ["antenna", "gps", "wifi", "wireless", "bluetooth", "ant0", "ant1", "ant7", "rf test"]),
    ("AUDIO", ["speaker", "receiver", "earpiece", "microphone", "headset", "audio"]),
    ("DISPLAY_LCD", ["display", "screen", "lcd", "black screen", "protective film"]),
    ("SENSOR", ["sensor", "light perception", "proximity", "p sensor"]),
    ("NFC", ["nfc"]),
    ("MECANICA_ESTRUTURA", ["middle frame", "frame", "top cover", "bottom cover", "cover", "deformation", "crack", "scratch", "dent"]),
    ("BUTTON", ["button", "power key", "volume key"]),
    ("FINGERPRINT", ["fingerprint"]),
    ("USB_CARGA", ["usb", "charging", "charger"]),
    ("BATTERY", ["battery"]),
    ("VIBRATION", ["vibration", "motor"]),
    ("SIM", ["sim card", "sim tray"]),
]



def _familias_configuradas():
    path = Path(__file__).resolve().parents[1] / "config" / "familias_falhas.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and data:
            return [(str(name), list(values or [])) for name, values in data.items()]
    except Exception:
        pass
    return _FAMILIAS



def familia_falha(desc, code=""):
    text = f" {normalizar_texto(desc)} "
    for family, keywords in _familias_configuradas():
        for keyword in keywords:
            key = normalizar_texto(keyword)
            if key and key in text:
                return family
    return "OUTRO"


def comparar_falhas(current_code, current_desc, old_code, old_desc):
    cc = str(current_code or "").strip().upper()
    oc = str(old_code or "").strip().upper()
    cd = normalizar_texto(current_desc)
    od = normalizar_texto(old_desc)
    current_family = familia_falha(current_desc, current_code)
    old_family = familia_falha(old_desc, old_code)

    if cc and oc and cc == oc:
        return {
            "relation": "MESMA_FALHA",
            "reason": "Defect Code igual",
            "current_family": current_family,
            "old_family": old_family,
        }
    if cd and od and cd == od:
        return {
            "relation": "MESMA_FALHA",
            "reason": "Descrição normalizada igual",
            "current_family": current_family,
            "old_family": old_family,
        }
    if current_family != "OUTRO" and current_family == old_family:
        return {
            "relation": "FALHA_SIMILAR",
            "reason": f"Mesmo subsistema: {current_family}",
            "current_family": current_family,
            "old_family": old_family,
        }
    return {
        "relation": "FALHA_DIFERENTE",
        "reason": f"Subsistemas diferentes: {current_family} x {old_family}",
        "current_family": current_family,
        "old_family": old_family,
    }


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

