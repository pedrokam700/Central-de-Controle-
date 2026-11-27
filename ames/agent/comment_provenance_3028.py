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
    if not summary_error:
        summary_error = _scope_error(cap.get("classification", {"records":[]}), "summary", line, "", set(), {})
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


def _codes_match(run):
    from collections import Counter
    details = run["detail"]["records"]
    groups = run["grouped"]["records"]
    if sum(_group_counts(groups).values()) != len(details):
        return False
    # Older source variants did not export the code field in every grid.
    if not all("defectCode" in row for row in (*details, *groups)):
        return True
    grouped = Counter()
    for row in groups:
        grouped[str(row["defectCode"] or "").strip()] += int(row["qty"])
    return Counter(str(r["defectCode"] or "").strip() for r in details) == grouped


def _balanced(tables):
    return all(not run.get("scope_errors") and _complete(run["detail"]) and _complete(run["grouped"])
               and _codes_match(run) for run in tables.values())


def _confirmed(original, rows, groups):
    native = _counts(original["detail"]["records"])
    recovered = _counts(rows)
    errors = original.get("scope_errors", {})
    exact = "detail" not in errors and _complete(original["detail"]) and native == recovered
    grouped = ("grouped" not in errors and _complete(original["grouped"]) and
               _group_counts(groups) == _group_counts(original["grouped"]["records"]))
    return exact, exact or (grouped and "detail" not in errors and native.keys() == recovered.keys() and (native <= recovered or recovered <= native))


def _native_agrees(cap, runs, repeat, repeated, line, read_visible, diagnostic=None):
    """An independently selected MES row must reproduce both whole source tables."""
    def reject(reason):
        if diagnostic is not None:
            diagnostic.append(reason)
        return False

    if (not read_visible or not runs or runs.keys() != repeated.keys()
            or any(c.get("summary_scope_error") or not _complete(c["summary"])
                   or not _complete(c["classification"]) for c in (cap, repeat))):
        return reject("resumo/classificação incompletos ou escopos de modelo divergentes")
    summary = cap["summary"]["records"]
    if (_counts(summary) != _counts(repeat["summary"]["records"])
            or _counts(cap["classification"]["records"]) != _counts(repeat["classification"]["records"])):
        return reject("resumo ou classificação mudou durante a leitura")
    columns = cap.get("scope_columns", {}).get("detail", {})
    for scope, run in runs.items():
        matching = [row for row in summary if _model_scope(_field(row,"prodModel",("productModel",))[1]) == scope]
        other = repeated[scope]
        if (len(matching) != 1 or not all(scope) or any(r.get("scope_errors") or
                not all(_complete(r[k]) for k in ("detail","grouped")) for r in (run,other))):
            return reject("resumo sem linha única selecionável ou grades sem completude")
        detail = _counts(run["detail"]["records"])
        if detail != _counts(other["detail"]["records"]) or _counts(run["grouped"]["records"]) != _counts(other["grouped"]["records"]):
            return reject("detalhe ou agrupamento mudou entre consultas")
        for row in run["detail"]["records"]:
            _, row_line = _field(row, columns.get("line"), ("lineIdNew", "lineId"))
            _, model = _field(row, columns.get("model"), ("productModel", "prodModel"))
            if row_line.casefold() != line.casefold() or model.casefold() not in scope:
                return reject("linha ou modelo de uma ocorrência não comprovado")
        visible = read_visible(run["prodModel"])
        if (visible is None or _counts(visible["summary"]) != _counts(matching)
                or _counts(visible["detail"]) != detail or _counts(visible["grouped"]) != _counts(run["grouped"]["records"])):
            return reject("seleção sem resposta íntegra para as duas grades")
    return True


