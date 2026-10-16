from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List
from urllib.parse import urlsplit, urlunsplit

ROUTE_3012 = "UAWIP.form.VwDefectRepairView"
HOME_SURFACE = "/asymes/home"
OPC_SURFACE = "/asymes/opc"
QUERY_CONTRACT = "3012-home-mapped-v2"
SOURCE_3012 = "AWIP3012_HOME_DIRECT_EXTJS_MAPPED_V2"
CHECKPOINT_CONTRACT = QUERY_CONTRACT

QUERY_3012_JS = r"""
async (cfg) => {
  if (!window.Ext) throw new Error('ExtJS nao encontrado na 3012.');
  const CONTRACT='3012-home-mapped-v2';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const clean=v=>String(v??'').trim();
  const fold=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const dataOf=r=>{try{return JSON.parse(JSON.stringify(r?.getData?r.getData():r?.data||{}));}catch(e){return {};}};
  const liveComponents=()=>{
    const out=[];
    try {
      const all=Ext.ComponentManager&&Ext.ComponentManager.all;
      if(all?.items) out.push(...all.items);
      else if(all?.getArray) out.push(...all.getArray());
      else if(all?.each) all.each(x=>out.push(x));
    } catch(e) {}
    if(!out.length&&Ext.ComponentQuery?.query){try{out.push(...Ext.ComponentQuery.query('*'));}catch(e){}}
    return out;
  };
  const visible=c=>c&&!c.hidden&&(typeof c.isVisible!=='function'||c.isVisible(true));
  const byItemId=(itemId,{visibleOnly=false}={})=>{
    const matches=liveComponents().filter(c=>String(c?.itemId||'')===itemId&&(!visibleOnly||visible(c)));
    if(matches.length!==1) throw new Error(`3012_MAP_MISMATCH:${itemId}:${matches.length}`);
    return matches[0];
  };
  const optionalByItemId=itemId=>liveComponents().find(c=>String(c?.itemId||'')===itemId)||null;
  const meta=(c,value)=>({itemId:c?.itemId||null,name:c?.name||null,xtype:c?.xtype||c?.getXType?.()||null,value,raw:clean(c?.getRawValue?.())});
  const itemMeta=c=>c?{itemId:c.itemId||null,name:c.name||null,xtype:c.xtype||c.getXType?.()||null,raw:clean(c.getRawValue?.()??c.getValue?.())}:null;
  const emit=(c,name,...args)=>{try{c?.fireEvent?.(name,c,...args);}catch(e){}};
  const setMappedField=(itemId,value)=>{
    const c=byItemId(itemId,{visibleOnly:true});
    const actual=value??'';
    const old=c.getValue?.();
    try { c.focus?.(); } catch(e) {}
    if(typeof c.setValue!=='function') throw new Error(`3012_MAP_MISMATCH:${itemId}:no-setValue`);
    c.setValue(actual);
    emit(c,'change',actual,old); c.checkChange?.(); emit(c,'blur');
    if(actual!==''&&c.isValid?.()===false) throw new Error(`3012_FILTER_INVALID:${itemId}`);
    return meta(c,actual);
  };
  const parseDate=(dateValue,timeValue='00:00')=>{
    const d=String(dateValue).slice(0,10).split('-').map(Number);
    const t=String(timeValue||'00:00').split(':').map(Number);
    if(d.length!==3||!d[0]||!d[1]||!d[2]) throw new Error('3012_DATE_INVALID:'+dateValue);
    return new Date(d[0],d[1]-1,d[2],t[0]||0,t[1]||0,0,0);
  };
  const dateMatches=(c,value)=>{
    const want=parseDate(value); let got=c?.getValue?.();
    if(!(got instanceof Date)){try{got=c?.parseDate?.(c?.getRawValue?.());}catch(e){}}
    return got instanceof Date&&got.getFullYear()===want.getFullYear()&&got.getMonth()===want.getMonth()&&got.getDate()===want.getDate();
  };
  const timeMatches=(c,value)=>{
    const [hh,mm]=String(value||'00:00').split(':').map(Number);
    const raw=clean(c?.getRawValue?.()); const m=raw.match(/(\d{1,2}):(\d{2})/);
    if(m) return Number(m[1])===(hh||0)&&Number(m[2])===(mm||0);
    const got=c?.getValue?.();
    return got instanceof Date&&got.getHours()===(hh||0)&&got.getMinutes()===(mm||0);
  };
  const applyDateTime=(root,dateValue,timeValue)=>{
    const parent=byItemId(root,{visibleOnly:true});
    const date=byItemId(root+'__Date',{visibleOnly:true});
    const time=byItemId(root+'__Time',{visibleOnly:true});
    const data=optionalByItemId(root+'__Data');
    const full=parseDate(dateValue,timeValue);
    const dateOnly=parseDate(dateValue,'00:00');
    const parentOld=parent.getValue?.();
    if(typeof parent.setValue==='function'){
      parent.setValue(full); emit(parent,'change',full,parentOld); parent.checkChange?.();
    }
    const dateOld=date.getValue?.(); date.setValue(dateOnly); emit(date,'select',dateOnly); emit(date,'change',dateOnly,dateOld); date.checkChange?.(); emit(date,'blur');
    const timeOld=time.getValue?.(); time.setValue(timeValue);
    if(!timeMatches(time,timeValue)&&typeof time.setRawValue==='function') time.setRawValue(timeValue);
    try {
      const input=time?.inputEl?.dom;
      if(input){input.value=String(timeValue);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    } catch(e) {}
    emit(time,'change',time.getValue?.(),timeOld); time.checkChange?.(); emit(time,'blur');
    if(typeof parent.setValue==='function'){
      const old=parent.getValue?.(); parent.setValue(full); emit(parent,'change',full,old); parent.checkChange?.(); emit(parent,'blur');
    }
    if(!dateMatches(date,dateValue)) throw new Error(`3012_DATE_NOT_APPLIED:${root}`);
    if(!timeMatches(time,timeValue)) throw new Error(`3012_TIME_NOT_APPLIED:${root}`);
    const hiddenRaw=clean(data?.getValue?.()??data?.getRawValue?.());
    const parentRaw=clean(parent?.getRawValue?.()??parent?.getValue?.());
    if(/(^|\D)2008(\D|$)/.test(hiddenRaw)||/(^|\D)2008(\D|$)/.test(parentRaw)) throw new Error(`3012_EPOCH_2008:${root}`);
    return {parent:meta(parent,full.toISOString()),date:meta(date,dateValue),time:meta(time,timeValue),data:itemMeta(data),hiddenRaw,parentRaw};
  };

  const applied={};
  applied.sn=setMappedField('txtSnImei',cfg.sn);
  applied.defectType=setMappedField('cdvDefectType',cfg.defectType);
  applied.repairCode=setMappedField('cdvRepairedCode',cfg.repairCode);
  applied.department=setMappedField('cdvDepartmentNew','');
  applied.area=setMappedField('cdvAreaNew','');
  applied.line=setMappedField('cdvLineCodeNew',cfg.line);
  applied.model=setMappedField('cdvProdModel',cfg.model);
  applied.defectCode=setMappedField('cdvDefectCode',cfg.defectCode);
  applied.dateFrom=applyDateTime('dteFromDate',cfg.dateFrom,cfg.timeFrom);
  applied.dateTo=applyDateTime('dteToDate',cfg.dateTo,cfg.timeTo);

  const storeFields=store=>{
    const out=[];
    try {const model=store?.getModel?.()||store?.model;for(const f of model?.getFields?.()||model?.fields?.items||[])out.push(String(f?.name||f?.getName?.()||''));}catch(e){}
    try {const first=store?.getAt?.(0);if(first)out.push(...Object.keys(dataOf(first)));}catch(e){}
    return [...new Set(out.filter(Boolean))];
  };
  const validRepairStore=store=>{
    const fields=storeFields(store).map(v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,''));const names=new Set(fields);
    return names.has('repaircomment')&&names.has('repairuser')&&names.has('repairtime')&&names.has('defectcode');
  };
  const resolveMain=()=>{
    const grid=byItemId('grdDefectRepair',{visibleOnly:true});
    const store=grid?.getStore?.()||grid?.store;
    if(!store||!validRepairStore(store)) throw new Error('3012_GRID_CONTRACT_MISMATCH:grdDefectRepair');
    return {grid,store};
  };
  const viewButton=byItemId('btnView',{visibleOnly:true});
  const initial=resolveMain();
  let initialStore=initial.store;
  const tokenRoot=globalThis.__central3012StoreTokens||(globalThis.__central3012StoreTokens={next:1});
  const storeToken=store=>{
    if(!store) return null;
    if(!store.__central3012StoreToken){
      const value='3012-store-'+(tokenRoot.next++);
      try{Object.defineProperty(store,'__central3012StoreToken',{value,configurable:true});}catch(e){store.__central3012StoreToken=value;}
    }
    return String(store.__central3012StoreToken||'');
  };
  const initialToken=storeToken(initialStore);
  const snapshotParams=store=>{try{return JSON.parse(JSON.stringify((store?.getProxy?.()||store?.proxy)?.extraParams||{}));}catch(e){return {};}};
  const beforeParams=snapshotParams(initialStore);
  const beforeParamsText=JSON.stringify(beforeParams);
  const observed=new Map();
  const observe=store=>{
    if(observed.has(store)) return observed.get(store);
    const state={store,token:storeToken(store),before:0,loads:0,changes:0,success:null,requestParams:null};
    state.beforeFn=(_store,operation)=>{state.before+=1;try{state.requestParams=JSON.parse(JSON.stringify(operation?.getParams?.()||operation?.params||snapshotParams(store)));}catch(e){state.requestParams=snapshotParams(store);}};
    state.loadFn=(_store,_records,success)=>{state.loads+=1;state.success=success!==false;};
    state.changeFn=()=>{state.changes+=1;};
    try{store.on?.('beforeload',state.beforeFn);}catch(e){}
    try{store.on?.('load',state.loadFn);}catch(e){}
    try{store.on?.('datachanged',state.changeFn);}catch(e){}
    observed.set(store,state);return state;
  };
  const cleanup=()=>{for(const st of observed.values()){try{st.store.un?.('beforeload',st.beforeFn);}catch(e){}try{st.store.un?.('load',st.loadFn);}catch(e){}try{st.store.un?.('datachanged',st.changeFn);}catch(e){}}};
  observe(initialStore); initialStore.currentPage=1;
  const physicalElement=()=>{
    for(const root of [viewButton?.btnEl?.dom,viewButton?.el?.dom]){
      if(!root) continue;
      if(typeof root.click==='function'&&/^(A|BUTTON|INPUT)$/i.test(String(root.tagName||''))) return root;
      try{const nested=root.querySelector?.('a,button,input[type="button"],input[type="submit"]');if(nested)return nested;}catch(e){}
    }
    return null;
  };
  const trigger=mode=>{
    if(mode==='physical_dom_click'){
      const el=physicalElement(); if(!el) throw new Error('no physical element');
      try{el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));}catch(e){}
      try{el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));}catch(e){}
      el.click();return;
    }
    if(mode==='ext_click_event'){
      if(typeof viewButton.fireEvent!=='function') throw new Error('no Ext click event');
      viewButton.fireEvent('click',viewButton);return;
    }
    if(mode==='handler_fallback'){
      if(typeof viewButton.handler!=='function') throw new Error('no handler');
      viewButton.handler.call(viewButton.scope||viewButton,viewButton);return;
    }
  };
  let reboundAt=0;
  const stateNow=()=>{
    const cur=resolveMain();const st=observe(cur.store);const token=storeToken(cur.store);
    const rebound=token!==initialToken;
    if(rebound&&!reboundAt) reboundAt=Date.now();
    const params=snapshotParams(cur.store);
    const paramsChanged=JSON.stringify(params)!==beforeParamsText;
    const started=[...observed.values()].some(x=>x.before||x.loads||x.changes)||rebound||paramsChanged;
    return {cur,st,token,rebound,params,paramsChanged,started,loading:cur.store?.isLoading?.()===true};
  };
  const viewAttempts=[];
  let viewAction=null;
  for(const mode of ['physical_dom_click','ext_click_event','handler_fallback']){
    try{trigger(mode);viewAttempts.push({mode,status:'invoked'});}catch(e){viewAttempts.push({mode,status:'unavailable',error:String(e?.message||e)});continue;}
    const until=Date.now()+700;
    while(Date.now()<until){const s=stateNow();if(s.started){viewAction=mode;break;}await sleep(50);}
    if(viewAction) break;
  }
  if(!viewAction){cleanup();throw new Error('3012_VIEW_NOT_EXECUTED:'+JSON.stringify(viewAttempts));}

  const deadline=Date.now()+30000;let finalState=null;let freshness=null;
  while(Date.now()<deadline){
    const s=stateNow();
    if(s.st.success===false){cleanup();throw new Error('3012_STORE_LOAD_FAILED');}
    if(!s.loading&&s.st.loads>0&&s.st.success!==false){finalState=s;freshness='STORE_LOAD_CONFIRMED';break;}
    if(!s.loading&&s.st.changes>0){finalState=s;freshness='STORE_DATASET_EVENT';break;}
    if(!s.loading&&s.rebound&&reboundAt&&Date.now()-reboundAt>=350){finalState=s;freshness='STORE_REBOUND_AFTER_VIEW';break;}
    await sleep(70);
  }
  if(!finalState){cleanup();throw new Error('3012_RESPONSE_NOT_CONFIRMED: View executou, mas nenhuma resposta nova da grid foi comprovada.');}
  const store=finalState.cur.store;
  const params=snapshotParams(store);
  const finalToken=storeToken(store);
  const proofState=observed.get(store);
  const records=[];
  try{for(const r of store.getRange?.()||[])records.push(dataOf(r));}catch(e){try{store.each?.(r=>records.push(dataOf(r)));}catch(_) {}}
  const total=Number(store.getTotalCount?.()??records.length??0);
  const pageSize=Number(store.pageSize||records.length||100)||100;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  const pageResults=[{page:1,count:records.length}];
  if(pages>10000){cleanup();throw new Error('3012 excedeu limite de paginacao');}
  async function loadPage(pageNo){
    return await new Promise((resolve,reject)=>{
      let done=false;const timer=setTimeout(()=>{if(!done){done=true;reject(new Error('Timeout 3012 pagina '+pageNo));}},30000);
      try{store.loadPage(pageNo,{callback:(rs,op,success)=>{if(done)return;done=true;clearTimeout(timer);if(success===false)reject(new Error('Falha 3012 pagina '+pageNo));else resolve((rs||[]).map(dataOf));}});}catch(e){if(!done){done=true;clearTimeout(timer);reject(e);}}
    });
  }
  for(let p=2;p<=pages;p++){const rs=await loadPage(p);records.push(...rs);pageResults.push({page:p,count:rs.length});}
  if(records.length!==total){cleanup();throw new Error('3012 incompleta: '+records.length+' / '+total);}
  const queryProof={contract:CONTRACT,viewAction,viewAttempts,freshness,initialStoreToken:initialToken,finalStoreToken:finalToken,storeRebound:finalToken!==initialToken,requestParams:proofState?.requestParams||null,proxyParams:params};
  cleanup();
  return {records,total,pageSize,pages,pageResults,applied,proxyParams:params,beforeParams,storeFields:storeFields(store),gridItemId:finalState.cur.grid?.itemId||null,viewAction,queryProof};
}
"""


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _keymap(row: Dict[str, Any]) -> Dict[str, Any]:
    return {re.sub(r"[^a-z0-9]", "", str(k).lower()): v for k, v in (row or {}).items()}


