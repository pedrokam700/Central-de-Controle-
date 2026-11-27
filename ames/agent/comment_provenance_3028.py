"""Read and verify each native 3028 grid at the requested line and period."""
from collections import Counter
import json


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


_STORE_COMPONENTS = r"""
const ids={summary:'grdListByConds',classification:'grdListByConds2',grouped:'grdSum',detail:'grdListDetail'};
const all=window.Ext?.ComponentManager?.all;
const registered=all?.items || all?.getArray?.() || [];
const items=registered.length?registered:(window.Ext?.ComponentQuery?.query('*') || []);
function component(id){
  const matches=items.filter(c=>c?.itemId===id&&!c.destroyed);
  if(matches.length===1)return matches[0];
  const visible=matches.filter(c=>c.isVisible?.(true));
  return visible.length===1?visible[0]:null;
}
const proxyOf=s=>s.getProxy?.() || s.proxy;
const storeOf=c=>c?.getStore?.() || c?.store;
"""

_READY = "() => {" + _STORE_COMPONENTS + r"""
  const stores=Object.values(ids).map(id=>storeOf(component(id)));
  return new Set(stores).size===stores.length && stores.every(s=>s && !s.isLoading?.());
}
"""

_CURRENT_LINE = "() => {" + _STORE_COMPONENTS + r"""
  const fields=['cdvLineIdNew','cdvLineId'].map(component).filter(Boolean);
  const values=new Set(fields.map(f=>String(f.getRawValue?.() || f.getValue?.() || '').trim()).filter(Boolean));
  return values.size===1?[...values][0]:'';
}
"""

# Use the same blank prodModel parameter as the previous independent read.
# ExtJS's native proxies keep their own endpoint, reader and pagination.
QUERY_LINE_JS = "async cfg => {" + _STORE_COMPONENTS + r"""
  const components=Object.fromEntries(Object.entries(ids).map(([name,id])=>[name,component(id)]));
  const stores=Object.fromEntries(Object.entries(components).map(([name,c])=>[name,storeOf(c)]));
  const entries=Object.entries(stores);
  if(entries.some(([,s])=>!s || !proxyOf(s) || s.isLoading?.()) ||
     new Set(Object.values(stores)).size!==entries.length)
    throw Error('3028: grades ausentes, ambíguas ou ocupadas');

  const base={area:'TA',productionType:'LC',...cfg,procstep:'1'};
  const linePeriod={...cfg,prodModel:'',procstep:1,orderId:'',workShift:'ALL'};
  const filters={summary:base,classification:base,grouped:linePeriod,detail:linePeriod};
  const saved=entries.map(([,s])=>[s,{...(proxyOf(s).extraParams||{})},s.currentPage||1]);
  const setParams=(s,p)=>{
    const proxy=proxyOf(s);
    if(proxy.setExtraParams)proxy.setExtraParams({...p});else proxy.extraParams={...p};
  };

  function readPage(s,page,params,label){
    setParams(s,params);
    return new Promise((resolve,reject)=>{
      const fail=reason=>reject(Error('3028: '+label+' página '+page+' · '+reason));
      const timeout=setTimeout(()=>fail('tempo esgotado'),20000);
      try{
        s.loadPage(page,{callback(rows,op,success){
          clearTimeout(timeout);
          try{
            if(!success || !Array.isArray(rows))return fail('resposta indisponível');
            const actualPage=Number(op?.getPage?.() ?? op?.page ?? s.currentPage);
            if(actualPage!==page || Number(s.currentPage)!==page)return fail('página divergente');
            const request=op?.getRequest?.() || op?.request;
            const requestParams=request?.getParams?.() || request?.params;
            const operationParams=op?.getParams?.() || op?.params;
            // A later store mutation cannot serve as evidence for this response.
            // Check the actual request when Ext exposes it and reject contradictions
            // in the operation as well. Older Ext exposes only its paging args.
            const proxy=proxyOf(s);
            const applied=proxy.extraParams||{};
            const pageKey=proxy.pageParam ?? 'page';
            if(pageKey && [requestParams,operationParams].some(p=>p&&Object.hasOwn(p,pageKey)&&Number(p[pageKey])!==page))
              return fail('página divergente na requisição');
            const same=(key,a,b)=>/TimeZone$/.test(key)&&a!==''&&a!=null?Number(a)===Number(b):String(a)===String(b);
            if(Object.entries(params).some(([k,v])=>!same(k,applied[k],v)||
              [requestParams,operationParams].some(p=>p&&Object.hasOwn(p,k)&&!same(k,p[k],v))))
              return fail('escopo da consulta divergiu');
            const result=op?.getResultSet?.() || op?.resultSet;
            const reported=result?.getTotal?.() ?? result?.total;
            const total=s.getTotalCount?.();
            if(!Number.isSafeInteger(total)||total<0||(reported!=null&&Number(reported)!==total))
              return fail('total da resposta não confirmado');
            const records=rows.map(row=>JSON.parse(JSON.stringify(row.getData?.() || row.data)));
            const scopeProof=Object.keys(params).every(k=>requestParams&&Object.hasOwn(requestParams,k))?'request':
              Object.keys(params).every(k=>operationParams&&Object.hasOwn(operationParams,k))?'operation':'proxy';
            resolve({records,total,scopeProof});
          }catch(e){fail('resposta inválida');}
        }});
      }catch(e){clearTimeout(timeout);fail('falha no carregamento');}
    });
  }

  async function forward(name){
    const s=stores[name],params=filters[name];
    const first=await readPage(s,1,params,name);
    const configuredSize=s.getPageSize?.() || s.pageSize;
    // Some non-paginated grids return the whole population even when Ext
    // assigns a nominal pageSize. Completeness comes from the response total.
    const size=first.records.length===first.total
      ? Math.max(first.total,configuredSize||1) : configuredSize;
    if(!Number.isSafeInteger(size)||size<1)
      throw Error('3028: '+name+' sem tamanho de página');
    const pages=Math.max(1,Math.ceil(first.total/size));
    const batches=[];
    function append(batch,page){
      const count=Math.min(size,Math.max(0,first.total-(page-1)*size));
      if(batch.total!==first.total || batch.records.length!==count)
        throw Error('3028: '+name+' total ou página incompleta');
      batches.push(batch);
    }
    append(first,1);
    for(let page=2;page<=pages;page++)append(await readPage(s,page,params,name),page);
    return {total:first.total,pageSize:size,batches};
  }
  function lineColumns(c){
    const columns=c.getColumnManager?.()?.getColumns?.() || c.columns || [];
    const result={};
    for(const [field,labels,keys] of [['line',['lineid'],['lineId','lineIdNew']],
          ['model',['prodmodel','productmodel'],['prodModel','productModel']]]){
      const candidates=new Set(Array.from(columns).filter(col=>!col.hidden&&labels.includes(
        String(col.text||'').replace(/<[^>]*>/g,'').toLowerCase().replace(/[^a-z]/g,'')))
        .map(col=>col.dataIndex).filter(k=>keys.includes(k)));
      if(candidates.size===1)result[field]=[...candidates][0];
    }
    return result;
  }

  // Verify whole-grid generations. Each pass is a new read, including
  // single-page grids, and the second pass reverses both store and page order.
  try{
    const first={},recheck={};
    for(const [name] of entries)first[name]=await forward(name);
    for(const [name,s] of [...entries].reverse()){
      const batches=first[name].batches;
      recheck[name]=new Array(batches.length);
      for(let page=batches.length;page>=1;page--)
        recheck[name][page-1]=await readPage(s,page,filters[name],name);
    }
    return {lineId:cfg.lineId,baseParams:base,filters,
      scope_columns:Object.fromEntries(Object.entries(components).map(([name,c])=>[name,lineColumns(c)])),
      first,recheck};
  } finally {
    // Restore the original store filters and page. Collection never clicks a
    // production summary row or uses its selection to populate another store.
    for(const [s,params,page] of saved){
      if(!s.isLoading?.()){
        try{await readPage(s,page,params,'restauração');}catch(e){setParams(s,params);}
      }else setParams(s,params);
    }
  }
}
"""