def _capture_checked_period(read, line, start, end, rescope=None, read_models=None, read_visible=None, read_visible_slice=None):
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
        if not runs and not inherited and read_models and not summary_error:
            # An empty production summary can coexist with defects during repairs.
            # Query both occurrence grids using the line and period, without a model filter.
            fetched = read_models(line, left, right, [""])
            if len(fetched) != 1 or fetched[0]["prodModel"] != "":
                raise ValueError(f"3028 {line}: consulta sem filtro de modelo não confirmada")
            cap = {**cap, "modelRuns": fetched}
            _, runs = _scope_runs(cap, line)
            unfiltered = fetched[0]
            if any(not _field(row, cap.get("scope_columns", {}).get("detail", {}).get("line"),
                              ("lineIdNew","lineId"))[1] for row in unfiltered["detail"]["records"]):
                raise ValueError(f"3028 {line}: ocorrências sem linha comprovada na consulta sem resumo")
            if all(_complete(unfiltered[k]) and not unfiltered[k]["records"] for k in ("detail","grouped")):
                cap = {**cap, "modelRuns": []}
                runs = {}
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

    native_verified = False
    full, models = capture(start, end)
    if not complete(full, models) or (not full["summary"]["records"] and read_models):
        contaminated = scope_issue(full, models)
        if contaminated and rescope:
            rescope(line, start, end)
        repeat, repeated = capture(start, end)
        if (_counts(full["summary"]["records"]) != _counts(repeat["summary"]["records"])
                or _counts(full["classification"]["records"]) != _counts(repeat["classification"]["records"])):
            # A correction in MES is valid in a later capture. Do not assemble two generations.
            raise ValueError(f"3028 {line}: resumo ou classificação mudou durante a coleta")
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
        elif _native_agrees(full, models, repeat, repeated, line, read_visible):
            native_verified = True
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
    if not native_verified and read_models and any(len(scope) > 1 for scope in models) and not _balanced(models):
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
    native_windows = []
    if native_verified or _balanced(models):
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
                if read_visible_slice and not scope_issue(cap, runs):
                    if rescope:
                        rescope(line, left, right)
                    witness, repeated_runs = capture(left, right, inherited)
                    diagnostic = []
                    if _native_agrees(cap, runs, witness, repeated_runs, line,
                                      lambda model: read_visible_slice(model, left, right), diagnostic):
                        parts.append((cap, runs))
                        native_windows.append(cap["baseParams"])
                        return
                    raise ValueError(f"{mismatch(cap, runs, left, right)} "
                                     "seleção nativa da fatia sem confirmação. " + " ".join(diagnostic))
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
                if seen.intersection(keys) and (native_windows or not native_detail):
                    raise ValueError(f"3028 {line}: limite entre subconsultas ambíguo para {model}")
                seen.update(keys)
            if not confirmed or (native_windows and not native_detail):
                issue = scope_issue(full, models)
                raise ValueError(f"3028 {line}: subconsultas sem confirmação independente no período para {model}"
                                 + (f" ({issue})" if issue else ""))
        detail.extend(rows)
        grouped.extend(groups)
    result = {**full, "detail": {"records": detail, "total": len(detail)},
              "grouped": {"records": grouped, "total": len(grouped)},
              "modelRuns": [run for _, runs in parts for run in runs.values()]}
    if native_windows:
        result["verification_method"] = "native_selected_3028_subwindows"
        result["native_verified_windows"] = native_windows
    if native_verified:
        result["verification_method"] = "native_selected_3028_grids"
    if parts[0][0] is not full or full["modelRuns"] != result["modelRuns"]:
        result["full_period_model_runs"] = full["modelRuns"]
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


