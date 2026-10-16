from datetime import datetime, timezone, timedelta

from core.normalizacao import normalizar_sn, normalizar_texto


def _parse(value, default_offset_hours=0):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value).strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s)
        except Exception:
            dt = None
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y%m%d%H%M%S"):
                try:
                    dt = datetime.strptime(s, fmt)
                    break
                except Exception:
                    pass
            if dt is None:
                return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone(timedelta(hours=float(default_offset_hours))))
    return dt.astimezone(timezone.utc)


def _iso(dt):
    return dt.isoformat() if dt else None


def reconstruir_usos_pcba(rows, pcba_sn, defect_time=None, defect_local_offset_hours=-3, grid_naive_offset_hours=0):
    """Reconstrói ciclos de montagem da própria PCBA usando a 3074.

    Não conta componentes desvinculados como usos. Um uso é um ciclo de montagem
    da própria PCBA. Para registros modernos Aut Cmf7 identifica o ciclo. Para
    históricos antigos sem Aut Cmf7, o mesmo Unbind Time é usado como fronteira
    do ciclo. Registros ativos sem Unbind são agrupados como o ciclo ativo atual.
    """
    pcba = normalizar_sn(pcba_sn)
    self_rows = []
    for row in rows or []:
        barcode = normalizar_sn(row.get("Barcode"))
        if barcode != pcba:
            continue
        aut = str(row.get("Aut Cmf1") or "").strip().upper()
        sn_type = normalizar_texto(row.get("Sn Type") or "")
        if aut != "PCBA" and "pcba" not in sn_type:
            continue
        bind = _parse(row.get("Bind Time"), grid_naive_offset_hours)
        unbind = _parse(row.get("Unbind Time"), grid_naive_offset_hours)
        self_rows.append({"row": row, "bind": bind, "unbind": unbind})

    groups = {}
    for item in self_rows:
        row = item["row"]
        cmf7 = str(row.get("Aut Cmf7") or "").strip()
        if cmf7:
            key = ("CMF7", cmf7)
        elif item["unbind"] is not None:
            key = ("UNBIND", _iso(item["unbind"]))
        else:
            # A 3074 normalmente deixa apenas um ciclo ativo sem Unbind.
            key = ("ACTIVE", str(row.get("Product Id") or ""), str(row.get("Order Id") or ""))
        groups.setdefault(key, []).append(item)

    cycles = []
    for _, items in groups.items():
        binds = [x["bind"] for x in items if x["bind"]]
        unbinds = [x["unbind"] for x in items if x["unbind"]]
        if not binds:
            continue
        start = min(binds)
        end = max(unbinds) if unbinds else None
        rows_g = [x["row"] for x in items]
        statuses = {str(r.get("Iss Status") or "").strip().upper() for r in rows_g}
        active = "Y" in statuses and end is None
        product_ids = sorted({str(r.get("Product Id") or "").strip() for r in rows_g if str(r.get("Product Id") or "").strip()})
        order_ids = sorted({str(r.get("Order Id") or "").strip() for r in rows_g if str(r.get("Order Id") or "").strip()})
        lines = sorted({str(r.get("Line Id") or r.get("Line Id__2") or "").strip() for r in rows_g if str(r.get("Line Id") or r.get("Line Id__2") or "").strip()})
        operations = sorted({str(r.get("Operation") or "").strip() for r in rows_g if str(r.get("Operation") or "").strip()})
        cycles.append({
            "start_utc": _iso(start),
            "end_utc": _iso(end),
            "active_now": active,
            "link_state": "VINCULADA AGORA" if active else "DESVINCULADA",
            "product_ids": product_ids,
            "order_ids": order_ids,
            "lines": lines,
            "operations": operations,
            "row_count": len(rows_g),
        })

    cycles.sort(key=lambda x: x.get("start_utc") or "")
    for idx, c in enumerate(cycles, 1):
        c["use_index"] = idx

    defect_utc = _parse(defect_time, defect_local_offset_hours) if defect_time else None
    use_at_defect = None
    if defect_utc:
        candidates = []
        for c in cycles:
            start = _parse(c.get("start_utc"), 0)
            end = _parse(c.get("end_utc"), 0)
            if start and start <= defect_utc and (end is None or defect_utc <= end):
                candidates.append(c)
        if candidates:
            use_at_defect = candidates[-1]
        else:
            prior = [c for c in cycles if _parse(c.get("start_utc"), 0) and _parse(c.get("start_utc"), 0) <= defect_utc]
            if prior:
                use_at_defect = prior[-1]

    use_index = use_at_defect.get("use_index") if use_at_defect else (cycles[-1]["use_index"] if cycles else 0)
    return {
        "pcba_sn": pcba,
        "cycles": cycles,
        "known_use_count": len(cycles),
        "reuse_count_known": max(0, len(cycles) - 1),
        "use_index_at_defect": use_index,
        "reuses_before_defect": max(0, int(use_index or 0) - 1),
        "cycle_at_defect": use_at_defect,
    }
