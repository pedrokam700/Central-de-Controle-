from __future__ import annotations

import json
import math
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Tuple

MES_LOCK = threading.Lock()


QUERY_LINE_JS = r"""
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
  const byItemId=(id)=>comps.find(c=>c&&c.itemId===id)||null;
  const dataOf=(r)=>{try{return JSON.parse(JSON.stringify(r.getData?r.getData():r.data||{}))}catch(e){return {}}};

  function getStore(itemId){
    const cmp=byItemId(itemId);
    if(!cmp) throw new Error('Componente nao encontrado: '+itemId);
    const store=cmp.getStore?cmp.getStore():cmp.store;
    if(!store) throw new Error('Store nao encontrado: '+itemId);
    return store;
  }

  const stores={
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
            resolve({success:!!success,timeout:false,records:(records||[]).map(dataOf),error:null});
          }
        });
      }catch(e){
        if(!done){done=true;clearTimeout(timer);resolve({success:false,timeout:false,records:[],error:String(e)});}
      }
    });
  }

  async function loadAll(store,params){
    const first=await loadPage(store,1,params);
    if(!first.success) throw new Error('Falha pagina 1: '+(first.error||'sem detalhe'));
    const total=store.getTotalCount?store.getTotalCount():first.records.length;
    const pageSize=store.pageSize||first.records.length||100;
    const pages=first.records.length>=total?1:Math.max(1,Math.ceil(total/pageSize));
    const records=[...first.records];
    const pageResults=[{page:1,success:true,count:first.records.length}];
    for(let p=2;p<=pages;p++){
      const r=await loadPage(store,p,params);
      pageResults.push({page:p,success:r.success,count:r.records.length,timeout:r.timeout,error:r.error||null});
      if(!r.success) throw new Error('Falha pagina '+p+': '+(r.error||'sem detalhe'));
      records.push(...r.records);
    }
    return {records,total,pageSize,pages,pageResults};
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



SYNC_VISIBLE_JS = r"""
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
  const byItemId=(id)=>comps.find(c=>c&&c.itemId===id)||null;
  const dataOf=(r)=>{try{return JSON.parse(JSON.stringify(r.getData?r.getData():r.data||{}))}catch(e){return {}}};

  function setText(id,value){
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
  function getStore(itemId){
    const cmp=byItemId(itemId); if(!cmp) throw new Error('Componente nao encontrado: '+itemId);
    const store=cmp.getStore?cmp.getStore():cmp.store;
    if(!store) throw new Error('Store nao encontrado: '+itemId);
    return store;
  }
  function applyParams(store,params){
    const proxy=store.getProxy?store.getProxy():store.proxy;
    if(proxy.setExtraParams) proxy.setExtraParams({...params}); else proxy.extraParams={...params};
  }
  async function loadPage(store,pageNo,params){
    applyParams(store,params);
    return await new Promise(resolve=>{
      let done=false;
      const timer=setTimeout(()=>{if(!done){done=true;resolve({success:false,records:[]});}},20000);
      try{store.loadPage(pageNo,{callback:(records,op,success)=>{if(done)return;done=true;clearTimeout(timer);resolve({success:!!success,records:(records||[]).map(dataOf)});}})}
      catch(e){if(!done){done=true;clearTimeout(timer);resolve({success:false,records:[],error:String(e)});}}
    });
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

def _parse_dt(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    s = str(value or "").strip()
    if not s:
        raise ValueError("data/hora vazia")
    return datetime.fromisoformat(s)


def _ames_window(start_at: str | datetime, end_at: str | datetime) -> Dict[str, str]:
    start = _parse_dt(start_at)
    end = _parse_dt(end_at)
    if end <= start:
        raise ValueError("fim precisa ser depois do inicio")
    # A 3028 trabalha por hora inteira. Para uma atualizacao 'agora', arredonda o fim
    # para a proxima hora para nao perder a hora parcial em andamento.
    query_end = end
    if end.minute or end.second or end.microsecond:
        query_end = end.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    return {
        "dateFrom": start.strftime("%Y%m%d"),
        "startTimeZone": start.strftime("%H"),
        "dateTo": query_end.strftime("%Y%m%d"),
        "endTimeZone": query_end.strftime("%H"),
        "requested_start_at": start.isoformat(timespec="minutes"),
        "requested_end_at": end.isoformat(timespec="minutes"),
        "ames_end_at": query_end.isoformat(timespec="minutes"),
    }


def _to_int(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _clean(v: Any) -> str:
    return "" if v is None else str(v).strip()


def _summary_to_metric(row: Dict[str, Any], fallback_line: str) -> Dict[str, Any]:
    return {
        "line": _clean(row.get("lineIdNew") or row.get("lineId") or fallback_line),
        "product_model": _clean(row.get("prodModel") or row.get("productModel")),
        "quantity": _to_int(row.get("qty")),
        "function_defect_qty": _to_int(row.get("functionDefectQty")),
        "appearance_defect_qty": _to_int(row.get("appearanceDefectQty")),
        "process_defect_qty": _to_int(row.get("processDefectQty")),
        "total_defect_qty": _to_int(row.get("totalDefectQty")),
        "auto_input_defect_qty": _to_int(row.get("autoDefectQty")),
        "function_fpy": row.get("functionFpy"),
        "appearance_fpy": row.get("appearanceFpy"),
        "process_fpy": row.get("processFpy"),
        "fpy": row.get("fpy"),
        "check_fpy": row.get("checkFpy"),
        "raw": row,
    }


def _detail_to_record(row: Dict[str, Any], fallback_line: str) -> Dict[str, Any]:
    return {
        "line": _clean(row.get("lineIdNew") or row.get("lineId") or fallback_line),
        "defect_oper": _clean(row.get("defectOper")),
        "defect_oper_desc": _clean(row.get("defectOperDesc")),
        "defect_code": _clean(row.get("defectCode")),
        "defect_desc": _clean(row.get("defectDesc")),
        "defect_return_category": _clean(row.get("defectReturnCategory")),
        "defect_detail_category": _clean(row.get("defectDetailGategory") or row.get("defectDetailCategory")),
        "reason_code": _clean(row.get("reasonCode")),
        "reason_desc": _clean(row.get("reasonDesc")),
        "defect_reason_type": _clean(row.get("defectReasonType")),
        "defect_reason_desc": _clean(row.get("defectReasonTypeDesc")),
        "repair_code": _clean(row.get("repairCode")),
        "repair_desc": _clean(row.get("repairDesc")),
        "repair_user": _clean(row.get("repairUser")),
        "defect_material": _clean(row.get("defectMaterialId")),
        "defect_material_desc": _clean(row.get("defectMaterialDesc")),
        "repair_comment": _clean(row.get("repairComment")),
        "defect_category": _clean(row.get("defectCategory")),
        "defect_source": _clean(row.get("defectSource")),
        "product_model": _clean(row.get("productModel") or row.get("prodModel")),
        "color": _clean(row.get("color")),
        "pcba_sn": _clean(row.get("lotId")),
        "imei": _clean(row.get("lotCmf2")),
        "defect_time": row.get("defectTime"),
        "time_zone": _clean(row.get("timeZone")),
        "work_shift": _clean(row.get("workShift")),
        "order_id": _clean(row.get("orderId")),
        "user_id": _clean(row.get("lotUserId")),
        "manual_or_auto": _clean(row.get("lotFlag")),
        "repair_time": row.get("repairTime"),
        "defect_receive_time": row.get("defectReceiveTime"),
        "raw": row,
    }


def transform_probe_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a V0.5.13 probe payload; useful for regression tests."""
    summary = payload.get("summary") or {}
    detail = payload.get("detail") or {}
    line = _clean((summary.get("records") or [{}])[0].get("lineIdNew") if summary.get("records") else "")
    metrics = [_summary_to_metric(r, line) for r in (summary.get("records") or [])]
    records = [_detail_to_record(r, line) for r in (detail.get("records") or [])]
    return {"line_metrics": metrics, "records": records, "lines": sorted({r["line"] for r in records if r.get("line")})}


def _select_3028_page(browser, ames_host: str):
    pages = [p for ctx in browser.contexts for p in ctx.pages]
    if not pages:
        raise RuntimeError("Chrome dedicado sem paginas abertas")

    def score(p):
        u = (p.url or "").lower()
        s = 0
        if "vwfpyinquireview" in u:
            s += 100
        if "3028" in u:
            s += 50
        if str(ames_host).lower() in u:
            s += 20
        return s

    page = max(pages, key=score)
    if score(page) >= 100:
        return page

    ames_pages = [p for p in pages if str(ames_host) in (p.url or "")]
    if not ames_pages:
        raise RuntimeError("Nenhuma sessao A-MES aberta no Chrome dedicado. Abra o A-MES e faca login.")

    page = ames_pages[0]
    base = (page.url or "").split("#", 1)[0]
    if "/asymes" not in base:
        raise RuntimeError("Sessao A-MES nao identificada. Abra o Smart Factory/A-MES no Chrome dedicado.")
    target = base + "#UAWIP.form.VwFpyInquireView"
    page.goto(target, wait_until="domcontentloaded", timeout=20000)
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            ready = page.evaluate("""
              () => !!(window.Ext && Ext.ComponentQuery && Ext.ComponentQuery.query('*').some(c => c && c.itemId === 'grdListByConds'))
            """)
            if ready:
                return page
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError("A tela 3028 nao carregou automaticamente. Confirme login/permissao no A-MES.")


def collect_live_3028(*, cdp_url: str, ames_host: str, lines: Iterable[str], start_at: str, end_at: str) -> Dict[str, Any]:
    requested_lines = [str(x).strip() for x in lines if str(x).strip()]
    window = _ames_window(start_at, end_at)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError("Playwright nao instalado no agente local") from exc

    with MES_LOCK:
        with sync_playwright() as pw:
            browser = pw.chromium.connect_over_cdp(cdp_url)
            page = _select_3028_page(browser, ames_host)

            if not requested_lines:
                try:
                    current = page.evaluate("""
                      () => {
                        const all=Ext.ComponentQuery.query('*');
                        const g=all.find(c=>c&&c.itemId==='grdListByConds');
                        const s=g&&(g.getStore?g.getStore():g.store);
                        const r=s&&s.getRange?s.getRange():[];
                        const d=r.length?(r[0].getData?r[0].getData():r[0].data):{};
                        return String((d&&d.lineIdNew)||(d&&d.lineId)||'').trim();
                      }
                    """)
                except Exception:
                    current = ""
                if current:
                    requested_lines = [current]
                else:
                    raise RuntimeError("Nenhuma linha configurada. Use 'Configurar posto' e informe as linhas A-MES.")

            captures: List[Dict[str, Any]] = []
            metrics: List[Dict[str, Any]] = []
            records: List[Dict[str, Any]] = []
            validations: List[Dict[str, Any]] = []

            for line in requested_lines:
                cfg = {"lineId": line, **{k: window[k] for k in ("dateFrom", "startTimeZone", "dateTo", "endTimeZone")}}
                cap = page.evaluate(QUERY_LINE_JS, cfg)
                captures.append(cap)

                line_metrics = [_summary_to_metric(r, line) for r in ((cap.get("summary") or {}).get("records") or [])]
                line_records = [_detail_to_record(r, line) for r in ((cap.get("detail") or {}).get("records") or [])]
                # A 3028 usa metricas com semanticas diferentes:
                # - totalDefectQty no resumo = quantidade de unidades defeituosas do resumo;
                # - grid detalhado = ocorrencias/linhas de defeito, podendo existir mais de
                #   uma ocorrencia para a mesma PCBA;
                # - grdSum = agrupamento das ocorrencias detalhadas por codigo/comentario.
                # Por isso resumo e detalhe NAO precisam ser iguais. O gate forte e:
                # agrupado == detalhe. Tambem rejeitamos detalhe menor que o resumo, pois
                # isso indicaria perda de ocorrencias/paginacao.
                summary_units = sum(int(m.get("total_defect_qty") or 0) for m in line_metrics)
                grouped_total = sum(int(r.get("qty") or 0) for r in ((cap.get("grouped") or {}).get("records") or []))
                collected = len(line_records)
                unique_pcbas = len({str(r.get("pcba_sn") or "").strip() for r in line_records if str(r.get("pcba_sn") or "").strip()})

                if summary_units and collected < summary_units:
                    raise RuntimeError(
                        f"3028 {line}: resumo={summary_units}, detalhe={collected}. "
                        "Detalhe menor que o resumo; coleta rejeitada para evitar perda de dados."
                    )
                if grouped_total and grouped_total != collected:
                    raise RuntimeError(f"3028 {line}: agrupado={grouped_total}, detalhe={collected}. Coleta rejeitada.")

                metrics.extend(line_metrics)
                records.extend(line_records)
                validations.append({
                    "line": line,
                    "summary_defective_units": summary_units,
                    "detail_occurrences": collected,
                    "unique_pcbas": unique_pcbas,
                    "extra_defect_occurrences": max(0, collected - summary_units),
                    "grouped_total": grouped_total,
                    "grouped_matches_detail": (not grouped_total or grouped_total == collected),
                    "ok": collected >= summary_units and (not grouped_total or grouped_total == collected),
                    "models": [m.get("product_model") for m in line_metrics],
                })

            visible_state = None
            if requested_lines:
                last_line = requested_lines[-1]
                visible_cfg = {"lineId": last_line, **{k: window[k] for k in ("dateFrom", "startTimeZone", "dateTo", "endTimeZone")}}
                try:
                    visible_state = page.evaluate(SYNC_VISIBLE_JS, visible_cfg)
                except Exception as exc:
                    visible_state = {"warning": f"UI_SYNC_FAILED: {exc}", **visible_cfg}

            return {
                "source": "AWIP3028_DIRECT_EXTJS",
                "captured_at": datetime.now().isoformat(timespec="seconds"),
                "requested_lines": requested_lines,
                "window": window,
                "line_metrics": metrics,
                "records": records,
                "records_count": len(records),
                "lines": sorted({r.get("line") for r in records if r.get("line")} | {m.get("line") for m in metrics if m.get("line")}),
                "validations": validations,
                "visible_state": visible_state,
                "captures": captures,
            }
