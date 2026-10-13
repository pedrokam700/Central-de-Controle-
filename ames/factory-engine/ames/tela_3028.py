from pathlib import Path
from datetime import datetime
import math
import pandas as pd

HEADER_ALIASES = {
    "line": ["Line Id"],
    "defect_oper": ["Defect Oper"],
    "defect_oper_desc": ["Defect Oper Desc"],
    "defect_code": ["Defect Code"],
    "defect_desc": ["Defect Desc"],
    "defect_return_category": ["Defect Return Category"],
    "defect_detail_category": ["Defect Detail Gategory", "Defect Detail Category"],
    "reason_code": ["Reason Code"],
    "reason_desc": ["Reason Desc"],
    "defect_reason_type": ["Defect Reason Type"],
    "defect_reason_desc": ["Defect Reason Type Desc"],
    "repair_code": ["Repair Code"],
    "repair_desc": ["Repair Desc"],
    "repair_user": ["Repair User"],
    "defect_material": ["Defect Material"],
    "defect_material_desc": ["Defect Material Desc"],
    "repair_comment": ["Repair Comment"],
    "defect_category": ["Defect Category"],
    "defect_source": ["Defect Source"],
    "product_model": ["Prod Model", "Product Model"],
    "color": ["Color"],
    "pcba_sn": ["SN"],
    "imei": ["IMEI"],
    "defect_time": ["Defect Time"],
    "time_zone": ["Time Zone"],
    "work_shift": ["Work Shift"],
    "order_id": ["Order Id"],
    "user_id": ["User Id"],
    "manual_or_auto": ["Manually Input Or Not"],
}

def _clean(v):
    if v is None:
        return ""
    if isinstance(v, float) and math.isnan(v):
        return ""
    return str(v).strip()

def _english_header(v):
    text = _clean(v).replace("\r", "\n")
    parts = [p.strip() for p in text.split("\n") if p.strip()]
    if not parts:
        return ""
    return parts[-1]

def _find_detail_header(raw):
    for idx, row in raw.iterrows():
        headers = [_english_header(v) for v in row.tolist()]
        s = set(headers)
        if "SN" in s and "Defect Desc" in s and "Repair Comment" in s and "Line Id" in s:
            return idx
    raise RuntimeError(
        "Cabecalho do Defect Detail Report Of FPY nao encontrado. "
        "Esperado: SN + Defect Desc + Repair Comment + Line Id."
    )

def _map_columns(columns):
    normalized = {_english_header(c): c for c in columns}
    result = {}
    for field, aliases in HEADER_ALIASES.items():
        found = None
        for alias in aliases:
            if alias in normalized:
                found = normalized[alias]
                break
        result[field] = found
    return result

def _parse_defect_time(v):
    s = _clean(v)
    if not s:
        return None
    # MES: YYYYMMDDHHMMSS
    if len(s) == 14 and s.isdigit():
        try:
            return datetime.strptime(s, "%Y%m%d%H%M%S").strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    return s

def _read_search_condition(path):
    try:
        df = pd.read_excel(path, sheet_name="Search Condition", header=None, dtype=object)
    except Exception:
        return {}
    out = {}
    for _, row in df.iterrows():
        if len(row) < 2:
            continue
        name = _clean(row.iloc[0])
        value = _clean(row.iloc[1])
        if name and value and name.lower() not in ("search condition", "name"):
            out[name.strip()] = value
    return out

def _summary_from_top(raw):
    # Estrutura observada no export real: linha 2 = nomes, linha 3 = valores.
    out = {}
    if len(raw) >= 3:
        headers = [_english_header(x) for x in raw.iloc[1].tolist()]
        values = raw.iloc[2].tolist()
        for h, v in zip(headers, values):
            if h:
                out[h] = "" if pd.isna(v) else v
    return out

def ler_export_detalhado_3028(path):
    path = Path(path)
    raw = pd.read_excel(path, sheet_name="Sheet1", header=None, dtype=object)
    header_idx = _find_detail_header(raw)

    df = pd.read_excel(path, sheet_name="Sheet1", header=header_idx, dtype=object)
    df.columns = [_english_header(c) for c in df.columns]

    # Remove linhas sem SN; o relatorio pode ter rodape/linhas vazias.
    if "SN" not in df.columns:
        raise RuntimeError("Coluna SN nao encontrada no relatorio detalhado.")
    df = df[df["SN"].apply(lambda x: bool(_clean(x)))].copy()

    colmap = _map_columns(df.columns)
    required = ["pcba_sn","defect_desc","repair_comment","line","defect_time"]
    missing = [f for f in required if not colmap.get(f)]
    if missing:
        raise RuntimeError(f"Campos obrigatorios ausentes na 3028: {missing}")

    records = []
    for _, row in df.iterrows():
        rec = {}
        for field, col in colmap.items():
            rec[field] = _clean(row.get(col)) if col else None
        rec["defect_time"] = _parse_defect_time(rec.get("defect_time"))
        if rec.get("pcba_sn"):
            records.append(rec)

    search = _read_search_condition(path)
    summary = _summary_from_top(raw)

    unique_pcbas = []
    seen = set()
    for rec in records:
        sn = rec["pcba_sn"]
        if sn not in seen:
            seen.add(sn)
            unique_pcbas.append(sn)

    total_defect = summary.get("Total DefectQty")
    try:
        total_defect_int = int(float(total_defect))
    except Exception:
        total_defect_int = None

    warnings = []
    if total_defect_int is not None and total_defect_int != len(records):
        warnings.append(
            f"Total DefectQty={total_defect_int}, mas detalhe possui {len(records)} linhas."
        )

    return {
        "source": str(path),
        "detail_header_excel_row": header_idx + 1,
        "records_count": len(records),
        "unique_pcba_count": len(unique_pcbas),
        "unique_pcbas": unique_pcbas,
        "search_condition": search,
        "overall_summary": summary,
        "column_map": colmap,
        "warnings": warnings,
        "records": records,
    }
