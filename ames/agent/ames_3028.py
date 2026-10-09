from __future__ import annotations

import math
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


def _clean(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and math.isnan(v):
        return ""
    return str(v).strip()


def _english_header(v: Any) -> str:
    parts = [p.strip() for p in _clean(v).replace("\r", "\n").split("\n") if p.strip()]
    return parts[-1] if parts else ""


def _parse_defect_time(v: Any):
    s = _clean(v)
    if len(s) == 14 and s.isdigit():
        try:
            return datetime.strptime(s, "%Y%m%d%H%M%S").strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    return s or None


def _to_int(v: Any):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _find_row(raw, required: set[str]) -> int:
    for idx, row in raw.iterrows():
        headers = {_english_header(v) for v in row.tolist()}
        if required.issubset(headers):
            return int(idx)
    raise RuntimeError(f"Cabecalho nao encontrado: {sorted(required)}")


def _extract_summary_rows(raw) -> List[Dict[str, Any]]:
    """Extrai uma ou várias linhas da tabela Overall Report Of FPY.

    O export de uma linha possui uma linha de valores; export combinado pode conter
    várias linhas. Nunca soma linhas diferentes: cada Line Id permanece independente.
    """
    header_idx = _find_row(raw, {"Quantity", "Line Id", "Fpy"})
    headers = [_english_header(x) for x in raw.iloc[header_idx].tolist()]
    rows: List[Dict[str, Any]] = []
    for idx in range(header_idx + 1, len(raw)):
        values = raw.iloc[idx].tolist()
        txt = " ".join(_clean(v) for v in values[:6])
        if "Defect Detail Report Of FPY" in txt:
            break
        if _english_header(values[0] if values else "") == "Quantity":
            break
        record = {h: (None if _clean(v) == "" else v) for h, v in zip(headers, values) if h}
        line = _clean(record.get("Line Id"))
        if not line:
            # linhas intermediárias/segunda tabela de classificação não são métricas por linha
            continue
        rows.append({
            "line": line,
            "product_model": _clean(record.get("Prod Model")),
            "quantity": _to_int(record.get("Quantity")),
            "function_defect_qty": _to_int(record.get("Function DefectQty")),
            "appearance_defect_qty": _to_int(record.get("Appearance DefectQty")),
            "process_defect_qty": _to_int(record.get("Process DefectQty")),
            "total_defect_qty": _to_int(record.get("Total DefectQty")),
            "auto_input_defect_qty": _to_int(record.get("Auto Input Defect Qty")),
            "function_fpy": record.get("functionFpy"),
            "appearance_fpy": record.get("AppearanceFpy"),
            "process_fpy": record.get("Process Fpy"),
            "fpy": record.get("Fpy"),
            "check_fpy": record.get("Check Fpy"),
            "raw": record,
        })
    return rows


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


def parse_export(path: str | Path) -> Dict[str, Any]:
    try:
        import pandas as pd
    except ImportError as exc:
        raise RuntimeError("pandas/openpyxl nao instalados no agente local") from exc

    path = Path(path)
    raw = pd.read_excel(path, sheet_name="Sheet1", header=None, dtype=object)
    summary_rows = _extract_summary_rows(raw)
    detail_idx = _find_row(raw, {"SN", "Defect Desc", "Repair Comment", "Line Id"})
    df = pd.read_excel(path, sheet_name="Sheet1", header=detail_idx, dtype=object)
    df.columns = [_english_header(c) for c in df.columns]
    normalized = {str(c): c for c in df.columns}
    colmap = {}
    for field, aliases in HEADER_ALIASES.items():
        colmap[field] = next((normalized[a] for a in aliases if a in normalized), None)
    if not colmap.get("pcba_sn"):
        raise RuntimeError("Coluna SN nao encontrada no detalhado 3028")

    records = []
    for _, row in df.iterrows():
        sn = _clean(row.get(colmap["pcba_sn"]))
        if not sn:
            continue
        rec = {}
        for field, col in colmap.items():
            rec[field] = _clean(row.get(col)) if col else None
        rec["defect_time"] = _parse_defect_time(rec.get("defect_time"))
        records.append(rec)
    return {
        "source": str(path),
        "line_metrics": summary_rows,
        "records": records,
        "records_count": len(records),
        "lines": sorted(({r.get("line") for r in records if r.get("line")} | {m.get("line") for m in summary_rows if m.get("line")})),
        "detail_header_excel_row": detail_idx + 1,
    }
