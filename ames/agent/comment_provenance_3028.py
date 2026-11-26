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


def _model_scope(value):
    """3028 sends the original CSV query to MES; compare only its exact codes here."""
    members = [item.strip().casefold() for item in value.split(",")]
    if len(members) > 1 and not all(members):
        raise ValueError("3028: lista de modelos incompleta no resumo")
    return frozenset(members)


def _model_tables(capture):
    """Never concatenate overlapping model queries from the same MES window."""
    tables = {}
    seen = set()
    for run in capture["modelRuns"]:
        scope = _model_scope(run["prodModel"])
        if scope in tables:
            previous = tables[scope]
            # Only the ordering/spelling of the model parameter may differ.
            params = {**run.get("params", {}), "prodModel": previous["prodModel"]}
            comparable = {**run, "prodModel": previous["prodModel"]}
            if "params" in run:
                comparable["params"] = params
            if comparable != previous:
                raise ValueError("3028: respostas diferentes para o mesmo modelo e período")
            continue
        if seen.intersection(scope) or (seen and ("" in scope or "" in seen)):
            raise ValueError("3028: consultas de modelos sobrepostas no mesmo período")
        tables[scope] = run
        seen.update(scope)
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
        fields = {k: v for k, v in row.items() if k != "qty"}
        for key in ("prodModel", "productModel"):
            value = fields.get(key)
            if isinstance(value, str) and "," in value:
                fields[key] = sorted(_model_scope(value))
        key = json.dumps(fields, sort_keys=True)
        counts[key] += qty
    return counts


def _field(row, preferred, fallback):
    for key in (preferred, *fallback):
        if key and row.get(key) is not None and str(row[key]).strip():
            return key, str(row[key]).strip()
    return None, ""


def _scope_error(table, grid, line, model, accepted_models, columns):
    """Identify the first conflicting source field, without exposing the whole row."""
    label = {"summary": "resumo", "grouped": "agrupamento", "detail": "detalhe"}[grid]
    model_fields = ("productModel", "prodModel") if grid == "detail" else ("prodModel", "productModel")
    for index, row in enumerate(table["records"]):
        field, value = _field(row, columns.get("line"), ("lineIdNew", "lineId"))
        what, expected = "linha esperada", line
        if not value or value.casefold() == line.casefold():
            field, value = _field(row, columns.get("model"), model_fields)
            if not model or not value or value.casefold() in accepted_models:
                continue
            if "," in value and _model_scope(value) == _model_scope(model):
                continue
            what, expected = "modelo esperado", model
        # Use actual callback lengths; pages may have fewer rows than pageSize.
        offset = 0
        location = f"registro {index + 1}"
        for info in table.get("pageResults", []):
            count = info.get("count", 0)
            if offset <= index < offset + count:
                location += f", página {info.get('page')}, linha {index - offset + 1} da grade"
                break
            offset += count
        return (f"{label}, {location}: {what} {expected[:80]!r}, "
                f"recebido {value[:80]!r} ({field})")
    return None


def _scope_runs(cap, line):
    from collections import defaultdict
    bindings = cap.get("scope_columns", {})
    summary_error = _scope_error(cap["summary"], "summary", line, "", set(), bindings.get("summary", {}))
    # A query key and display model are aliases only when the same summary
    # record supplies both and no other query key claims the display model.
    owners = defaultdict(set)
    for row in cap["summary"]["records"]:
        _, query = _field(row, "prodModel", ("productModel",))
        _, display = _field(row, "productModel", ())
        scope = _model_scope(query)
        for name in (*scope, query, display):
            if name:
                owners[name.casefold()].add(scope)
    runs = _model_tables(cap)
    for scope, run in runs.items():
        model = run["prodModel"]
        allowed = {name for name, keys in owners.items() if keys == {scope}}
        allowed.add(model.casefold())
        errors = {}
        for grid in ("grouped", "detail"):
            issue = _scope_error(run[grid], grid, line, model, allowed, bindings.get(grid, {}))
            if issue:
                errors[grid] = issue
        if errors:
            runs[scope] = {**run, "scope_errors": errors}
    return summary_error, runs


def _balanced(tables):
    return all(not run.get("scope_errors") and _complete(run["detail"]) and _complete(run["grouped"]) and
               sum(_group_counts(run["grouped"]["records"]).values()) == len(run["detail"]["records"])
               for run in tables.values())


