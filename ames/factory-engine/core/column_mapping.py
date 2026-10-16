from core.normalizacao import chave_coluna

ALIASES_3028 = {
    "pcba_sn": ["SN", "Serial Number", "PCBA SN", "Barcode"],
    "defect_code": ["Defect Code", "Code"],
    "defect_desc": ["Defect Desc", "Defect Description", "Failure", "Falha", "不良现象"],
    "defect_time": ["Defect Time", "Failure Time", "Create Time"],
    "repair_user": ["Repair User"],
    "repair_time": ["Repair Time"],
    "repair_comment": ["Repair Comment", "Comment"],
    "defect_reason_type": ["Defect Reason Type", "Reason Type"],
    "defect_reason_desc": ["Defect Reason Desc", "Reason Desc"],
    "product_model": ["Product Model", "Model"],
    "product_id": ["Product Id", "Product ID"],
    "line": ["Line", "Line Id", "Line ID"],
    "batch_id": ["Batch Id", "Batch ID"],
    "department": ["Dept", "Department"]
}


def mapear_colunas(colunas, aliases=None):
    aliases = aliases or ALIASES_3028
    reais = {chave_coluna(c): c for c in colunas}
    resultado = {}
    for campo, candidatos in aliases.items():
        encontrado = None
        for candidato in candidatos:
            key = chave_coluna(candidato)
            if key in reais:
                encontrado = reais[key]
                break
        resultado[campo] = encontrado
    return resultado
