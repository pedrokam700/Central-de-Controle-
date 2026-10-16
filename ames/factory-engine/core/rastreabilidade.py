from collections import defaultdict
from core.normalizacao import normalizar_sn


def pcba_distintas(rows):
    vistos = []
    for row in rows:
        sn = normalizar_sn(
            row.get("Barcode") or row.get("pcba_sn") or row.get("SN") or row.get("Serial Number")
        )
        if sn and sn not in vistos:
            vistos.append(sn)
    return vistos


def classificar_reutilizacao(rows):
    pcbas = pcba_distintas(rows)
    qtd = len(pcbas)
    if qtd <= 1:
        status = "SEM_REUTILIZACAO"
    elif qtd == 2:
        status = "SEGUNDO_USO"
    else:
        status = "REUTILIZACAO_MULTIPLA"
    return {"status": status, "distinct_pcba_count": qtd, "pcbas": pcbas}


def componentes_por_pcba(rows):
    out = defaultdict(list)
    for row in rows:
        pcba = normalizar_sn(row.get("pcba_sn") or row.get("PCBA") or "")
        out[pcba].append(row)
    return dict(out)