# The existing period adapter owns these page programs, including its updater inventory.
_SCOPED_STORES = r"""
async (cfg) => {
  if (!window.Ext) throw new Error('ExtJS nao encontrado na pagina.');

  function allComponents(){
    let comps=[];
    try{
      const all=Ext.ComponentManager&&Ext.ComponentManager.all;
      if(all){
        if(all.items) comps=all.items;
        else if(all.getArray) comps=all.getArray();
        else if(all.each) all.each(x=>comps.push(x));
      }
    }catch(e){}
    if(!comps.length && Ext.ComponentQuery && Ext.ComponentQuery.query){
      try{comps=Ext.ComponentQuery.query('*')}catch(e){}
    }
    return comps;
  }

  const comps=allComponents();
  const byItemId=(id)=>{
    const found=comps.filter(c=>c&&c.itemId===id);
    if(found.length<2) return found[0]||null;
    const shown=found.filter(c=>c.isVisible?.(true));
    if(shown.length!==1) throw Error('3028: componente ambiguo '+id);
    return shown[0];
  };
  const dataOf=r=>JSON.parse(JSON.stringify(r.getData ? r.getData() : r.data));

  function getStore(itemId){
    const cmp=byItemId(itemId);
    if(!cmp) throw new Error('Componente nao encontrado: '+itemId);
    const store=cmp.getStore?cmp.getStore():cmp.store;
    if(!store) throw new Error('Store nao encontrado: '+itemId);
    return store;
  }

  function applyParams(store,params){
    const proxy=store.getProxy?store.getProxy():store.proxy;
    if(!proxy) throw new Error('Proxy ausente');
    if(proxy.setExtraParams) proxy.setExtraParams({...params});
    else proxy.extraParams={...params};
  }

  async function loadPage(store,pageNo,params){
    applyParams(store,params);
    return await new Promise(resolve=>{
      let done=false;
      const timer=setTimeout(()=>{
        if(!done){done=true;resolve({success:false,timeout:true,records:[],error:'timeout'});}
      },20000);
      try{
        store.loadPage(pageNo,{
          callback:(records,operation,success)=>{
            if(done)return;
            done=true;clearTimeout(timer);
            const returnedPage=operation?.getPage?.() ?? operation?.page ?? store.currentPage;
            const current=Object.entries(params).every(([k,v])=>
              String((store.getProxy?.() || store.proxy)?.extraParams?.[k])===String(v));
            const response=operation?.getParams?.() || operation?.params || {};
            const correctScope=Object.entries(params).every(([k,v])=>
              !(k in response) || String(response[k])===String(v));
            try {resolve({success:!!success && current && correctScope && Number(returnedPage)===pageNo,timeout:false,records:(records||[]).map(dataOf),error:null});}
            catch(e){resolve({success:false,records:[],error:String(e)});}
          }
        });
      }catch(e){
        if(!done){done=true;clearTimeout(timer);resolve({success:false,timeout:false,records:[],error:String(e)});}
      }
    });
  }

  async function loadAll(store,params){
    const first=await loadPage(store,1,params);
    if(!first.success) throw new Error('3028: Falha pagina 1: '+(first.error||'sem detalhe'));
    const total=store.getTotalCount?store.getTotalCount():first.records.length;
    const pageSize=store.pageSize||first.records.length||100;
    const pages=first.records.length>=total?1:Math.max(1,Math.ceil(total/pageSize));
    if (!Number.isSafeInteger(total) || total<0 || !Number.isSafeInteger(pageSize) || pageSize<1)
      throw Error('3028: total ou tamanho de pagina invalido');
    const records=[...first.records];
    const signatures=[JSON.stringify(first.records)];
    const seen=new Set(signatures);
    const pageResults=[{page:1,success:true,count:first.records.length}];
    for(let p=2;p<=pages;p++){
      const r=await loadPage(store,p,params);
      pageResults.push({page:p,success:r.success,count:r.records.length,timeout:r.timeout,error:r.error||null});
      if(!r.success) throw new Error('3028: Falha pagina '+p+': '+(r.error||'sem detalhe'));
      if (store.getTotalCount()!==total || !r.records.length) throw Error('3028: total mudou na paginacao');
      const signature=JSON.stringify(r.records);
      if (seen.has(signature)) throw Error('3028: pagina repetida sem identidade independente');
      seen.add(signature); signatures.push(signature);
      records.push(...r.records);
    }
    if(records.length!==total) throw Error('3028: pagina incompleta');
    for(let p=pages; pages>1 && p>=1; p--){
      const check=await loadPage(store,p,params);
      if(!check.success || store.getTotalCount()!==total || JSON.stringify(check.records)!==signatures[p-1])
        throw Error('3028: conteudo mudou durante a paginacao');
    }
    return {records,total,pageSize,pages,pageResults};
  }

"""

