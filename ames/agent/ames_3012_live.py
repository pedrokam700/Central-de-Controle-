from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List

QUERY_3012_JS = r"""
async (cfg) => {
  if (!window.Ext) throw new Error('ExtJS nao encontrado na 3012.');
  const fold = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const dataOf = r => { try { return JSON.parse(JSON.stringify(r?.getData ? r.getData() : r?.data || {})); } catch(e) { return {}; } };
  const components = [];
  try {
    const all = Ext.ComponentManager && Ext.ComponentManager.all;
    if (all?.items) components.push(...all.items);
    else if (all?.getArray) components.push(...all.getArray());
    else if (all?.each) all.each(x => components.push(x));
  } catch(e) {}
  if (!components.length && Ext.ComponentQuery?.query) { try { components.push(...Ext.ComponentQuery.query('*')); } catch(e) {} }

  const label = c => fold([c?.fieldLabel, c?.boxLabel, c?.text, c?.itemId, c?.name, c?.id].filter(Boolean).join(' '));
  const visible = c => c && !c.hidden && (typeof c.isVisible !== "function" || c.isVisible(true));
  const fields = components.filter(c => visible(c) && (typeof c.setValue === 'function' || typeof c.setRawValue === 'function'));
  function findField(patterns, kind="text") {
    const pats = patterns.map(fold);
    let best=null, score=-1;
    for (const c of fields) {
      const date = c.isXType?.('datefield') || c.xtype === 'datefield';
      const clock = c.isXType?.('timefield') || c.xtype === 'timefield';
      if(kind === 'date' ? !date : date) continue;
      if(kind === 'time' && !clock && !/time/.test(label(c))) continue;
      const s=label(c); let cur=0;
      for (const p of pats) {
        if (!p) continue;
        if (s === p) cur=Math.max(cur,100);
        else if (s.startsWith(p+' ')) cur=Math.max(cur,80);
        else if (s.includes(p)) cur=Math.max(cur,55);
      }
      if (cur>score) { score=cur; best=c; }
    }
    return score>0?best:null;
  }
  function setText(patterns,value,kind="text") {
    const c=findField(patterns,kind);
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
    return {label:label(c),itemId:c.itemId||null,name:c.name||null,value:actual};
  }
  function setDate(patterns,value) {
    const c=findField(patterns,'date'); if(!c)throw new Error('Data 3012 ausente: '+patterns[0]);
    const parts=String(value).slice(0,10).split('-').map(Number), d=new Date(parts[0],parts[1]-1,parts[2]);
    const old=c.getValue?.();c.setValue(d);c.fireEvent?.('change',c,d,old);c.checkChange?.();c.fireEvent?.('blur',c);
    const got=c.getValue?.();
    if(!(got instanceof Date)||got.getFullYear()!==d.getFullYear()||got.getMonth()!==d.getMonth()||got.getDate()!==d.getDate()||c.isValid?.()===false)throw new Error('Data 3012 nao aplicada');
    return {label:label(c),itemId:c.itemId||null,name:c.name||null,value};
  }

  const applied={};
  applied.sn=setText(['sn','sn imei','lot id'],cfg.sn);
  applied.line=setText(['line','line id'],cfg.line);
  applied.model=setText(['model','product model'],cfg.model);
  applied.defectCode=setText(['defect code'],cfg.defectCode);
  applied.repairCode=setText(['repair code'],cfg.repairCode);
  applied.defectType=setText(['defect type'],cfg.defectType);
  applied.dateFrom=setDate(['defect time start','defect start'],cfg.dateFrom);
  applied.timeFrom=setText(['defect time start','start time'],cfg.timeFrom,"time");
  applied.dateTo=setDate(['defect time end','defect end'],cfg.dateTo);
  applied.timeTo=setText(['defect time end','end time'],cfg.timeTo,"time");

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
  for(const b of buttons){const s=label(b);let sc=0;if(s==='view')sc=100;else if(s.includes(' view ' )||s.endsWith(' view')||s.startsWith('view '))sc=80;else if(s.includes('query')||s.includes('search'))sc=40;if(sc>best){best=sc;viewButton=b;}}
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
    identity = "|".join(_clean(out.get(k)) for k in sorted(out) if k != "raw")
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


def _select_page(browser, ames_host: str):
    pages=[p for ctx in browser.contexts for p in ctx.pages]
    if not pages:
        raise RuntimeError("Chrome dedicado sem paginas abertas")
    def score(page):
        url=(page.url or "").lower();s=0
        if "vwdefectrepairview" in url:s+=120
        if "3012" in url:s+=60
        if str(ames_host).lower() in url:s+=20
        return s
    page=max(pages,key=score)
    if score(page)>=120:return page
    candidates=[p for p in pages if str(ames_host) in (p.url or "")]
    if not candidates:
        raise RuntimeError("Nenhuma sessao A-MES aberta no Chrome dedicado")
    page=candidates[0];base=(page.url or "").split("#",1)[0]
    if "/asymes" not in base.lower():
        raise RuntimeError("Sessao A-MES nao identificada")
    page.goto(base+"#UAWIP.form.VwDefectRepairView",wait_until="domcontentloaded",timeout=25000)
    deadline=time.time()+25
    while time.time()<deadline:
        try:
            ready=page.evaluate("""() => !!(window.Ext && Ext.ComponentQuery && Ext.ComponentQuery.query('*').some(c=>String(c?.text||'').trim()==='View'))""")
            if ready:return page
        except Exception:pass
        time.sleep(.4)
    raise RuntimeError("Tela 3012 nao carregou automaticamente")


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
                                    "total":raw.get("total"),"pages":raw.get("pages"),"store_score":raw.get("storeScore"),"fields":raw.get("storeFields"),"applied":raw.get("applied")})
                if checkpoint_path:
                    checkpoint_path.parent.mkdir(parents=True,exist_ok=True)
                    checkpoint_path.write_text(json.dumps({"done":sorted(done),"rows":records,"updated_at":datetime.now().isoformat(timespec="seconds")},ensure_ascii=False,indent=2,default=str),encoding="utf-8")

    unique={}
    for row in records:unique[row["row_key"]]=row
    rows=list(unique.values());rows.sort(key=lambda r:str(r.get("defect_time") or ""),reverse=True)
    return {"source":"AWIP3012_DIRECT_EXTJS","view":"UAWIP.form.VwDefectRepairView","generated_at":datetime.now().isoformat(timespec="seconds"),
            "query":{"sns":targets,"start_at":start.isoformat(timespec="minutes"),"end_at":end.isoformat(timespec="minutes"),"line":line,"model":model,
                     "defect_code":defect_code,"repair_code":repair_code,"defect_type":defect_type,"chunk_days":chunk_days},
            "rows":rows,"records_count":len(rows),"chunks":diagnostics}
