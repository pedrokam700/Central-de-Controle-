import re
from difflib import SequenceMatcher
from core.normalizacao import normalizar_texto

STOP = {
    "the","of","in","and","or","a","an","to","for","with","on",
    "de","da","do","das","dos","e","ou","com","no","na","em",
    "process","phone","defect"
}

SYN = {
    "dirty": "contamination",
    "impureza": "contamination",
    "dirt": "contamination",
    "camera": "camera",
    "rear": "rear",
    "front": "front",
    "scratch": "scratch",
    "scratched": "scratch",
    "noise": "noise",
    "antenna": "antenna",
    "ant": "antenna",
    "charging": "charge",
    "charger": "charge",
    "charge": "charge",
    "sim": "sim",
    "speaker": "speaker",
    "receiver": "receiver",
    "display": "display",
    "lcd": "display",
    "touch": "touch",
    "btb": "btb"
}


def _tokens(texto):
    t = normalizar_texto(texto)
    toks = re.findall(r"[a-z0-9]+", t)
    saida = []
    for x in toks:
        if x in STOP or len(x) <= 1:
            continue
        saida.append(SYN.get(x, x))
    return set(saida)


def similaridade_falha(a, b):
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    jaccard = len(ta & tb) / len(ta | tb)
    seq = SequenceMatcher(None, normalizar_texto(a), normalizar_texto(b)).ratio()
    return round(max(jaccard, seq * 0.75), 3)


def classificar_correlacao(atual, anterior, limiar=0.55):
    score = similaridade_falha(atual, anterior)
    if score >= 0.75:
        status = "RECORRENCIA_FORTE"
    elif score >= limiar:
        status = "RECORRENCIA_POTENCIAL"
    else:
        status = "SEM_SIMILARIDADE_RELEVANTE"
    return {"score": score, "status": status}