QUERY_LINE_JS = _SCOPED_STORES + r"""  const stores={
    summary:getStore('grdListByConds'),
    classification:getStore('grdListByConds2'),
    grouped:getStore('grdSum'),
    detail:getStore('grdListDetail')
  };

  const original={};
  for(const [name,store] of Object.entries(stores)){
    const proxy=store.getProxy?store.getProxy():store.proxy;
    original[name]={
      page:store.currentPage||1,
      extra:proxy&&proxy.extraParams?JSON.parse(JSON.stringify(proxy.extraParams)):{}
    };
  }

  async function restore(){
    for(const [name,store] of Object.entries(stores)){
      try{
        const o=original[name];
        applyParams(store,o.extra||{});
        await loadPage(store,o.page||1,o.extra||{});
      }catch(e){}
    }
  }

  try{
    const base={
      area:'TA',
      productionType:'LC',
      lineId:cfg.lineId,
      dateFrom:cfg.dateFrom,
      startTimeZone:cfg.startTimeZone,
      dateTo:cfg.dateTo,
      endTimeZone:cfg.endTimeZone,
      procstep:'1'
    };

    const summary=await loadAll(stores.summary,base);
    const classification=await loadAll(stores.classification,base);
    const summaryRecords=summary.records||[];

    const details=[];
    const grouped=[];
    const modelRuns=[];

    if(!summaryRecords.length){
      return {
        lineId:cfg.lineId,
        baseParams:base,
        summary,
        classification,
        grouped:{records:[],total:0,pageSize:0,pages:0,pageResults:[]},
        detail:{records:[],total:0,pageSize:0,pages:0,pageResults:[]},
        modelRuns:[],
        warning:'SEM_DADOS_RESUMO'
      };
    }

    for(const s of summaryRecords){
      const prodModel=String(s.prodModel||s.productModel||'').trim();
      const p={
        procstep:1,
        orderId:'',
        lineId:cfg.lineId,
        prodModel:prodModel,
        dateFrom:cfg.dateFrom,
        dateTo:cfg.dateTo,
        startTimeZone:cfg.startTimeZone,
        endTimeZone:cfg.endTimeZone,
        workShift:'ALL'
      };
      const d=await loadAll(stores.detail,p);
      const g=await loadAll(stores.grouped,p);
      details.push(...d.records);
      grouped.push(...g.records);
      modelRuns.push({prodModel,detail:d,grouped:g,params:p});
    }

    for(const [store,table] of [[stores.summary,summary],[stores.classification,classification]]){
      const final=await loadAll(store,base);
      if(JSON.stringify(final.records)!==JSON.stringify(table.records))
        throw Error('3028: resumo ou classificacao mudou durante a coleta');
    }
    return {
      lineId:cfg.lineId,
      baseParams:base,
      summary,
      classification,
      grouped:{records:grouped,total:grouped.length},
      detail:{records:details,total:details.length},
      modelRuns
    };
  } finally {
    await restore();
  }
}
"""

SYNC_VISIBLE_JS = _SCOPED_STORES + r"""  function setText(id,value){
    const c=byItemId(id); if(!c) return false;
    try{if(c.setValue)c.setValue(value);}catch(e){}
    try{if(c.setRawValue)c.setRawValue(value);}catch(e){}
    return true;
  }
  function setDate(id,yyyymmdd){
    const c=byItemId(id); if(!c) return false;
    const y=Number(yyyymmdd.slice(0,4)),m=Number(yyyymmdd.slice(4,6)),d=Number(yyyymmdd.slice(6,8));
    const dt=new Date(y,m-1,d);
    try{if(c.setValue)c.setValue(dt);}catch(e){}
    try{if(c.setRawValue)c.setRawValue(`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);}catch(e){}
    return true;
  }
  setText('cdvLineIdNew',cfg.lineId);
  setText('cdvLineId',cfg.lineId);
  setDate('dteDateFrom',cfg.dateFrom);
  setText('cmbStart',cfg.startTimeZone);
  setDate('dteDateTo',cfg.dateTo);
  setText('cmbEnd',cfg.endTimeZone);

  const base={area:'TA',productionType:'LC',lineId:cfg.lineId,dateFrom:cfg.dateFrom,startTimeZone:cfg.startTimeZone,dateTo:cfg.dateTo,endTimeZone:cfg.endTimeZone,procstep:'1'};
  const summaryStore=getStore('grdListByConds');
  const classStore=getStore('grdListByConds2');
  const groupedStore=getStore('grdSum');
  const detailStore=getStore('grdListDetail');

  const summaryResult=await loadPage(summaryStore,1,base);
  await loadPage(classStore,1,base);
  let prodModel='';
  if(summaryResult.success && summaryResult.records.length){
    prodModel=String(summaryResult.records[0].prodModel||summaryResult.records[0].productModel||'').trim();
    const detailParams={procstep:1,orderId:'',lineId:cfg.lineId,prodModel,dateFrom:cfg.dateFrom,dateTo:cfg.dateTo,startTimeZone:cfg.startTimeZone,endTimeZone:cfg.endTimeZone,workShift:'ALL'};
    await loadPage(groupedStore,1,detailParams);
    await loadPage(detailStore,1,detailParams);
    try{
      const grid=byItemId('grdListByConds');
      const sm=grid&&grid.getSelectionModel?grid.getSelectionModel():null;
      if(sm&&sm.select)sm.select(0);
      const view=grid&&grid.getView?grid.getView():null;
      if(view&&view.focusRow)view.focusRow(0);
    }catch(e){}
  }
  return {lineId:cfg.lineId,dateFrom:cfg.dateFrom,startTimeZone:cfg.startTimeZone,dateTo:cfg.dateTo,endTimeZone:cfg.endTimeZone,prodModel,summaryCount:summaryResult.records.length,detailCount:detailStore.getCount?detailStore.getCount():null};
}
"""