def _confirmed(original, rows, groups):
    native = _counts(original["detail"]["records"])
    recovered = _counts(rows)
    errors = original.get("scope_errors", {})
    exact = "detail" not in errors and _complete(original["detail"]) and native == recovered
    grouped = ("grouped" not in errors and _complete(original["grouped"]) and
               _group_counts(groups) == _group_counts(original["grouped"]["records"]))
    return exact, exact or (grouped and (native <= recovered or recovered <= native))


def _capture_checked_period(read, line, start, end, rescope=None, read_models=None):
    """Read smaller windows if needed, retaining the native full-range FPY and quantity."""
    from datetime import timedelta
    def model_names(runs):
        return {name.strip().casefold(): name.strip() for run in runs.values()
                for name in run["prodModel"].split(",") if name.strip()}

    def explicit_runs(cap, left, right, names):
        fetched = read_models(line, left, right, list(names.values()))
        _, runs = _scope_runs({**cap, "modelRuns": fetched}, line)
        if runs.keys() != {frozenset([name]) for name in names}:
            raise ValueError(f"3028 {line}: resposta incompleta à consulta explícita por modelo")
        columns = cap.get("scope_columns", {}).get("detail", {})
        for scope, run in runs.items():
            for row in run["detail"]["records"]:
                _, model = _field(row, columns.get("model"), ("productModel", "prodModel"))
                if model.casefold() not in scope:
                    run.setdefault("scope_errors", {})["detail"] = "modelo do detalhe sem confirmação individual"
                    break
        return runs

    def capture(left, right, inherited=None):
        cap = read(line, left, right)
        if cap["lineId"] != line:
            raise ValueError(f"3028 {line}: resposta de outra linha")
        summary_error, runs = _scope_runs(cap, line)
        if summary_error:
            cap = {**cap, "summary_scope_error": summary_error}
        if inherited and not summary_error:
            # No production summary is not evidence of zero defect occurrences.
            missing = {k:v for k,v in inherited.items() if k not in model_names(runs)}
            if missing:
                extra = explicit_runs(cap, left, right, missing)
                runs.update(extra)
                cap = {**cap, "modelRuns": list(runs.values())}
        return cap, runs

    def scope_issue(cap, runs):
        if cap.get("summary_scope_error"):
            return cap["summary_scope_error"]
        return next((issue for run in runs.values() for issue in run.get("scope_errors", {}).values()), None)

    def complete(cap, runs):
        return (not cap.get("summary_scope_error") and _complete(cap["summary"])
                and _complete(cap["classification"]) and _balanced(runs))

    full, models = capture(start, end)
    if not complete(full, models):
        contaminated = scope_issue(full, models)
        if contaminated and rescope:
            rescope(line, start, end)
        repeat, repeated = capture(start, end)
        if complete(repeat, repeated):
            confirmed = (not full.get("summary_scope_error") and models.keys() == repeated.keys() and all(
                _confirmed(models[m], r["detail"]["records"], r["grouped"]["records"])[1]
                for m, r in repeated.items()))
            if not confirmed and contaminated and models.keys() == repeated.keys():
                # The first read is an unreliable witness. Require two complete
                # clean reads of the scope, with the same groups and occurrences.
                witness, witnesses = capture(start, end)
                confirmed = (complete(witness, witnesses) and witnesses.keys() == repeated.keys()
                             and _counts(witness["summary"]["records"]) == _counts(repeat["summary"]["records"])
                             and all(_counts(witnesses[m]["detail"]["records"]) == _counts(r["detail"]["records"])
                                     and _group_counts(witnesses[m]["grouped"]["records"]) == _group_counts(r["grouped"]["records"])
                                     for m, r in repeated.items()))
            if not confirmed:
                raise ValueError(f"3028 {line}: releitura integral sem confirmação por modelo"
                                 + (f" ({contaminated})" if contaminated else ""))
            full, models = repeat, repeated
        elif contaminated or not _complete(full["summary"]) or not _complete(full["classification"]):
            full, models = repeat, repeated
    if full.get("summary_scope_error"):
        raise ValueError(f"3028 {line}: {full['summary_scope_error']}")
    if not _complete(full["summary"]) or not _complete(full["classification"]):
        raise ValueError(f"3028 {line}: resumo ou classificação incompletos no período solicitado")
    original_issue = scope_issue(full, models)

    def mismatch(cap, runs, left, right):
        issue = scope_issue(cap, runs)
        if issue:
            context = (f" | Consulta integral: {original_issue}"
                       if original_issue and (left, right) != (start, end) else "")
            return ValueError(f"3028 {line} entre {left} e {right}: {issue}{context}")
        grouped = sum(sum(_group_counts(r["grouped"]["records"]).values()) for r in runs.values())
        detail = sum(len(r["detail"]["records"]) for r in runs.values())
        return ValueError(f"3028 {line} entre {left} e {right}: agrupado={grouped}, detalhe={detail}; "
                          "paginação ou totais por modelo sem confirmação.")

    inherited = None
    if read_models and any(len(scope) > 1 for scope in models) and not _balanced(models):
        inherited = model_names(models)
        individual = explicit_runs(full, start, end, inherited)
        # Accept the explicit grids only if balanced and their disjoint detail
        # occurrences reproduce every original full-period record, per scope.
        if _balanced(individual) and all(
            not run.get("scope_errors") and _complete(run["detail"]) and
            _counts(run["detail"]["records"]) == _counts(
                row for member in scope for row in individual[frozenset([member])]["detail"]["records"])
            for scope, run in models.items()
        ):
            models = individual

    parts = []
    if _balanced(models):
        parts.append((full, models))
    else:
        # Keep all boundaries at an MES hour. Recursively narrow only a failed slice.
        def collect_slice(left, right):
            cap, runs = capture(left, right, inherited)
            if scope_issue(cap, runs) and rescope:
                rescope(line, left, right)
                cap, runs = capture(left, right, inherited)
            if complete(cap, runs):
                parts.append((cap, runs))
                return
            if right - left <= timedelta(hours=1):
                raise mismatch(cap, runs, left, right)
            pivot = left + timedelta(hours=int((right - left).total_seconds() // 7200))
            collect_slice(left, pivot)
            collect_slice(pivot, right)

        if end - start <= timedelta(hours=1):
            raise mismatch(full, models, start, end)
        step = timedelta(hours=min(168, max(1, int((end-start).total_seconds() // 7200))))
        left = start
        while left < end:
            right = min(left + step, end)
            collect_slice(left, right)
            left = right

    # A shorter window can contain just one member of a full-window model list.
    # Group complete subqueries under their unique full scope; original detail
    # and group counts must still independently witness the recovered records.
    selected_by_scope = {scope: [] for scope in models}
    covered = set()
    for _, runs in parts:
        for scope, run in runs.items():
            parent = next((candidate for candidate in models if scope <= candidate), None)
            if parent is None:
                raise ValueError("3028: modelos das subconsultas divergem do resumo do período")
            selected_by_scope[parent].append(run)
            covered.update(scope)
    if covered != set().union(*models):
        raise ValueError("3028: modelos das subconsultas divergem do resumo do período")
    grouped, detail = [], []
    for scope, original in models.items():
        model = original["prodModel"]
        selected = selected_by_scope[scope]
        rows = [row for r in selected for row in r["detail"]["records"]]
        groups = [row for r in selected for row in r["grouped"]["records"]]
        if parts[0][0] is not full:
            native_detail, confirmed = _confirmed(original, rows, groups)
            # Same raw event returned by neighboring intervals: never count it twice.
            # A unique full-range multiset is stronger evidence than a guessed boundary.
            seen = set()
            for r in selected:
                keys = set(_counts(r["detail"]["records"]))
                if seen.intersection(keys) and not native_detail:
                    raise ValueError(f"3028 {line}: limite entre subconsultas ambíguo para {model}")
                seen.update(keys)
            if not confirmed:
                issue = scope_issue(full, models)
                raise ValueError(f"3028 {line}: subconsultas sem confirmação independente no período para {model}"
                                 + (f" ({issue})" if issue else ""))
        detail.extend(rows)
        grouped.extend(groups)
    result = {**full, "detail": {"records": detail, "total": len(detail)},
              "grouped": {"records": grouped, "total": len(grouped)},
              "modelRuns": [run for _, runs in parts for run in runs.values()]}
    result["verified_windows"] = [cap["baseParams"] for cap, _ in parts]
    return result


def _work_page(browser, host):
    """Choose one same-host 3028 tab and keep it throughout the batch."""
    from urllib.parse import urlsplit
    target = urlsplit(host if "://" in host else "//" + host)
    pages = []
    for context in browser.contexts:
        for page in context.pages:
            url = urlsplit(page.url)
            if (url.scheme in ("http", "https") and url.hostname == target.hostname
                    and (target.port is None or url.port == target.port)
                    and "asymes" in url.path.split("/")):
                pages.append(page)
    if not pages:
        raise RuntimeError("Nenhuma sessão A-MES aberta no Chrome dedicado para o posto configurado.")

    def foreground(page):
        try:
            return page.evaluate("document.visibilityState === 'visible'")
        except Exception:
            return False

    views = [p for p in pages if "vwfpyinquireview" in urlsplit(p.url).fragment.lower()]
    candidates = views or pages
    page = next((p for p in candidates if foreground(p)), candidates[0])
    if not views:
        page.goto(page.url.split("#", 1)[0] + "#UAWIP.form.VwFpyInquireView",
                  wait_until="domcontentloaded", timeout=20000)
    return page


# Wait for the four 3028 stores, including loads started by MES selection
# listeners. A URL/hash change alone does not mean the new grids are ready.
_READY = """() => {
  const all = window.Ext?.ComponentManager?.all;
  const items = all?.items || all?.getArray?.() || window.Ext?.ComponentQuery?.query('*') || [];
  return ['grdListByConds', 'grdListByConds2', 'grdSum', 'grdListDetail'].every(id => {
    const c = items.find(c => c?.itemId === id);
    const s = c?.getStore?.() || c?.store;
    return s && !s.isLoading?.();
  });
}"""


# Consult the dataIndex of the actual labelled column, since some MES rows
# contain both legacy and display fields. Only read known line/model keys.
_COLUMNS = """() => {
  const all = window.Ext?.ComponentManager?.all;
  const items = all?.items || all?.getArray?.() || window.Ext?.ComponentQuery?.query('*') || [];
  const result = {};
  for (const [name, id] of Object.entries({summary:'grdListByConds', grouped:'grdSum', detail:'grdListDetail'})) {
    const grid = items.find(c => c?.itemId === id);
    const cols = grid?.getColumnManager?.()?.getColumns?.() || grid?.columns || [];
    result[name] = {};
    for (const [kind, labels, keys] of [
      ['line', ['lineid'], ['lineId', 'lineIdNew']],
      ['model', ['prodmodel', 'productmodel'], ['prodModel', 'productModel']]
    ]) {
      const fields = new Set(Array.from(cols).filter(c => !c.hidden &&
        labels.includes(String(c.text || '').replace(/<[^>]*>/g,'').toLowerCase().replace(/[^a-z]/g,'')))
        .map(c => c.dataIndex).filter(k => keys.includes(k)));
      if (fields.size === 1) result[name][kind] = [...fields][0];
    }
  }
  return result;
}"""


# Query only the occurrence stores when a model was established by the full
# period. Production summary rows can be absent during an interval with repairs.
_READ_MODELS = """async ({query, models}) => {
  const all = window.Ext?.ComponentManager?.all;
  const items = all?.items || all?.getArray?.() || window.Ext?.ComponentQuery?.query('*') || [];
  function load(store, page) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('3028: tempo esgotado na página ' + page)), 20000);
      try {
        store.loadPage(page, {callback(records, operation, success) {
          clearTimeout(timer);
          if (!success) return reject(Error('3028: falha ao ler página ' + page));
          try { resolve((records || []).map(r => JSON.parse(JSON.stringify(r.getData ? r.getData() : r.data)))); }
          catch (err) { reject(err); }
        }});
      } catch (err) { clearTimeout(timer); reject(err); }
    });
  }
  async function read(gridId, params) {
    const grid = items.find(c => c.itemId === gridId);
    const store = grid.getStore?.() || grid.store;
    const proxy = store.getProxy?.() || store.proxy;
    const saved = {...(proxy.extraParams || {})}, savedPage = store.currentPage || 1;
    const apply = p => { if (proxy.setExtraParams) proxy.setExtraParams(p); else proxy.extraParams = p; };
    try {
      apply(params);
      const records = await load(store, 1);
      const total = store.getTotalCount();
      if (!Number.isSafeInteger(total) || total < 0) throw Error('3028: total de registros inválido');
      const pageSize = store.pageSize || records.length || 100;
      const pages = records.length >= total ? 1 : Math.ceil(total / pageSize);
      const pageResults = [{page:1, count:records.length, success:true}];
      for (let page=2; page<=pages; page++) {
        apply(params);
        const batch = await load(store, page);
        if (store.getTotalCount() !== total) throw Error('3028: total mudou durante a paginação');
        records.push(...batch);
        pageResults.push({page, count:batch.length, success:true});
      }
      return {records, total, pageSize, pages, pageResults};
    } finally {
      apply(saved);
      await load(store, savedPage);
    }
  }
  const result = [];
  for (const prodModel of models) {
    const params = {...query, prodModel, procstep:1, orderId:'', workShift:'ALL'};
    const detail = await read('grdListDetail', params);
    const grouped = await read('grdSum', params);
    result.push({prodModel, params, detail, grouped});
  }
  return result;
}"""


def collect_3028_period(*, cdp_url, ames_host, lines, start_at, end_at):
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
        page = _work_page(pw.chromium.connect_over_cdp(cdp_url), ames_host)
        page.wait_for_function(_READY, timeout=20000)
        if not lines:
            current = page.evaluate("""() => {
                const grid = Ext.ComponentQuery.query('*').find(c => c.itemId === 'grdListByConds');
                const row = (grid.getStore?.() || grid.store).getRange()[0];
                const data = row?.getData?.() || row?.data || {};
                return String(data.lineIdNew || data.lineId || '').trim();
            }""")
            if not current:
                raise RuntimeError("Nenhuma linha configurada. Use 'Configurar posto' e informe as linhas A-MES.")
            lines = [current]

        columns = page.evaluate(_COLUMNS)

        def rescope(line, left, right):
            page.evaluate(source.SYNC_VISIBLE_JS, params(line, left, right))

        def read(line, left, right):
            page.wait_for_function(_READY, timeout=20000)
            cap = page.evaluate(source.QUERY_LINE_JS, params(line, left, right))
            cap["scope_columns"] = columns
            return cap
        def read_models(line, left, right, models):
            page.wait_for_function(_READY, timeout=20000)
            return page.evaluate(_READ_MODELS, {"query": params(line, left, right), "models": models})

        # Even a rejected batch must return the operator to the line that
        # actually failed. The native query restores its previous store filters.
        line = lines[0]
        try:
            for line in lines:
                # Seed the visible filters before the native query saves their
                # state. Its finally block then restores this line between pages
                # and subwindows instead of the previous line's view.
                rescope(line, start, end)
                cap = _capture_checked_period(read, line, start, end, rescope, read_models)
                line_metrics = [source._summary_to_metric(r, line) for r in cap["summary"]["records"]]
                details = [source._detail_to_record(r, line) for r in cap["detail"]["records"]]
                for metric in line_metrics:
                    metric["line"] = line  # summary validated against its bound line column
                for record in details:
                    record["line"] = line  # validated detailed rows; retain original fields in raw
                    _, model = _field(record["raw"], columns["detail"].get("model"), ("productModel", "prodModel"))
                    record["product_model"] = model
                units = sum(m["total_defect_qty"] or 0 for m in line_metrics)
                if units > len(details):
                    raise ValueError(f"3028 {line}: {units} unidades com defeito no resumo e {len(details)} ocorrências no detalhe")
                metrics.extend(line_metrics)
                records.extend(details)
                captures.append(cap)
                validations.append(dict(line=line, summary_defective_units=units, detail_occurrences=len(details),
                    unique_pcbas=len({r["pcba_sn"] for r in details if r["pcba_sn"]}),
                    extra_defect_occurrences=len(details)-units, grouped_total=len(details), grouped_matches_detail=True,
                    ok=True, models=[m["product_model"] for m in line_metrics], verified_windows=len(cap["verified_windows"])))
        finally:
            try:
                visible = page.evaluate(source.SYNC_VISIBLE_JS, params(line, start, end))
                page.wait_for_function(_READY, timeout=20000)
            except Exception as exc:
                visible = {"warning": f"UI_SYNC_FAILED: {exc}", **params(line, start, end)}
    return dict(source="AWIP3028_DIRECT_EXTJS", captured_at=datetime.now().isoformat(timespec="seconds"),
                requested_lines=lines, lines=sorted({r["line"] for r in metrics} | {r["line"] for r in records}),
                window=window, line_metrics=metrics, records=records,
                records_count=len(records), captures=captures, validations=validations, visible_state=visible)