def _pick(row: Dict[str, Any], *names: str):
    km = _keymap(row)
    for name in names:
        key = re.sub(r"[^a-z0-9]", "", name.lower())
        if key in km and km[key] not in (None, ""):
            return km[key]
    return None


def normalize_3012_row(row: Dict[str, Any]) -> Dict[str, Any]:
    out = {
        "pcba_sn": _clean(_pick(row, "lotId", "lot id", "sn", "sn imei", "pcba", "pcba sn")),
        "imei": _clean(_pick(row, "imei", "lotCmf2", "sn imei2")),
        "department": _clean(_pick(row, "department")),
        "line": _clean(_pick(row, "line", "lineId", "line id")),
        "product_id": _clean(_pick(row, "productId", "product id", "prodId")),
        "product_model": _clean(_pick(row, "prodModel", "productModel", "model")),
        "order_id": _clean(_pick(row, "orderId", "order id")),
        "sample_batch_id": _clean(_pick(row, "sampleBatchId", "sample batch id", "batchId", "batch id")),
        "material_id": _clean(_pick(row, "matId", "materialId", "mat id")),
        "material_desc": _clean(_pick(row, "matDesc", "materialDesc", "mat desc")),
        "defect_user": _clean(_pick(row, "defectUser", "defect user")),
        "defect_time": _pick(row, "defectEntryTime", "defectTime", "defect entry time", "defect time"),
        "defect_oper": _clean(_pick(row, "defectOper", "defect oper", "operation", "station")),
        "defect_code": _clean(_pick(row, "defectCode", "defect code")),
        "defect_desc": _clean(_pick(row, "defectDesc", "defectDescription", "defect desc", "defect description")),
        "defect_category": _clean(_pick(row, "defectCategory", "defect category")),
        "defect_return_category": _clean(_pick(row, "defectReturnCategory", "defect return category")),
        "defect_material_id": _clean(_pick(row, "defectMaterialId", "defect material id")),
        "defect_material_desc": _clean(_pick(row, "defectMaterialDesc", "defect material desc")),
        "defect_reason_type": _clean(_pick(row, "defectReasonType", "defect reason type")),
        "defect_reason_desc": _clean(_pick(row, "defectReasonTypeDesc", "defectReasonDesc", "defect reason type desc", "defect reason desc")),
        "reason_desc": _clean(_pick(row, "reasonDesc", "reason desc")),
        "defect_location": _clean(_pick(row, "defectLocation", "defect location")),
        "repaired_location": _clean(_pick(row, "repairedLocation", "repairLocation", "repaired location")),
        "repaired_count": _pick(row, "repairedCount", "repairCount", "repaired count"),
        "repair_code": _clean(_pick(row, "repairCode", "repair code")),
        "repair_desc": _clean(_pick(row, "repairDesc", "repairDescription", "repair desc", "repair description")),
        "repair_comment": _clean(_pick(row, "repairComment", "repair comment")),
        "repair_user": _clean(_pick(row, "repairUser", "repair user")),
        "repair_time": _pick(row, "repairTime", "repair time"),
        "defect_source": _clean(_pick(row, "defectSource", "defect source")),
        "raw": row,
    }
    identity = "|".join(_clean(out.get(k)) for k in sorted(out) if k not in ("raw", "reason_desc"))
    out["row_key"] = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
    return out