_READ_MODELS = _SCOPED_STORES + r"""  const result=[];
  for (const prodModel of cfg.models) {
    const params={...cfg.query,prodModel,procstep:1,orderId:'',workShift:'ALL'};
    const run={prodModel,params};
    for (const [key,id] of [['detail','grdListDetail'],['grouped','grdSum']]) {
      const store=getStore(id), proxy=store.getProxy?.() || store.proxy;
      const previous={...proxy.extraParams}, previousPage=store.currentPage || 1;
      try {run[key]=await loadAll(store,params);}
      finally {await loadPage(store,previousPage,previous);}
    }
    result.push(run);
  }
  return result;
}"""


# Wait for the four 3028 stores, including loads started by MES selection
# listeners. A URL/hash change alone does not mean the new grids are ready.
_READY = """() => {
  const all = window.Ext?.ComponentManager?.all;
  const items = all?.items || all?.getArray?.() || window.Ext?.ComponentQuery?.query('*') || [];
  return ['grdListByConds', 'grdListByConds2', 'grdSum', 'grdListDetail'].every(id => {
    const matching = items.filter(c => c?.itemId === id);
    const visible = matching.filter(c => c.isVisible?.(true));
    const c = matching.length === 1 ? matching[0] : (visible.length === 1 ? visible[0] : null);
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
    const matching = items.filter(c => c?.itemId === id);
    const visible = matching.filter(c => c.isVisible?.(true));
    const c = matching.length === 1 ? matching[0] : (visible.length === 1 ? visible[0] : null);
    const grid = c;
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
# Reproduce the operator's selection. The occurrence stores keep their own native
# filters. Only their page number changes, and each page is checked before use.
_NATIVE_SELECTION = r"""async cfg => {
  const components = window.Ext?.ComponentQuery?.query('*') || [];
  function component(id) {
    const found = components.filter(c => c.itemId === id);
    const visible = found.filter(c => c.isVisible?.(true));
    return found.length === 1 ? found[0] : (visible.length === 1 ? visible[0] : null);
  }
  const grid = component('grdListByConds'), summary = grid?.getStore?.() || grid?.store;
  const sm = grid?.getSelectionModel?.();
  if (!summary || !sm?.deselectAll) return null;
  const modelSet = s => String(s || '').split(',').map(m => m.trim().toUpperCase()).sort().join(',');
  const raw = r => JSON.parse(JSON.stringify(r.getData ? r.getData() : r.data));
  if (!scope(summary,false)) return null;
  function candidates() {
    return summary.getRange().filter(r => {
      const d=raw(r);
      return modelSet(d.prodModel || d.productModel) === modelSet(cfg.model);
    });
  }
  let matches=candidates();
  if (!matches.length && summary.pageSize > 0) {
    const total=summary.getTotalCount(), pages=Math.ceil(total/summary.pageSize);
    for (let n=1; n<=pages && !matches.length; n++) {
      if (n !== summary.currentPage) await page(summary,n);
      if (!scope(summary,false) || summary.currentPage!==n || summary.getTotalCount()!==total) return null;
      matches=candidates();
    }
  }
  if(matches.length !== 1) return null;
  const row = matches[0], node = grid.getView()?.getNode(row);
  if(!node) return null;
  const summaryRow = raw(row);
  if (modelSet(summaryRow.prodModel || summaryRow.productModel) !== modelSet(cfg.model)) return null;
  const tables = {};
  for (const [key,id] of [['grouped','grdSum'],['detail','grdListDetail']]) {
    const c=component(id), s=c?.getStore?.() || c?.store;
    if (!s || s.isLoading?.() || !s.on || !s.un) return null;
    tables[key]=s;
  }
  function scope(s, withModel, operation=null) {
    const proxy = s.getProxy?.() || s.proxy;
    const p = {...proxy?.extraParams, ...s.lastOptions?.params, ...(operation?.getParams?.() || operation?.params)};
    return ['lineId','dateFrom','dateTo','startTimeZone','endTimeZone'].every(k =>
      k.endsWith('TimeZone') ? p[k] != null && Number(p[k]) === Number(cfg[k]) : String(p[k]) === cfg[k])
      && (!withModel || modelSet(p.prodModel || p.productModel) === modelSet(cfg.model));
  }
  if (!scope(summary,false)) return null;
  const status = {}, cleanup = [];
  let armed=false;
  for (const [key,s] of Object.entries(tables)) {
    const listen = (source,rows,ok,operation) => {
      const page = operation?.getPage?.() ?? operation?.page ?? s.currentPage;
      const current = s.getRange();
      if(!armed)return;
      status[key] = source === s && ok === true && Number(page) === 1 && scope(s,true,operation)
        && validSelection() && rows.length === current.length
        && rows.every((record,i) => record === current[i]);
    };
    s.on('load',listen); cleanup.push(() => s.un('load',listen));
  }
  function release() {for (const off of cleanup.splice(0)) off();}
  function validSelection() {const selected=sm.getSelection();return selected?.length===1 && selected[0] === row && scope(summary,false);}
  async function page(s,n) {
    const q = {...s.lastOptions?.params};
    const proxy=s.getProxy?.() || s.proxy;
    for (const k of ['page','start','limit',proxy?.pageParam,proxy?.startParam,proxy?.limitParam]) delete q[k];
    await new Promise((resolve,reject) => {
      const t=setTimeout(() => reject(Error('3028: tempo esgotado na pagina nativa')),20000);
      try {s.loadPage(n,{params:q,callback:(_rows,_op,ok) => {
        clearTimeout(t); if (ok && Number(_op?.getPage?.() ?? _op?.page ?? s.currentPage) === n) resolve(); else reject(Error('3028: pagina nativa incompleta'));
      }});} catch(e) {clearTimeout(t);reject(e);}
    });
  }
  async function records(s) {
    if (!scope(s,true) || (s.currentPage || 1) !== 1) return null;
    const total=s.getTotalCount(), size=s.pageSize || s.getCount() || 1;
    if (!Number.isSafeInteger(total) || total<0 || !Number.isSafeInteger(size) || size<1) return null;
    const batches = s.getCount() === total ? 1 : Math.max(1,Math.ceil(total/size));
    const rows=[];
    try {
      for(let n=1;n<=batches;n++) {
        if(n>1) await page(s,n);
        if (!validSelection() || !scope(s,true) || s.isLoading?.() || (s.currentPage || 1)!==n || s.getTotalCount()!==total) return null;
        rows.push(...s.getRange().map(raw));
      }
      return rows.length === total ? rows : null;
    } finally {if((s.currentPage || 1)!==1 && validSelection()) await page(s,1);}
  }
  return {node,release, async read() {
    const deadline=Date.now()+15000;
    while ((!status.grouped || !status.detail) && Date.now()<deadline) {
      if(status.grouped===false || status.detail===false) return null;
      await new Promise(r=>setTimeout(r,80));
    }
    if (!status.grouped || !status.detail || !validSelection()) return null;
    release();
    const grouped=await records(tables.grouped);
    if (!grouped) return null;
    const detail=await records(tables.detail);
    return detail && validSelection() ? {summary:[summaryRow],grouped,detail} : null;
  }, prepare() {sm.deselectAll(true); armed=true;}};
}"""


def _read_selected_grids(page, cfg, model):
    handle = page.evaluate_handle(_NATIVE_SELECTION, {**cfg, "model": model})
    try:
        if not handle.evaluate("s => Boolean(s)"):
            return None
        node = handle.get_property("node")
        try:
            handle.evaluate("s => s.prepare()")
            node.as_element().click(timeout=5000)
            return handle.evaluate("s => s.read()")
        finally:
            node.dispose()
    finally:
        try:
            handle.evaluate("s => s?.release()")
        finally:
            handle.dispose()


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
            page.evaluate(SYNC_VISIBLE_JS, params(line, left, right))

        def read(line, left, right):
            page.wait_for_function(_READY, timeout=20000)
            try:
                cap = page.evaluate(QUERY_LINE_JS, params(line, left, right))
            except Exception as exc:
                if "3028:" not in str(exc):
                    raise
                if "mudou durante a coleta" in str(exc):
                    raise ValueError(f"3028 {line}: resumo ou classificação mudou durante a coleta") from exc
                raise ValueError(f"3028 {line}: páginas ou escopo da grade não confirmados") from exc
            cap["scope_columns"] = columns
            return cap
        def read_models(line, left, right, models):
            page.wait_for_function(_READY, timeout=20000)
            try:
                return page.evaluate(_READ_MODELS, {"query": params(line, left, right), "models": models})
            except Exception as exc:
                if "3028:" not in str(exc):
                    raise
                raise ValueError(f"3028 {line}: paginação da consulta por modelo sem confirmação") from exc

        # Even a rejected batch must return the operator to the line that
        # actually failed. The native query restores its previous store filters.
        line = lines[0]
        try:
            for line in lines:
                # Seed the visible filters before the native query saves their
                # state. Its finally block then restores this line between pages
                # and subwindows instead of the previous line's view.
                rescope(line, start, end)
                def visible_grids(model, left=start, right=end):
                    from playwright.sync_api import Error as BrowserError
                    try:
                        return _read_selected_grids(page, params(line, left, right), model)
                    except BrowserError:
                        # Keep the established subwindow recovery if the native view is unavailable.
                        return None

                try:
                    cap = _capture_checked_period(read, line, start, end, rescope, read_models, visible_grids, visible_grids)
                except ValueError as exc:
                    if "mudou durante a coleta" not in str(exc):
                        raise
                    rescope(line,start,end)
                    cap = _capture_checked_period(read, line, start, end, rescope, read_models, visible_grids, visible_grids)
                line_metrics = [source._summary_to_metric(r, line) for r in cap["summary"]["records"]]
                details = [source._detail_to_record(r, line) for r in cap["detail"]["records"]]
                for metric in line_metrics:
                    metric["line"] = line  # summary validated against its bound line column
                for record in details:
                    record["line"] = line  # validated detailed rows; retain original fields in raw
                    _, model = _field(record["raw"], columns["detail"].get("model"), ("productModel", "prodModel"))
                    record["product_model"] = model
                units = (sum(m["total_defect_qty"] for m in line_metrics)
                         if line_metrics and all(m["total_defect_qty"] is not None for m in line_metrics) else None)
                if units is not None and units > len(details):
                    raise ValueError(f"3028 {line}: {units} unidades com defeito no resumo e {len(details)} ocorrências no detalhe")
                metrics.extend(line_metrics)
                records.extend(details)
                captures.append(cap)
                grouped_total = sum(_group_counts(cap["grouped"]["records"]).values())
                original = cap.get("full_period_model_runs", cap["modelRuns"])
                validations.append(dict(native_grouped_total=sum(sum(_group_counts(r["grouped"]["records"]).values()) for r in original),
                    native_detail_occurrences=sum(len(r["detail"]["records"]) for r in original), line=line, summary_defective_units=units, detail_occurrences=len(details),
                    unique_pcbas=len({r["pcba_sn"] for r in details if r["pcba_sn"]}),
                    extra_defect_occurrences=len(details)-units if units is not None else None, grouped_total=grouped_total, grouped_matches_detail=grouped_total == len(details),
                    grouped_matches_by_code=all(_codes_match(run) for run in cap["modelRuns"]),
                    verification_method=cap.get("verification_method", "balanced_grids"),
                    ok=True, models=[m["product_model"] for m in line_metrics], verified_windows=len(cap["verified_windows"])))
        finally:
            try:
                visible = page.evaluate(SYNC_VISIBLE_JS, params(line, start, end))
                page.wait_for_function(_READY, timeout=20000)
            except Exception as exc:
                visible = {"warning": f"UI_SYNC_FAILED: {exc}", **params(line, start, end)}
    return dict(source="AWIP3028_DIRECT_EXTJS", captured_at=datetime.now().isoformat(timespec="seconds"),
                requested_lines=lines, lines=sorted({r["line"] for r in metrics} | {r["line"] for r in records}),
                window=window, line_metrics=metrics, records=records,
                records_count=len(records), captures=captures, validations=validations, visible_state=visible)