def _row_multiset(rows):
    return Counter(json.dumps(row, sort_keys=True, separators=(",", ":")) for row in rows)


def _verified_grid(name, result, recheck):
    total, size, batches = result["total"], result["pageSize"], result["batches"]
    if len(batches) != max(1, (total + size - 1) // size) or len(batches) != len(recheck):
        raise ValueError(f"{name}: número de páginas não confirmado")
    records, receipts = [], []
    seen = set()
    for page, (first, second) in enumerate(zip(batches, recheck), 1):
        count = min(size, max(0, total - (page - 1) * size))
        if any(batch["total"] != total or len(batch["records"]) != count for batch in (first, second)):
            raise ValueError(f"{name}: total ou página {page} incompletos")
        identity = _row_multiset(first["records"])
        if identity != _row_multiset(second["records"]):
            raise ValueError(f"{name}: conteúdo divergente na releitura da página {page}")
        signature = frozenset(identity.items())
        if signature in seen:
            raise ValueError(f"{name}: paginação repetida sem identidade independente")
        seen.add(signature)
        records.extend(first["records"])
        receipts.append({"page":page, "count":count, "success":True,
                         "scope_proof":[first["scopeProof"], second["scopeProof"]]})
    return {"records":records, "total":total, "pages":len(batches), "pageSize":size, "pageResults":receipts}


def _field(row, preferred, keys):
    for key in dict.fromkeys((preferred, *keys)):
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _grouped_codes(rows):
    codes = Counter()
    for row in rows:
        try:
            qty = int(str(row["qty"]))
            if qty < 0:
                raise ValueError
        except (KeyError, ValueError) as exc:
            raise ValueError("agrupamento: quantidade nativa inválida") from exc
        codes[str(row.get("defectCode") or "").strip()] += qty
    return codes


def _checked_capture(capture, line, requested):
    if capture["lineId"] != line:
        raise ValueError("grade devolvida para outra linha")
    grids = {}
    for name in ("summary","classification","grouped","detail"):
        if name not in capture["first"] or name not in capture["recheck"] or name not in capture["filters"]:
            raise ValueError(f"{name}: resposta ausente")
        result = capture["first"][name]
        filters = capture["filters"][name]
        if any(filters.get(k) != v for k, v in requested.items()) or (
                name in ("grouped", "detail") and filters.get("prodModel") != ""):
            raise ValueError(f"{name}: escopo integral da linha e período não confirmado")
        grid = _verified_grid(name, result, capture["recheck"][name])
        columns = capture["scope_columns"].get(name, {})
        for i, row in enumerate(grid["records"], 1):
            found = _field(row, columns.get("line"), ("lineIdNew","lineId"))
            if (found and found.casefold() != line.casefold()) or (name == "detail" and not found):
                raise ValueError(f"{name}: linha da ocorrência {i} não corresponde à consulta")
            if name == "detail" and not str(row.get("lotId") or "").strip():
                raise ValueError(f"detalhe: ocorrência {i} sem identificador de PCBA")
        grids[name] = grid
    return dict(lineId=line, baseParams=capture["baseParams"], filters=capture["filters"],
                scope_columns=capture["scope_columns"], **grids)


def collect_3028_period(*, cdp_url, ames_host, lines, start_at, end_at):
    from datetime import datetime
    from playwright.sync_api import Error as BrowserError, sync_playwright
    import ames_3028_live as source

    window = source._ames_window(start_at, end_at)
    scope = {k:window[k] for k in ("dateFrom","dateTo","startTimeZone","endTimeZone")}
    metrics, records, captures, validations = [], [], [], []
    with source.MES_LOCK, sync_playwright() as pw:
        page = _work_page(pw.chromium.connect_over_cdp(cdp_url), ames_host)
        page.wait_for_function(_READY, timeout=20000)
        if not lines:
            current = page.evaluate(_CURRENT_LINE)
            if not current:
                raise RuntimeError("Nenhuma linha configurada. Use 'Configurar posto' e informe as linhas A-MES.")
            lines = [current]
        for line in lines:
            page.wait_for_function(_READY, timeout=20000)
            requested = {**scope, "lineId":line}
            try:
                captured = _checked_capture(page.evaluate(QUERY_LINE_JS, requested), line, requested)
                line_metrics = [source._summary_to_metric(r, line) for r in captured["summary"]["records"]]
                columns = captured["scope_columns"]["detail"]
                details = [source._detail_to_record(r, line) for r in captured["detail"]["records"]]
                for metric in line_metrics:
                    metric["line"] = line
                for record in details:
                    record["line"] = line
                    record["product_model"] = _field(record["raw"], columns.get("model"), ("productModel","prodModel"))
                by_code = _grouped_codes(captured["grouped"]["records"])
                group_count = sum(by_code.values())
                units = (sum(m["total_defect_qty"] for m in line_metrics)
                         if line_metrics and all(m["total_defect_qty"] is not None for m in line_metrics) else None)
                # A blank-filter response with no occurrences despite defects
                # reported for that window cannot establish absence.
                if not details and (group_count > 0 or units is not None and units > 0):
                    raise ValueError("detalhe vazio com falhas registradas em outra grade")
            except BrowserError as exc:
                if "3028: " not in str(exc):
                    raise
                reason = str(exc).split("3028: ", 1)[1].splitlines()[0]
                raise ValueError(f"3028 {line}: {reason}") from exc
            except ValueError as exc:
                raise ValueError(f"3028 {line}: {exc}") from exc

            metrics.extend(line_metrics)
            records.extend(details)
            captures.append(captured)
            validations.append(dict(line=line, native_grouped_total=group_count, grouped_total=group_count,
                native_detail_occurrences=len(details), detail_occurrences=len(details), summary_defective_units=units,
                unique_pcbas=len({r["pcba_sn"] for r in details}),
                extra_defect_occurrences=len(details)-units if units is not None and units <= len(details) else None,
                grouped_matches_detail=group_count == len(details),
                grouped_matches_by_code=by_code == Counter(r["defect_code"] for r in details),
                verification_method="line_period_native_grids", ok=True,
                models=[m["product_model"] for m in line_metrics],
                detail_models=sorted({r["product_model"] for r in details if r["product_model"]}),
                verified_windows=1))
    return dict(source="AWIP3028_DIRECT_EXTJS", captured_at=datetime.now().isoformat(timespec="seconds"),
                requested_lines=lines, lines=lines, window=window, line_metrics=metrics, records=records,
                records_count=len(records), captures=captures, validations=validations)