def _parse_dt(value: str | datetime | None, fallback: datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    if not value:
        return fallback
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
        return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    except ValueError:
        return datetime.strptime(text[:10], "%Y-%m-%d")


def _chunks(start: datetime, end: datetime, days: int) -> List[tuple[datetime, datetime]]:
    if end < start:
        raise ValueError("Periodo 3012 invalido")
    days = max(1, min(int(days or 31), 365))
    out=[];cursor=start
    while cursor <= end:
        chunk_end=min(end, cursor + timedelta(days=days) - timedelta(seconds=1))
        out.append((cursor,chunk_end));cursor=chunk_end + timedelta(seconds=1)
    return out


def _url_matches_host(url: str, ames_host: str) -> bool:
    text=str(url or "").lower()
    return str(ames_host or "").lower() in text


def _is_home_surface_url(url: str, ames_host: str) -> bool:
    text=str(url or "").lower()
    return _url_matches_host(text,ames_host) and HOME_SURFACE in text and OPC_SURFACE not in text and "/login" not in text


def _is_home_3012_url(url: str, ames_host: str) -> bool:
    return _is_home_surface_url(url,ames_host) and ROUTE_3012.lower() in str(url or "").lower()


def _home_base_from_url(url: str) -> str:
    base=str(url or "").split("#",1)[0]
    parts=urlsplit(base)
    path=parts.path or ""
    low=path.lower()
    if HOME_SURFACE in low:
        return urlunsplit((parts.scheme,parts.netloc,path,parts.query,""))
    if OPC_SURFACE in low:
        idx=low.rfind(OPC_SURFACE)
        path=path[:idx]+HOME_SURFACE+path[idx+len(OPC_SURFACE):]
        return urlunsplit((parts.scheme,parts.netloc,path,parts.query,""))
    if "/asymes" in low:
        idx=low.find("/asymes")+len("/asymes")
        path=path[:idx]+"/home"
        return urlunsplit((parts.scheme,parts.netloc,path,parts.query,""))
    raise RuntimeError("Sessao A-MES nao identificada para abrir a 3012 Home")


def _select_page(browser, ames_host: str):
    pages=[p for ctx in browser.contexts for p in ctx.pages]
    if not pages:
        raise RuntimeError("Chrome dedicado sem paginas abertas")

    host_pages=[p for p in pages if _url_matches_host(getattr(p,"url", ""),ames_host)]
    if not host_pages:
        raise RuntimeError("Nenhuma sessao A-MES aberta no Chrome dedicado")

    # A-MES exposes a look-alike VwDefectRepairView under OPC too. That surface
    # is not the canonical 3012 used by Central. Never accept it merely because
    # the hash/route matches.
    for page in reversed(host_pages):
        if _is_home_3012_url(getattr(page,"url", ""),ames_host):
            return page

    home_pages=[p for p in host_pages if _is_home_surface_url(getattr(p,"url", ""),ames_host)]
    if home_pages:
        page=home_pages[-1]
    else:
        source=host_pages[-1]
        context=getattr(source,"context",None) or (browser.contexts[0] if browser.contexts else None)
        if context is None:
            raise RuntimeError("Contexto do Chrome dedicado nao encontrado para abrir a 3012 Home")
        page=context.new_page()
        page.goto(_home_base_from_url(getattr(source,"url", "")),wait_until="domcontentloaded",timeout=25000)

    base=_home_base_from_url(getattr(page,"url", ""))
    target=base+"#"+ROUTE_3012
    page.goto(target,wait_until="domcontentloaded",timeout=25000)
    deadline=time.time()+25
    while time.time()<deadline:
        if not _is_home_surface_url(getattr(page,"url", ""),ames_host):
            raise RuntimeError("3012 abriu fora da superficie Home; variante OPC foi recusada")
        try:
            ready=page.evaluate("""() => !!(window.Ext && Ext.ComponentQuery && Ext.ComponentQuery.query('*').some(c=>String(c?.text||'').trim()==='View'))""")
            if ready and _is_home_3012_url(getattr(page,"url", ""),ames_host):
                return page
        except Exception:
            pass
        time.sleep(.4)
    raise RuntimeError("Tela 3012 Home nao carregou automaticamente")


def collect_live_3012(*, cdp_url: str, ames_host: str, sns: Iterable[str] | None = None,
                       start_at: str | datetime | None = None, end_at: str | datetime | None = None,
                       line: str = "", model: str = "", defect_code: str = "", repair_code: str = "",
                       defect_type: str = "", chunk_days: int = 31, checkpoint_path: str | Path | None = None) -> Dict[str, Any]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError("Playwright nao instalado no agente local") from exc

    now=datetime.now();start=_parse_dt(start_at,now-timedelta(days=90));end=_parse_dt(end_at,now)
    targets=[str(x).strip() for x in (sns or []) if str(x).strip()] or [""]
    chunks=_chunks(start,end,chunk_days)
    checkpoint_path=Path(checkpoint_path) if checkpoint_path else None
    checkpoint={"contract":CHECKPOINT_CONTRACT,"done":[],"rows":[]}
    if checkpoint_path and checkpoint_path.exists():
        try:
            loaded=json.loads(checkpoint_path.read_text(encoding="utf-8"))
            # Pre-V2 checkpoints may contain false zero-row successes produced by
            # the old fuzzy field/store resolver. Never let them suppress a real
            # mapped V2 MES query.
            if loaded.get("contract")==CHECKPOINT_CONTRACT:
                checkpoint=loaded
        except Exception:
            checkpoint={"contract":CHECKPOINT_CONTRACT,"done":[],"rows":[]}
    done=set(checkpoint.get("done") or []);records=[dict(x) for x in checkpoint.get("rows") or []]
    diagnostics=[]

    with sync_playwright() as pw:
        browser=pw.chromium.connect_over_cdp(cdp_url);page=_select_page(browser,ames_host)
        if not _is_home_3012_url(getattr(page,"url", ""),ames_host):
            raise RuntimeError("3012 canônica não confirmada na superfície Home")
        for sn in targets:
            for chunk_start,chunk_end in chunks:
                chunk_key=f"{sn}|{chunk_start.isoformat()}|{chunk_end.isoformat()}|{line}|{model}|{defect_code}|{repair_code}|{defect_type}"
                if chunk_key in done:continue
                cfg={"sn":sn,"line":line,"model":model,"defectCode":defect_code,"repairCode":repair_code,"defectType":defect_type,
                     "dateFrom":chunk_start.strftime("%Y-%m-%d"),"timeFrom":chunk_start.strftime("%H:%M"),
                     "dateTo":chunk_end.strftime("%Y-%m-%d"),"timeTo":chunk_end.strftime("%H:%M")}
                raw=page.evaluate(QUERY_3012_JS,cfg)
                normalized=[normalize_3012_row(r) for r in (raw.get("records") or [])]
                if sn and any(sn not in (r.get('pcba_sn'),r.get('imei')) for r in normalized):
                    raise RuntimeError('3012 retornou outra SN; filtros/grade nao confirmados')
                records.extend(normalized);done.add(chunk_key)
                proof=dict(raw.get("queryProof") or {})
                if proof.get("contract")!=QUERY_CONTRACT or not proof.get("freshness"):
                    raise RuntimeError("3012 respondeu sem prova do contrato mapeado V2")
                diagnostics.append({"sn":sn,"from":cfg["dateFrom"]+" "+cfg["timeFrom"],"to":cfg["dateTo"]+" "+cfg["timeTo"],"rows":len(normalized),
                                    "total":raw.get("total"),"pages":raw.get("pages"),"fields":raw.get("storeFields"),"applied":raw.get("applied"),"surface":"home",
                                    "view_action":raw.get("viewAction"),"query_proof":proof,"proxy_params":raw.get("proxyParams")})
                if checkpoint_path:
                    checkpoint_path.parent.mkdir(parents=True,exist_ok=True)
                    checkpoint_path.write_text(json.dumps({"contract":CHECKPOINT_CONTRACT,"done":sorted(done),"rows":records,"updated_at":datetime.now().isoformat(timespec="seconds")},ensure_ascii=False,indent=2,default=str),encoding="utf-8")

    unique={}
    for row in records:unique[row["row_key"]]=row
    rows=list(unique.values());rows.sort(key=lambda r:str(r.get("defect_time") or ""),reverse=True)
    return {"source":SOURCE_3012,"contract":QUERY_CONTRACT,"surface":"home","view":ROUTE_3012,"generated_at":datetime.now().isoformat(timespec="seconds"),
            "query":{"sns":targets,"start_at":start.isoformat(timespec="minutes"),"end_at":end.isoformat(timespec="minutes"),"line":line,"model":model,
                     "defect_code":defect_code,"repair_code":repair_code,"defect_type":defect_type,"chunk_days":chunk_days},
            "rows":rows,"records_count":len(rows),"chunks":diagnostics}