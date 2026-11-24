"""Preserve 3028 source evidence for comments and reconciled historical captures."""


def preserve_3028_comment(record):
    """Recover explicit 3028 raw-field aliases without inventing comments.

    The frozen MES collector already emits repairComment. Some ExtJS pages
    expose the same field using spaced/underscored or different casing.
    Do not substitute comments from a repair, another PCBA or another source.
    """
    if not isinstance(record, dict) or record.get('repair_comment'):
        return record
    raw = record.get('raw')
    if not isinstance(raw, dict):
        return record
    for key, value in raw.items():
        token = ''.join(c for c in str(key).casefold() if c.isalnum())
        if token == 'repaircomment' and value is not None and str(value).strip():
            return {**record, 'repair_comment': str(value).strip()}
    return record


def _counts(rows):
    """Compare complete MES rows as multisets; repeated occurrences are significant."""
    from collections import Counter
    import json
    return Counter(json.dumps(row, sort_keys=True, separators=(",", ":")) for row in rows)


def _model_tables(capture):
    """Only identical repeated model queries may represent the same source table."""
    tables = {}
    for run in capture["modelRuns"]:
        model = run["prodModel"]
        if model in tables and tables[model] != run:
            raise ValueError("3028: respostas diferentes para o mesmo modelo e período")
        tables[model] = run
    return tables


def _complete(table):
    return len(table["records"]) == table["total"] and all(p["success"] for p in table["pageResults"])


def _group_counts(rows):
    from collections import Counter
    import json
    counts = Counter()
    for row in rows:
        qty = int(str(row["qty"]))
        if qty < 0:
            raise ValueError("3028: quantidade agrupada negativa")
        key = json.dumps({k: v for k, v in row.items() if k != "qty"}, sort_keys=True)
        counts[key] += qty
    return counts


def _balanced(tables):
    return all(_complete(run["detail"]) and _complete(run["grouped"]) and
               sum(_group_counts(run["grouped"]["records"]).values()) == len(run["detail"]["records"])
               for run in tables.values())


def _capture_checked_period(read, line, start, end):
    """Read smaller windows if needed, retaining the native full-range FPY and quantity."""
    from datetime import timedelta
    full = read(line, start, end)
    if not _complete(full["summary"]) or not _complete(full["classification"]):
        raise ValueError("3028: resumo ou classificação incompletos no período solicitado")
    models = _model_tables(full)
    parts = []
    if _balanced(models):
        parts.append((full, models))
    else:
        # Keep all boundaries at an MES hour. Recursively narrow only a failed slice.
        def collect_slice(left, right):
            cap = read(line, left, right)
            runs = _model_tables(cap)
            if _complete(cap["summary"]) and _balanced(runs):
                parts.append((cap, runs))
                return
            if right - left <= timedelta(days=1):
                raise ValueError(f"3028 {line}: agrupamento, detalhe ou paginação divergente entre {left} e {right}")
            pivot = left + timedelta(hours=int((right - left).total_seconds() // 7200))
            collect_slice(left, pivot)
            collect_slice(pivot, right)

        step = timedelta(hours=min(168, max(1, int((end-start).total_seconds() // 7200))))
        left = start
        while left < end:
            right = min(left + step, end)
            collect_slice(left, right)
            left = right

    if set(models) != {model for _, runs in parts for model in runs}:
        raise ValueError("3028: modelos das subconsultas divergem do resumo do período")
    grouped, detail = [], []
    for model, original in models.items():
        selected = [runs[model] for _, runs in parts if model in runs]
        rows = [row for r in selected for row in r["detail"]["records"]]
        groups = [row for r in selected for row in r["grouped"]["records"]]
        if parts[0][0] is not full:
            native = _counts(original["detail"]["records"])
            recovered = _counts(rows)
            native_detail = _complete(original["detail"]) and native == recovered
            native_groups = (_complete(original["grouped"]) and
                             _group_counts(groups) == _group_counts(original["grouped"]["records"]))
            # Same raw event returned by neighboring intervals: never count it twice.
            # A unique full-range multiset is stronger evidence than a guessed boundary.
            seen = set()
            for r in selected:
                keys = set(_counts(r["detail"]["records"]))
                if seen.intersection(keys) and not native_detail:
                    raise ValueError(f"3028 {line}: limite entre subconsultas ambíguo para {model}")
                seen.update(keys)
            if not (native_detail or (native_groups and (native <= recovered or recovered <= native))):
                raise ValueError(f"3028 {line}: subconsultas sem confirmação independente no período para {model}")
        detail.extend(rows)
        grouped.extend(groups)
    result = {**full, "detail": {"records": detail, "total": len(detail)},
              "grouped": {"records": grouped, "total": len(grouped)},
              "modelRuns": [run for _, runs in parts for run in runs.values()]}
    result["verified_windows"] = [cap["baseParams"] for cap, _ in parts]
    return result


def recover_3028_period(*, cdp_url, ames_host, lines, start_at, end_at):
    from datetime import datetime
    from playwright.sync_api import sync_playwright
    import ames_3028_live as source

    window = source._ames_window(start_at, end_at)
    start = datetime.strptime(window["dateFrom"] + window["startTimeZone"], "%Y%m%d%H")
    end = datetime.strptime(window["dateTo"] + window["endTimeZone"], "%Y%m%d%H")
    def params(line, a, b):
        return dict(lineId=line, dateFrom=a.strftime("%Y%m%d"), startTimeZone=a.strftime("%H"),
                    dateTo=b.strftime("%Y%m%d"), endTimeZone=b.strftime("%H"))

    metrics, records, captures, validations = [], [], [], []
    with source.MES_LOCK, sync_playwright() as pw:
        page = source._select_3028_page(pw.chromium.connect_over_cdp(cdp_url), ames_host)
        def read(line, left, right):
            return page.evaluate(source.QUERY_LINE_JS, params(line, left, right))
        for line in lines:
            cap = _capture_checked_period(read, line, start, end)
            line_metrics = [source._summary_to_metric(r, line) for r in cap["summary"]["records"]]
            details = [source._detail_to_record(r, line) for r in cap["detail"]["records"]]
            units = sum(m["total_defect_qty"] or 0 for m in line_metrics)
            if units > len(details) or any(r["line"] != line for r in details + line_metrics):
                raise ValueError(f"3028 {line}: linha ou quantidade do resumo incompatível com o detalhe")
            metrics.extend(line_metrics)
            records.extend(details)
            captures.append(cap)
            validations.append(dict(line=line, summary_defective_units=units, detail_occurrences=len(details),
                unique_pcbas=len({r["pcba_sn"] for r in details if r["pcba_sn"]}),
                extra_defect_occurrences=len(details)-units, grouped_total=len(details), grouped_matches_detail=True,
                ok=True, models=[m["product_model"] for m in line_metrics], verified_windows=len(cap["verified_windows"])))
        try:
            visible = page.evaluate(source.SYNC_VISIBLE_JS, params(lines[-1], start, end))
        except Exception as exc:
            visible = {"warning": f"UI_SYNC_FAILED: {exc}"}
    return dict(source="AWIP3028_DIRECT_EXTJS", captured_at=datetime.now().isoformat(timespec="seconds"),
                requested_lines=lines, lines=lines, window=window, line_metrics=metrics, records=records,
                records_count=len(records), captures=captures, validations=validations, visible_state=visible)
