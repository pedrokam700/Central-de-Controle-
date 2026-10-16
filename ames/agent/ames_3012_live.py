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

QUERY_3012_JS = r"""
async (cfg) => {
  if (!window.Ext) throw new Error('ExtJS nao encontrado na 3012.');
  const fold = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact = v => fold(v).replace(/[^a-z0-9]+/g,'');
  const dataOf = r => { try { return JSON.parse(JSON.stringify(r?.getData ? r.getData() : r?.data || {})); } catch(e) { return {}; } };
  const components = [];
  try {
    const all = Ext.ComponentManager && Ext.ComponentManager.all;
    if (all?.items) components.push(...all.items);
    else if (all?.getArray) components.push(...all.getArray());
    else if (all?.each) all.each(x => components.push(x));
  } catch(e) {}
  if (!components.length && Ext.ComponentQuery?.query) { try { components.push(...Ext.ComponentQuery.query('*')); } catch(e) {} }

  // factory-redfix-3012 integrated into the canonical collector. Keep this marker
  // while older updater closures still call the compatibility installer: the
  // installer sees the marker and does not monkey-patch this source at runtime.
  const ownLabel = c => fold([c?.fieldLabel,c?.boxLabel,c?.text,c?.title,c?.itemId,c?.name,c?.id].filter(Boolean).join(' '));
  const label = c => {
    const parts=[c?.fieldLabel,c?.boxLabel,c?.text,c?.title,c?.itemId,c?.name,c?.id];
    try { parts.push(c?.inputEl?.dom?.name,c?.inputEl?.dom?.id,c?.inputEl?.dom?.placeholder,c?.inputEl?.dom?.getAttribute?.('aria-label')); } catch(e) {}
    let owner=c?.ownerCt,depth=0;
    while(owner && depth<5){
      parts.push(owner?.fieldLabel,owner?.boxLabel,owner?.text,owner?.title,owner?.itemId,owner?.name,owner?.id);
      owner=owner?.ownerCt; depth+=1;
    }
    return fold(parts.filter(Boolean).join(' '));
  };
  const visible = c => c && !c.hidden && (typeof c.isVisible !== "function" || c.isVisible(true));
  const fields = components.filter(c => visible(c) && (typeof c.setValue === 'function' || typeof c.setRawValue === 'function'));
  const xtype = c => fold(c?.xtype || c?.getXType?.() || '');
  const isDate = c => !!(c && (c.isXType?.('datefield') || c.xtype === 'datefield' || xtype(c).includes('datefield') || xtype(c).includes('date field')));
  const isTime = c => !!(c && (c.isXType?.('timefield') || c.xtype === 'timefield' || xtype(c).includes('timefield') || xtype(c).includes('time field')));
  const scoreText = (text,pats,compactPats) => {
    const s=fold(text), sc=compact(s); let cur=0;
    for(let i=0;i<pats.length;i++){
      const p=pats[i], cp=compactPats[i];
      if(!p) continue;
      if(s===p || (cp && sc===cp)) cur=Math.max(cur,120);
      else if(s.startsWith(p+' ')) cur=Math.max(cur,95);
      else if(s.includes(p)) cur=Math.max(cur,75);
      else if(cp && cp.length>=3 && sc.includes(cp)) cur=Math.max(cur,65);
    }
    return cur;
  };
  const kindOk = (c,kind) => {
    const date=isDate(c), clock=isTime(c), text=label(c);
    if(kind==='date') return date;
    if(kind==='time') return !date && (clock || /time/.test(text));
    return !date && !clock;
  };
  const componentForInput = input => {
    if(!input) return null;
    for(const c of fields){
      try { if(c?.inputEl?.dom===input) return c; } catch(e) {}
    }
    const rawId=String(input.id||'');
    const cmpId=rawId.replace(/-inputEl$/,'');
    try { const direct=Ext.getCmp?.(cmpId); if(direct && fields.includes(direct)) return direct; } catch(e) {}
    return null;
  };
  function findDomField(patterns,kind){
    const pats=patterns.map(fold), compactPats=patterns.map(compact);
    const selectors='label,.x-form-item-label,.x-form-item-label-inner,.x-form-item-label-default';
    let nodes=[]; try { nodes=[...document.querySelectorAll(selectors)]; } catch(e) {}
    let best=null,bestScore=-1;
    for(const node of nodes){
      const base=scoreText(node?.textContent||'',pats,compactPats);
      if(base<=0) continue;
      const seen=new Set(), inputs=[];
      const add=input=>{if(input && !seen.has(input)){seen.add(input);inputs.push(input);}};
      try { if(node.htmlFor) add(document.getElementById(node.htmlFor)); } catch(e) {}
      let root=node,depth=0;
      while(root && depth<5 && !inputs.some(x=>kindOk(componentForInput(x),kind))){
        try { for(const input of root.querySelectorAll?.('input')||[]) add(input); } catch(e) {}
        root=root.parentElement; depth+=1;
      }
      for(const input of inputs){
        const c=componentForInput(input);
        if(!c || !kindOk(c,kind)) continue;
        let score=base;
        if(node.htmlFor && input.id===node.htmlFor) score+=25;
        score+=Math.min(20,scoreText(label(c),pats,compactPats)/6);
        if(score>bestScore){best=c;bestScore=score;}
      }
    }
    return bestScore>0?best:null;
  }
  function findField(patterns, kind="text") {
    const direct=findDomField(patterns,kind);
    if(direct) return direct;
    const pats = patterns.map(fold), compactPats = patterns.map(compact);
    let best=null, score=-1;
    for (const c of fields) {
      if(!kindOk(c,kind)) continue;
      const cur=scoreText(label(c),pats,compactPats);
      if (cur>score) { score=cur; best=c; }
    }
    return score>0?best:null;
  }
  const meta = (c,value) => ({label:label(c),ownLabel:ownLabel(c),itemId:c.itemId||null,name:c.name||null,id:c.id||null,value,raw:String(c.getRawValue?.()??'')});
  function setText(patterns,value) {
    const c=findField(patterns,'text');
    if(!c) { if(value) throw new Error('Filtro 3012 ausente: '+patterns[0]); return null; }
    const old=c.getValue?.(); let actual=value ?? '';
    const isCombo=c.isXType?.('combobox') || c.xtype==='combobox';
    if(isCombo && actual!=='') {
      const store=c.getStore?.()||c.store, records=store?.getRange?.()||[];
      const get=(r,k)=>r.get?r.get(k):r.data?.[k];
      const matches=records.filter(r=>String(get(r,c.valueField))===String(actual)||String(get(r,c.displayField))===String(actual));
      if(matches.length!==1)throw new Error('3012: valor de combo nao resolvido: '+patterns[0]);
      actual=get(matches[0],c.valueField); c.select?.(matches[0]); c.setValue(actual);
      c.fireEvent?.('select',c,matches);
    } else c.setValue(actual);
    c.fireEvent?.('change',c,actual,old);c.checkChange?.();c.fireEvent?.('blur',c);
    if(String(c.getValue?.()??'')!==String(actual)||c.isValid?.()===false)throw new Error('3012: filtro nao aplicado: '+patterns[0]);
    return meta(c,actual);
  }
  function setDate(patterns,value) {
    const c=findField(patterns,'date'); if(!c)throw new Error('Data 3012 ausente: '+patterns[0]);
    const parts=String(value).slice(0,10).split('-').map(Number), d=new Date(parts[0],parts[1]-1,parts[2]);
    const old=c.getValue?.();
    c.setValue(d);
    if(!String(c.getRawValue?.()??'').trim() && typeof c.setRawValue==='function'){
      let formatted=value;
      try { formatted=c.formatDate?.(d) || Ext.Date?.format?.(d,c.format||'Y-m-d') || value; } catch(e) {}
      c.setRawValue(formatted);
    }
    c.fireEvent?.('select',c,d);c.fireEvent?.('change',c,d,old);c.checkChange?.();c.fireEvent?.('blur',c);
    let got=c.getValue?.();
    if(!(got instanceof Date)){
      try { got=c.parseDate?.(c.getRawValue?.()); } catch(e) {}
    }
    if(!(got instanceof Date)||got.getFullYear()!==d.getFullYear()||got.getMonth()!==d.getMonth()||got.getDate()!==d.getDate()||c.isValid?.()===false)throw new Error('Data 3012 nao aplicada: '+patterns[0]);
    return meta(c,value);
  }
  function setTime(patterns,value) {
    const c=findField(patterns,'time'); if(!c)throw new Error('Hora 3012 ausente: '+patterns[0]);
    const parts=String(value||'00:00').split(':').map(Number), hh=parts[0]||0, mm=parts[1]||0;
    const matches=got=>{
      if(got instanceof Date) return got.getHours()===hh && got.getMinutes()===mm;
      const raw=String(c.getRawValue?.()??got??'');
      const m=raw.match(/(\d{1,2}):(\d{2})/);
      return !!m && Number(m[1])===hh && Number(m[2])===mm;
    };
    const old=c.getValue?.(); c.setValue(value);
    if(!matches(c.getValue?.()) && typeof c.setValue==='function') c.setValue(new Date(2008,0,1,hh,mm,0,0));
    c.fireEvent?.('select',c,c.getValue?.());c.fireEvent?.('change',c,c.getValue?.(),old);c.checkChange?.();c.fireEvent?.('blur',c);
    if(!matches(c.getValue?.())||c.isValid?.()===false)throw new Error('Hora 3012 nao aplicada: '+patterns[0]);
    return meta(c,value);
  }

  const applied={};
  applied.sn=setText(['sn','sn imei','lot id'],cfg.sn);
  applied.line=setText(['line','line id'],cfg.line);
  applied.model=setText(['model','product model'],cfg.model);
  applied.defectCode=setText(['defect code'],cfg.defectCode);
  applied.repairCode=setText(['repair code'],cfg.repairCode);
  applied.defectType=setText(['defect type'],cfg.defectType);
  applied.dateFrom=setDate(['defect time start','defect start'],cfg.dateFrom);
  applied.timeFrom=setTime(['defect time start','start time'],cfg.timeFrom);
  applied.dateTo=setDate(['defect time end','defect end'],cfg.dateTo);
  applied.timeTo=setTime(['defect time end','end time'],cfg.timeTo);
  if(applied.dateFrom?.id && applied.dateFrom.id===applied.dateTo?.id)throw new Error('3012: datas inicial/final resolveram o mesmo campo');
  if(applied.timeFrom?.id && applied.timeFrom.id===applied.timeTo?.id)throw new Error('3012: horas inicial/final resolveram o mesmo campo');

  function storeFields(store) {
    const out=[];
    try {
      const model=store.getModel?.() || store.model;
      const fs=model?.getFields?.() || model?.fields?.items || [];
      for(const f of fs) out.push(String(f?.name||f?.getName?.()||''));
    } catch(e) {}
    try { const first=store.getAt?.(0); if(first) out.push(...Object.keys(dataOf(first))); } catch(e) {}
    return [...new Set(out.filter(Boolean))];
  }
  function scoreStore(store) {
    const names=storeFields(store).map(fold); const joined=' '+names.join(' ')+' '; let score=0;
    for(const needle of ['repair comment','repair user','repair time','repair code','defect code','defect desc','defect user','defect oper']) if(joined.includes(needle)) score+=20;
    if(joined.includes('repair comment')) score+=80;
    if(joined.includes('repair user')) score+=40;
    return {score,names};
  }
  const storeCandidates=[];
  for(const c of components.filter(visible)) {
    let store=null; try { store=c.getStore?.() || c.store; } catch(e) {}
    if(!store || !store.loadPage) continue;
    const s=scoreStore(store); if(s.score>0) storeCandidates.push({c,store,...s});
  }
  storeCandidates.sort((a,b)=>b.score-a.score);
  const chosen=storeCandidates[0];
  if(!chosen || chosen.score<60) throw new Error('Grid principal da 3012 nao identificado com seguranca.');
  const store=chosen.store;

  const buttons=components.filter(c=>visible(c) && (c.isButton || c.xtype==='button' || typeof c.handler==='function'));
  let viewButton=null,best=-1;
  for(const b of buttons){const s=ownLabel(b);let sc=0;if(s==='view')sc=100;else if(s.includes(' view ' )||s.endsWith(' view')||s.startsWith('view '))sc=80;else if(s.includes('query')||s.includes('search'))sc=40;if(sc>best){best=sc;viewButton=b;}}
  if(!viewButton || best<40) throw new Error('Botao View da 3012 nao identificado.');

  const proxy=store.getProxy?.() || store.proxy;
  const beforeParams=JSON.parse(JSON.stringify(proxy?.extraParams||{}));
  const waitLoad = () => new Promise((resolve,reject)=>{
    let done=false;
    const cleanup=()=>{clearTimeout(timer);store.un?.('load',finish);};
    const finish=(loadedStore,records,success)=>{if(done)return;done=true;cleanup();success===false?reject(new Error('3012 retornou falha ao carregar a grid.')):resolve((records||[]).map(dataOf));};
    const timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('Timeout aguardando nova carga 3012; grade antiga recusada.'));},30000);
    if(typeof store.on!=='function'){cleanup();reject(new Error('Store 3012 sem evento load'));return;}
    store.on('load',finish,null,{single:true});
    store.currentPage=1;
    try {
      if(typeof viewButton.handler==='function') viewButton.handler.call(viewButton.scope||viewButton,viewButton);
      else viewButton.fireEvent?.('click',viewButton);
    } catch(e) { done=true;cleanup();reject(e); }
  });
  const firstPage=await waitLoad();
  await new Promise(r=>setTimeout(r,120));
  const params=JSON.parse(JSON.stringify((store.getProxy?.()||store.proxy)?.extraParams||{}));
  const total=Number(store.getTotalCount?.() ?? firstPage.length ?? 0);
  const pageSize=Number(store.pageSize||firstPage.length||100)||100;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  if(pages>10000)throw new Error("3012 excedeu limite de paginacao");
  const records=[...firstPage]; const pageResults=[{page:1,count:firstPage.length}];

  async function loadPage(pageNo){
    return await new Promise((resolve,reject)=>{
      let done=false;const timer=setTimeout(()=>{if(!done){done=true;reject(new Error('Timeout 3012 pagina '+pageNo));}},30000);
      try { store.loadPage(pageNo,{callback:(rs,op,success)=>{if(done)return;done=true;clearTimeout(timer);if(success===false)reject(new Error('Falha 3012 pagina '+pageNo));else resolve((rs||[]).map(dataOf));}}); }
      catch(e){if(!done){done=true;clearTimeout(timer);reject(e);}}
    });
  }
  for(let p=2;p<=pages;p++){const rs=await loadPage(p);records.push(...rs);pageResults.push({page:p,count:rs.length});}
  if(records.length!==total)throw new Error("3012 incompleta: "+records.length+" / "+total);
  return {records,total,pageSize,pages,pageResults,applied,proxyParams:params,beforeParams,storeFields:chosen.names,storeScore:chosen.score,gridItemId:chosen.c?.itemId||null};
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
    checkpoint={"done":[],"rows":[]}
    if checkpoint_path and checkpoint_path.exists():
        try:checkpoint=json.loads(checkpoint_path.read_text(encoding="utf-8"))
        except Exception:checkpoint={"done":[],"rows":[]}
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
                diagnostics.append({"sn":sn,"from":cfg["dateFrom"]+" "+cfg["timeFrom"],"to":cfg["dateTo"]+" "+cfg["timeTo"],"rows":len(normalized),
                                    "total":raw.get("total"),"pages":raw.get("pages"),"store_score":raw.get("storeScore"),"fields":raw.get("storeFields"),"applied":raw.get("applied"),"surface":"home"})
                if checkpoint_path:
                    checkpoint_path.parent.mkdir(parents=True,exist_ok=True)
                    checkpoint_path.write_text(json.dumps({"done":sorted(done),"rows":records,"updated_at":datetime.now().isoformat(timespec="seconds")},ensure_ascii=False,indent=2,default=str),encoding="utf-8")

    unique={}
    for row in records:unique[row["row_key"]]=row
    rows=list(unique.values());rows.sort(key=lambda r:str(r.get("defect_time") or ""),reverse=True)
    return {"source":"AWIP3012_HOME_DIRECT_EXTJS","surface":"home","view":ROUTE_3012,"generated_at":datetime.now().isoformat(timespec="seconds"),
            "query":{"sns":targets,"start_at":start.isoformat(timespec="minutes"),"end_at":end.isoformat(timespec="minutes"),"line":line,"model":model,
                     "defect_code":defect_code,"repair_code":repair_code,"defect_type":defect_type,"chunk_days":chunk_days},
            "rows":rows,"records_count":len(rows),"chunks":diagnostics}
