from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List
from urllib.parse import parse_qsl, unquote_plus, urlsplit, urlunsplit

ROUTE_3012 = "UAWIP.form.VwDefectRepairView"
HOME_SURFACE = "/asymes/home"
OPC_SURFACE = "/asymes/opc"
QUERY_CONTRACT = "3012-home-mapped-v2"
# The mapped field contract remains V2; the proof level is newer. Only a
# request that verifies the actual MES from/to dates can certify a zero-row
# historical window. Previous V2 coverage/checkpoints stay on disk, but must
# not suppress a retry of the 3012 date-range regression.
SOURCE_3012 = "AWIP3012_HOME_DIRECT_EXTJS_MAPPED_V2_PERIOD_VERIFIED_20261105"
CHECKPOINT_CONTRACT = QUERY_CONTRACT + "-period-verified-20261105"

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
  // ExtJS datetime compounds may keep a separate backing value (`__Data`).
  // Only synchronize a recognized local date representation; never guess
  // whether an opaque hidden value is UTC, an epoch, or another MES contract.
  const syncBackingDate=(data,full,day,hour)=>{
    if(!data||typeof data.setValue!=='function')return;
    const previous=data.getValue?.();
    if(previous instanceof Date){
      data.setValue(full);
      emit(data,'change',full,previous);
      data.checkChange?.();
      return;
    }
    const raw=clean(previous);
    if(!raw){
      // In the live Ext.NET form the visible Date/Time pair may update while
      // the hidden __Data field remains empty. An empty backing field is
      // submitted as fromDate/toDate with no usable date; the previous mock
      // always filled it, concealing this production-only regression.
      const replacement=day+' '+hour+':00';
      data.setValue(replacement);
      emit(data,'change',replacement,previous);
      data.checkChange?.();
      return;
    }
    const match=raw.match(/^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})[ T](\d{1,2}:\d{2})(:\d{2})?$/);
    if(!match)return;
    const separator=raw.includes('T')?'T':' ';
    const dayFormat=match[1].includes('/')?day.replace(/-/g,'/'):day;
    // Keep backing seconds equal to parent.setValue(full), which has
    // minute-precision input and therefore second=00.
    const replacement=dayFormat+separator+hour+(match[3]?':00':'');
    data.setValue(replacement);
    emit(data,'change',replacement,previous);
    data.checkChange?.();
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
    try {
      const input=date?.inputEl?.dom;
      if(input){
        input.value=clean(date.getRawValue?.())||dateValue;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
      }
    } catch(e) {}
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
    syncBackingDate(data,full,dateValue,timeValue);
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
  // Changing one ExtJS datetime compound can silently reset its sibling.
  // Validate both after setting the end, not only while setting each field.
  const mappedMatches=(root,day,hour)=>dateMatches(byItemId(root+'__Date',{visibleOnly:true}),day)
    &&timeMatches(byItemId(root+'__Time',{visibleOnly:true}),hour);
  if(!mappedMatches('dteFromDate',cfg.dateFrom,cfg.timeFrom)
    ||!mappedMatches('dteToDate',cfg.dateTo,cfg.timeTo))
    throw new Error('3012_DATE_RANGE_NOT_APPLIED: datas de início/fim divergentes na interface');

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
  // The 3012 Home sometimes submits the form through Ext.Ajax with serialized
  // `dteFromDate__Data` / `dteToDate__Data` values, while the grid store's
  // extraParams contains only paging and an SN. Observe the actual outgoing
  // request instead of requiring invented top-level `fromDate`/`toDate` keys.
  // No XHR/fetch monkey patch and no request values are placed in errors.
  const ajaxRequests=[];
  const ajax=Ext.Ajax||null;
  const ajaxBefore=(_connection,options)=>{
    if(!options||typeof options!=='object')return;
    // Some ExtJS installations submit the query as an HTML form instead of
    // putting its filters in options.params/jsonData. Read only the exact SN
    // and period field names from that form; never copy unrelated fields,
    // credentials or session values into the query proof.
    const allowed=new Set(['snimei','txtsnimei','sn','lotid','pcbasn','serialno',
      'fromdate','datefrom','defecttimestart','dtefromdate','dtefromdatedata',
      'todate','dateto','defecttimeend','dtetodate','dtetodatedata']);
    const key=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    let form=options.form?.dom||options.form||null;
    if(typeof form==='string')form=document.getElementById?.(form)||null;
    const formFields=[];
    try{
      for(const field of Array.from(form?.elements||[]).slice(0,300)){
        const name=String(field?.name||'');
        if(allowed.has(key(name)))formFields.push({name,value:field.value});
      }
    }catch(e){}
    ajaxRequests.push({params:options.params,jsonData:options.jsonData,
      rawData:options.rawData,url:options.url,formFields});
    if(ajaxRequests.length>12)ajaxRequests.shift();
  };
  try{ajax?.on?.('beforerequest',ajaxBefore);}catch(e){}
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
  const cleanup=()=>{for(const st of observed.values()){try{st.store.un?.('beforeload',st.beforeFn);}catch(e){}try{st.store.un?.('load',st.loadFn);}catch(e){}try{st.store.un?.('datachanged',st.changeFn);}catch(e){}}try{ajax?.un?.('beforerequest',ajaxBefore);}catch(e){}};
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
    // A rebound store or changed proxy extraParams alone is NOT a completed
    // View request. These events previously promoted an inert button click to
    // apparent progress and allowed the stale grid to masquerade as fresh.
    const started=[...observed.values()].some(x=>x.before||x.loads||x.changes)||ajaxRequests.length>0;
    return {cur,st,token,rebound,params,paramsChanged,started,loading:cur.store?.isLoading?.()===true};
  };
  const viewAttempts=[];
  let viewAction=null;
  for(const mode of ['physical_dom_click','ext_click_event','handler_fallback']){
    try{trigger(mode);viewAttempts.push({mode,status:'invoked'});}catch(e){viewAttempts.push({mode,status:'unavailable',error:String(e?.message||e)});continue;}
    // The first physical click is allowed to initiate a slow ExtJS request;
    // falling through after 700ms could click View again while it was loading.
    const until=Date.now()+(mode==='physical_dom_click'?3500:1500);
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
    // No rebound-only success: require an observed store completion/event.
    await sleep(70);
  }
  if(!finalState){cleanup();throw new Error('3012_RESPONSE_NOT_CONFIRMED: View executou, mas nenhuma resposta nova da grid foi comprovada.');}
  if(!mappedMatches('dteFromDate',cfg.dateFrom,cfg.timeFrom)
    ||!mappedMatches('dteToDate',cfg.dateTo,cfg.timeTo)){
    cleanup();throw new Error('3012_DATE_RANGE_DRIFT_AFTER_VIEW: a consulta alterou os campos de data');
  }
  const store=finalState.cur.store;
  const params=snapshotParams(store);
  const finalToken=storeToken(store);
  const proofState=observed.get(store);
  // A visible field match alone is insufficient. The MES query must receive
  // two distinct, correct bounds in its actual ExtJS store request. This
  // refuses the silent Jan-23-to-Jan-23 empty range seen at the workstation.
  const requestParams=proofState?.requestParams||[...observed.values()].map(x=>x.requestParams).find(Boolean)||{};
  const normKey=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const findParameter=(root,aliases,depth=0)=>{
    if(depth>7||root==null)return null;
    const accepted=new Set(aliases.map(normKey));
    if(typeof root==='string'){
      const raw=root.trim();
      if((raw[0]==='{'||raw[0]==='[')&&raw.length<50000){
        try{return findParameter(JSON.parse(raw),aliases,depth+1);}catch(e){}
      }
      if(raw.includes('=')){
        const pairs={};
        for(const item of raw.replace(/^\?/,'').split('&').slice(0,120)){
          const pos=item.indexOf('=');if(pos<0)continue;
          try{pairs[decodeURIComponent(item.slice(0,pos).replace(/\+/g,' '))]=decodeURIComponent(item.slice(pos+1).replace(/\+/g,' '));}catch(e){}
        }
        return findParameter(pairs,aliases,depth+1);
      }
      return null;
    }
    if(Array.isArray(root)){
      for(const item of root){const value=findParameter(item,aliases,depth+1);if(value!=null)return value;}
      return null;
    }
    if(typeof root!=='object')return null;
    if(accepted.has(normKey(root.name||root.field||root.itemId)) && root.value!=null)return root.value;
    for(const [key,value] of Object.entries(root)){
      if(accepted.has(normKey(key))&&value!=null&&value!=='')return value;
    }
    for(const value of Object.values(root)){
      if(typeof value==='object'||typeof value==='string'){
        const found=findParameter(value,aliases,depth+1);if(found!=null)return found;
      }
    }
    return null;
  };
  const fromAliases=['fromDate','dateFrom','defectTimeStart','dteFromDate','dteFromDate__Data'];
  const toAliases=['toDate','dateTo','defectTimeEnd','dteToDate','dteToDate__Data'];
  const snAliases=['snImei','txtSnImei','sn','lotId','pcbaSn','serialNo'];
  const requestSources=[...ajaxRequests.map(x=>({name:'ajax_beforerequest',data:x})).reverse(),
    {name:'store_beforeload',data:requestParams},{name:'proxy',data:params}];
  const stamp=value=>{
    const raw=clean(value);
    const iso=raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[ T](\d{1,2}):(\d{2})/);
    const local=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})/);
    const parts=iso?[+iso[1],+iso[2],+iso[3],+iso[4],+iso[5]]:
      local?[+local[3],+local[2],+local[1],+local[4],+local[5]]:null;
    if(!parts)return '';
    const [year,month,day,hour,minute]=parts;
    const valid=new Date(Date.UTC(year,month-1,day,hour,minute));
    if(valid.getUTCFullYear()!==year||valid.getUTCMonth()!==month-1||valid.getUTCDate()!==day||
      valid.getUTCHours()!==hour||valid.getUTCMinutes()!==minute)return '';
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  };
  const expectedFrom=`${cfg.dateFrom} ${cfg.timeFrom}`,expectedTo=`${cfg.dateTo} ${cfg.timeTo}`;
  let actualFrom='',actualTo='',periodSource='not_observed';
  for(const source of requestSources){
    // A background ExtJS request may share the same date fields. Never
    // certify it as the selected board's request without an exact SN match.
    // Store and proxy metadata can also belong to another query or keep
    // stale dates. Require the exact SN in every source of period proof.
    if(clean(findParameter(source.data,snAliases))!==clean(cfg.sn))continue;
    const begin=stamp(findParameter(source.data,fromAliases)),end=stamp(findParameter(source.data,toAliases));
    if(begin&&end){actualFrom=begin;actualTo=end;periodSource=source.name;break;}
  }
  const periodVerified=actualFrom===expectedFrom&&actualTo===expectedTo;
  if(!periodVerified&&!cfg.allowWirePeriodProof){
    // Dates only: no SN, MES response rows, cookies, tokens or request headers.
    cleanup();throw new Error(`3012_QUERY_PERIOD_MISMATCH: esperado ${expectedFrom} -> ${expectedTo}; observado ${actualFrom||'AUSENTE'} -> ${actualTo||'AUSENTE'} (${periodSource}); consulta recusada`);
  }
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
  const queryProof={contract:CONTRACT,viewAction,viewAttempts,freshness,initialStoreToken:initialToken,finalStoreToken:finalToken,storeRebound:finalToken!==initialToken,requestParams,proxyParams:params,periodVerified,periodSource,
    requestedWindow:{from:expectedFrom,to:expectedTo},actualWindow:{from:actualFrom,to:actualTo}};
  cleanup();
  return {records,total,pageSize,pages,pageResults,applied,proxyParams:params,beforeParams,storeFields:storeFields(store),gridItemId:finalState.cur.grid?.itemId||null,viewAction,queryProof};
}
"""


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


_WIRE_3012_ALIASES = {
    'sn': ('snImei', 'txtSnImei', 'sn', 'lotId', 'pcbaSn', 'serialNo'),
    'from': ('fromDate', 'dateFrom', 'defectTimeStart', 'dteFromDate', 'dteFromDate__Data'),
    'to': ('toDate', 'dateTo', 'defectTimeEnd', 'dteToDate', 'dteToDate__Data'),
    # Ext.NET compound fields can send date and time as two distinct inputs;
    # the previous probe required a single datetime and therefore missed both.
    'from_day': ('dteFromDate__Date', 'defectTimeStartDate'),
    'from_time': ('dteFromDate__Time', 'defectTimeStartTime'),
    'to_day': ('dteToDate__Date', 'defectTimeEndDate'),
    'to_time': ('dteToDate__Time', 'defectTimeEndTime'),
}


def _wire_key(value: Any) -> str:
    return re.sub(r'[^a-z0-9]', '', str(value or '').lower())


def _wire_find(root: Any, names: Iterable[str], depth: int = 0) -> Any:
    """Read only selected form values, including nested Ext.NET JSON/URL forms.

    This helper may inspect the request payload in RAM. No raw body, URL,
    cookies, unrelated fields, response, or SN is ever persisted/logged.
    """
    if root is None or depth > 8:
        return None
    aliases = {_wire_key(name) for name in names}
    if isinstance(root, str):
        raw = root.strip()
        if len(raw) > 250000:
            return None
        if raw[:3].lower() in ('%7b', '%5b'):
            return _wire_find(unquote_plus(raw), names, depth + 1)
        if raw.startswith(('{', '[')):
            try:
                return _wire_find(json.loads(raw), names, depth + 1)
            except (ValueError, TypeError):
                return None
        if '=' in raw:
            try:
                return _wire_find(dict(parse_qsl(raw.lstrip('?'), keep_blank_values=True,
                                                max_num_fields=500)), names, depth + 1)
            except (ValueError, TypeError):
                return None
        return None
    if isinstance(root, (list, tuple)):
        for item in root:
            found = _wire_find(item, names, depth + 1)
            if found is not None:
                return found
        return None
    if not isinstance(root, dict):
        return None
    for name in ('name', 'field', 'itemId'):
        if _wire_key(root.get(name)) in aliases and root.get('value') not in (None, ''):
            return root['value']
    for key, value in root.items():
        if _wire_key(key) in aliases and value not in (None, ''):
            return value
    for value in root.values():
        if isinstance(value, (str, dict, list, tuple)):
            found = _wire_find(value, names, depth + 1)
            if found is not None:
                return found
    return None


def _wire_stamp(value: Any) -> str:
    raw = _clean(value)
    # A date prefix is not period proof. A trailing timezone, suffix or
    # malformed timestamp needs its own explicit interpretation, never a
    # silent prefix match against the requested local MES minute.
    iso = re.fullmatch(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d{1,6})?)?', raw)
    local = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d{1,6})?)?', raw)
    parts = (tuple(int(iso[i]) for i in range(1, 6)) if iso else
             (int(local[3]), int(local[2]), int(local[1]), int(local[4]), int(local[5]))
             if local else None)
    if not parts:
        return ''
    try:
        return datetime(*parts).strftime('%Y-%m-%d %H:%M')
    except ValueError:
        return ''


def _wire_values(root: Any, names: Iterable[str], depth: int = 0) -> List[Any]:
    """Return *all* matching date fields, including blanks and duplicates.

    A single `_wire_find` collapses duplicate URL-encoded keys and skips empty
    fields. Both behaviors made very different real MES failures look identical
    and could prefer a stale URL value over the actual POST body. Values remain
    in memory and are never returned from diagnostics or written to disk.
    """
    if root is None or depth > 8:
        return []
    aliases = {_wire_key(name) for name in names}
    if isinstance(root, str):
        raw = root.strip()
        if len(raw) > 250000:
            return []
        if raw[:3].lower() in ('%7b', '%5b'):
            return _wire_values(unquote_plus(raw), names, depth + 1)
        if raw.startswith(('{', '[')):
            try:
                return _wire_values(json.loads(raw), names, depth + 1)
            except (ValueError, TypeError):
                return []
        if '=' in raw:
            try:
                pairs = parse_qsl(raw.lstrip('?'), keep_blank_values=True, max_num_fields=500)
            except (ValueError, TypeError):
                return []
            return [value for key, value in pairs if _wire_key(key) in aliases] + [
                candidate for key, value in pairs if _wire_key(key) not in aliases
                for candidate in _wire_values(value, names, depth + 1)]
        return []
    if isinstance(root, (list, tuple)):
        values = []
        for item in root[:500]:
            values.extend(_wire_values(item, names, depth + 1))
        return values
    if not isinstance(root, dict):
        return []
    values = []
    if any(_wire_key(root.get(n)) in aliases for n in ('name', 'field', 'itemId')) and 'value' in root:
        values.append(root['value'])
    for key, value in root.items():
        if _wire_key(key) in aliases:
            values.append(value)
        elif isinstance(value, (str, dict, list, tuple)):
            values.extend(_wire_values(value, names, depth + 1))
    return values


def _wire_value_shape(value: Any) -> str:
    """Report only a fixed vocabulary, never a field value or credentials."""
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, (int, float)):
        return 'number'
    if isinstance(value, (dict, list, tuple)):
        return 'object'
    raw = _clean(value)
    if not raw:
        return 'empty'
    if _wire_stamp(raw):
        return 'datetime_recognized'
    if re.fullmatch(r'\d{4}[-/]\d{1,2}[-/]\d{1,2}', raw):
        return 'iso_day_only'
    if re.fullmatch(r'\d{1,2}/\d{1,2}/\d{4}', raw):
        return 'br_day_only'
    if re.fullmatch(r'-?\d{10,16}', raw):
        return 'numeric_timestamp'
    if re.fullmatch(r'/?Date\(-?\d+(?:[+-]\d+)?\)/?', raw, flags=re.I):
        return 'dotnet_date'
    if re.match(r'^\d{4}-\d{2}-\d{2}T', raw) and (raw.endswith('Z') or re.search(r'[+-]\d{2}:?\d{2}$', raw)):
        return 'iso_timezone'
    if raw.startswith(('{', '[')):
        return 'json_wrapped'
    return 'other_text'


def _wire_request_dates(root: Any) -> tuple[list[str], list[str], list[tuple[str, str]]]:
    """Inspect one request source; never mix unrelated from/to candidates."""
    from_values = _wire_values(root, _WIRE_3012_ALIASES['from'])[:12]
    to_values = _wire_values(root, _WIRE_3012_ALIASES['to'])[:12]
    from_days = _wire_values(root, _WIRE_3012_ALIASES['from_day'])[:4]
    from_times = _wire_values(root, _WIRE_3012_ALIASES['from_time'])[:4]
    to_days = _wire_values(root, _WIRE_3012_ALIASES['to_day'])[:4]
    to_times = _wire_values(root, _WIRE_3012_ALIASES['to_time'])[:4]
    starts, ends = [], []
    for raw in from_values:
        stamp = _wire_stamp(raw)
        if not stamp:
            for day in from_days or [raw]:
                for hour in from_times:
                    stamp = _wire_split_stamp(day, hour)
                    if stamp:
                        break
                if stamp:
                    break
        if stamp:
            starts.append(stamp)
    for raw in to_values:
        stamp = _wire_stamp(raw)
        if not stamp:
            for day in to_days or [raw]:
                for hour in to_times:
                    stamp = _wire_split_stamp(day, hour)
                    if stamp:
                        break
                if stamp:
                    break
        if stamp:
            ends.append(stamp)
    # Split Ext.NET date/time fields may omit the combined `fromDate`/`toDate`.
    if not from_values:
        starts.extend(filter(None, (_wire_split_stamp(day, hour)
            for day in from_days for hour in from_times)))
    if not to_values:
        ends.extend(filter(None, (_wire_split_stamp(day, hour)
            for day in to_days for hour in to_times)))
    def shapes(combined, days, times):
        if combined:
            return sorted({_wire_value_shape(v) for v in combined})
        if not days and not times:
            return ['absent']
        return sorted({f'day_{_wire_value_shape(v)}' for v in days} |
                      {f'time_{"recognized" if re.fullmatch(r"\d{1,2}:\d{2}(?::\d{2})?", _clean(v)) else "unrecognized" if _clean(v) else "empty"}' for v in times})
    return (shapes(from_values, from_days, from_times),
            shapes(to_values, to_days, to_times),
            [(start, end) for start in set(starts) for end in set(ends)])


def _wire_split_stamp(day: Any, clock: Any) -> str:
    """Combine only an explicit date field and its matching time field."""
    date_raw, time_raw = _clean(day), _clean(clock)
    iso = re.fullmatch(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})', date_raw)
    local = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', date_raw)
    clock_match = re.fullmatch(r'(\d{1,2}):(\d{2})(?::\d{2})?', time_raw)
    if not clock_match or not (iso or local):
        return ''
    parts = ((int(iso[1]),int(iso[2]),int(iso[3])) if iso else
             (int(local[3]),int(local[2]),int(local[1])))
    try:
        return datetime(*parts, int(clock_match[1]), int(clock_match[2])).strftime('%Y-%m-%d %H:%M')
    except ValueError:
        return ''


def _wire_date_hints(root: Any, depth: int = 0) -> set[str]:
    """Inspect field *names* only; never expose submitted values or headers.

    Ext.NET may serialize date fields under its own names rather than the
    mapped component IDs. This evidence distinguishes an unknown field name
    from dates absent from the outgoing HTTP payload.
    """
    if root is None or depth > 8:
        return set()
    if isinstance(root, str):
        raw = root.strip()
        if len(raw) > 250000:
            return set()
        if raw[:3].lower() in ('%7b', '%5b'):
            return _wire_date_hints(unquote_plus(raw), depth + 1)
        if raw.startswith(('{', '[')):
            try:
                return _wire_date_hints(json.loads(raw), depth + 1)
            except (ValueError, TypeError):
                return set()
        if '=' in raw:
            try:
                return _wire_date_hints(dict(parse_qsl(raw.lstrip('?'), keep_blank_values=True,
                                                     max_num_fields=500)), depth + 1)
            except (ValueError, TypeError):
                return set()
        return set()
    if isinstance(root, (list, tuple)):
        result = set()
        for item in root[:500]:
            result.update(_wire_date_hints(item, depth + 1))
        return result
    if not isinstance(root, dict):
        return set()
    result = set()
    candidates = list(root.keys())
    if root.get('name') is not None:
        candidates.append(root.get('name'))
    if root.get('field') is not None:
        candidates.append(root.get('field'))
    for name in candidates:
        # These are normalized technical keys, never the raw field name.
        key = _wire_key(name)[:48]
        if (key and any(part in key for part in ('date', 'time', 'from', 'begin', 'start', 'end'))
                and not any(part in key for part in ('password', 'token', 'secret', 'cookie', 'session', 'auth'))):
            result.add(key)
    for value in root.values():
        if isinstance(value, (str, dict, list, tuple)):
            result.update(_wire_date_hints(value, depth + 1))
    return result


def _wire_expected_day_in_payload(fields: list[Any], expected: str) -> bool:
    """Diagnostic hint only; an unnamed date literal is never period proof."""
    try:
        day = datetime.strptime(expected[:10], '%Y-%m-%d')
        patterns = (day.strftime('%Y-%m-%d'), day.strftime('%Y/%m/%d'),
                    day.strftime('%d/%m/%Y'))
        for field in fields:
            raw = json.dumps(field, default=str, ensure_ascii=False) if not isinstance(field, str) else field
            decoded = unquote_plus(raw[:250000])
            if any(pattern in decoded for pattern in patterns):
                return True
    except (ValueError, TypeError):
        pass
    return False


class Wire3012Probe:
    """Passive Playwright HTTP proof of the exact submitted SN and period.

    No route interception, request modification or broad network capture. The
    only durable output is a handful of counters; request bodies are dropped
    immediately after examining permitted fields in memory.
    """

    def __init__(self, host: str, sn: str, expected: Dict[str, str]):
        self.host = str(host or '').lower()
        self.sn = str(sn or '').strip()
        self.expected = expected
        self._requests = {}

    def on_request(self, request):
        try:
            url = urlsplit(str(request.url))
            if (url.hostname or '').lower() != self.host:
                return
            kind = str(request.resource_type or '').lower()
            method = str(request.method or '').upper()
            if kind not in ('xhr', 'fetch') and method != 'POST':
                return
            if len(self._requests) >= 50:
                return
            # Keep the original URL-encoded query to detect duplicate keys.
            # Turning it into a dict silently discards competing from/to values.
            query = url.query
            body = request.post_data or ''
            fields = [query, body]
            sns = [_clean(value) for source in fields
                   for value in _wire_values(source, _WIRE_3012_ALIASES['sn'])]
            named_sns = {value for value in sns if value}
            exact_sn = bool(self.sn and named_sns == {self.sn})
            inspected = [('url', _wire_request_dates(query)),
                         ('body', _wire_request_dates(body))]
            valid_periods = set(pair for _, (_, _, pairs) in inspected for pair in pairs)
            # Two competing submitted periods cannot certify which one the
            # server applied. Nor can a complete URL period certify a POST
            # carrying unrecognizable/empty dates. Retain only a safe bit.
            incomplete_sources = [location for location, (left, right, pairs) in inspected
                                  if (left != ['absent'] or right != ['absent']) and not pairs]
            conflict = len(valid_periods) > 1 or bool(valid_periods and incomplete_sources)
            exact_period = ((self.expected['from'], self.expected['to']) in valid_periods
                            and not conflict)
            date_shapes = [f'{location}:{field}={"+".join(shapes)}'
                           for location, (from_shapes, to_shapes, _) in inspected
                           for field, shapes in (('from', from_shapes), ('to', to_shapes))]
            hints = set()
            for field in fields:
                hints.update(_wire_date_hints(field))
            self._requests[request] = {
                'exact_sn': exact_sn,
                'date_pair': bool(valid_periods),
                'exact_period': exact_period,
                'ambiguous_period': conflict,
                'date_shapes': date_shapes,
                'date_field_hints': sorted(hints)[:12],
                'from_text': _wire_expected_day_in_payload(fields, self.expected['from']),
                'to_text': _wire_expected_day_in_payload(fields, self.expected['to']),
                'finished': False,
                'failed': False,
                'response_ok': False,
            }
        except Exception:
            # Diagnostic must never interfere with the live MES query.
            return

    def on_finished(self, request):
        if request in self._requests:
            self._requests[request]['finished'] = True

    def on_failed(self, request):
        if request in self._requests:
            self._requests[request]['failed'] = True

    def on_response(self, response):
        request = response.request
        if request in self._requests:
            self._requests[request]['response_ok'] = 200 <= int(response.status) < 300

    def confirmed(self) -> bool:
        return any(row['exact_sn'] and row['date_pair'] and row['exact_period']
                   and row['finished'] and row['response_ok'] and not row['failed']
                   for row in self._requests.values())

    def counters(self) -> Dict[str, Any]:
        rows = list(self._requests.values())
        exact_sn_rows = [r for r in rows if r['exact_sn']]
        return {'http': len(rows),
                'sn': sum(bool(r['exact_sn']) for r in rows),
                'dates': sum(bool(r['date_pair']) for r in rows),
                'period': sum(bool(r['exact_sn'] and r['date_pair'] and r['exact_period']) for r in rows),
                'finished': sum(bool(r['finished']) for r in rows),
                'http_ok': sum(bool(r['response_ok']) for r in rows),
                'date_keys': sorted({key for r in exact_sn_rows for key in r['date_field_hints']})[:12],
                'from_text': int(any(r['from_text'] for r in exact_sn_rows)),
                'to_text': int(any(r['to_text'] for r in exact_sn_rows)),
                'ambiguous': sum(bool(r['ambiguous_period']) for r in exact_sn_rows),
                'date_shapes': sorted({shape for r in exact_sn_rows for shape in r['date_shapes']})[:8]}


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


def _verified_checkpoint(loaded: Dict[str, Any] | None) -> Dict[str, Any]:
    """A prior 'done' without query proof must never skip an MES request."""
    fresh = {"contract": CHECKPOINT_CONTRACT, "done": [], "rows": [], "chunks": []}
    if not isinstance(loaded, dict) or loaded.get("contract") != CHECKPOINT_CONTRACT:
        return fresh
    done = set(loaded.get("done") or [])
    if not done and (loaded.get("rows") or loaded.get("chunks")):
        return fresh
    verified = []
    for item in loaded.get("chunks") or []:
        if not isinstance(item, dict):
            continue
        proof = item.get("query_proof") or {}
        if (proof.get("periodVerified") is True and proof.get("contract") == QUERY_CONTRACT
                and proof.get("freshness") and proof.get("actualWindow") == proof.get("requestedWindow")
                and proof.get("actualWindow") == {"from": item.get("from"), "to": item.get("to")}
                and item.get("key") in done):
            verified.append(item)
    if len(verified) != len(done) or {item["key"] for item in verified} != done:
        return fresh
    return {**loaded, "done": sorted(done), "chunks": verified}


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
    checkpoint=_verified_checkpoint(None)
    if checkpoint_path and checkpoint_path.exists():
        try:
            loaded=json.loads(checkpoint_path.read_text(encoding="utf-8"))
            checkpoint=_verified_checkpoint(loaded)
        except Exception:
            checkpoint=_verified_checkpoint(None)
    # The old checkpoint is left untouched until a verified fresh query saves
    # a replacement; neither false 'done' keys nor unproved rows are reused.
    done=set(checkpoint.get("done") or []);records=[dict(x) for x in checkpoint.get("rows") or []]
    diagnostics=[{key:value for key,value in item.items() if key!="key"} for item in checkpoint["chunks"]]

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
                     "dateTo":chunk_end.strftime("%Y-%m-%d"),"timeTo":chunk_end.strftime("%H:%M"),
                     "allowWirePeriodProof":True}
                expected={"from":cfg["dateFrom"]+" "+cfg["timeFrom"],"to":cfg["dateTo"]+" "+cfg["timeTo"]}
                # Ext.NET can send the View request outside the grid store or
                # Ext.Ajax options. Read the actual Playwright HTTP request
                # passively, without routing, patching XHR or storing its body.
                wire=Wire3012Probe(ames_host,sn,expected)
                handlers=(("request",wire.on_request),
                          ("response",wire.on_response),
                          ("requestfinished",wire.on_finished),
                          ("requestfailed",wire.on_failed))
                for event,handler in handlers:
                    page.on(event,handler)
                try:
                    raw=page.evaluate(QUERY_3012_JS,cfg)
                finally:
                    for event,handler in handlers:
                        try:
                            page.remove_listener(event,handler)
                        except AttributeError:
                            try:
                                page.off(event,handler)
                            except Exception:
                                pass
                        except Exception:
                            pass
                normalized=[normalize_3012_row(r) for r in (raw.get("records") or [])]
                if sn and any(sn not in (r.get('pcba_sn'),r.get('imei')) for r in normalized):
                    raise RuntimeError('3012 retornou outra SN; filtros/grade nao confirmados')
                proof=dict(raw.get("queryProof") or {})
                if wire.confirmed() and proof.get('freshness') in (
                        'STORE_LOAD_CONFIRMED','STORE_DATASET_EVENT'):
                    proof.update(periodVerified=True,periodSource='playwright_http_finished',
                                 actualWindow=expected,wire_counters=wire.counters())
                else:
                    # Ext.Ajax/store observations are useful diagnostics, not
                    # the same as a completed outbound HTTP request with the
                    # exact SN and period. Do not promote their provisional
                    # `periodVerified` flag into trusted SQLite coverage.
                    proof.update(periodVerified=False,periodSource='http_period_unconfirmed',
                                 actualWindow={'from':'','to':''})
                if (proof.get("contract")!=QUERY_CONTRACT or not proof.get("freshness")
                        or proof.get("periodVerified") is not True
                        or proof.get("actualWindow")!=expected or proof.get("requestedWindow")!=expected):
                    counts=wire.counters()
                    # Counts only: the diagnostic never includes request body,
                    # URL, cookies, form values or credentials.
                    date_keys=','.join(counts['date_keys'])[:76] or 'nenhum'
                    shapes=';'.join(counts['date_shapes'])[:160] or 'nenhum'
                    raise RuntimeError(
                        f"3012_QUERY_PERIOD_MISMATCH: HTTP={counts['http']} SN={counts['sn']} "
                        f"OK={counts['http_ok']} datas={counts['dates']} janela={counts['period']} "
                        f"texto={counts['from_text']}/{counts['to_text']} ambig={counts['ambiguous']} "
                        f"formatos=[{shapes}] chaves=[{date_keys}]; "
                        f"esperado {expected['from']} -> {expected['to']}")
                records.extend(normalized);done.add(chunk_key)
                item={"key":chunk_key,"sn":sn,"from":expected["from"],"to":expected["to"],"rows":len(normalized),
                                    "total":raw.get("total"),"pages":raw.get("pages"),"fields":raw.get("storeFields"),"applied":raw.get("applied"),"surface":"home",
                                    "view_action":raw.get("viewAction"),"query_proof":proof,"proxy_params":raw.get("proxyParams")}
                diagnostics.append({key:value for key,value in item.items() if key!="key"})
                checkpoint.setdefault("chunks",[]).append(item)
                if checkpoint_path:
                    checkpoint_path.parent.mkdir(parents=True,exist_ok=True)
                    checkpoint_path.write_text(json.dumps({"contract":CHECKPOINT_CONTRACT,"done":sorted(done),"rows":records,"chunks":checkpoint["chunks"],"updated_at":datetime.now().isoformat(timespec="seconds")},ensure_ascii=False,indent=2,default=str),encoding="utf-8")

    unique={}
    for row in records:unique[row["row_key"]]=row
    rows=list(unique.values());rows.sort(key=lambda r:str(r.get("defect_time") or ""),reverse=True)
    return {"source":SOURCE_3012,"contract":QUERY_CONTRACT,"surface":"home","view":ROUTE_3012,"generated_at":datetime.now().isoformat(timespec="seconds"),
            "query":{"sns":targets,"start_at":start.isoformat(timespec="minutes"),"end_at":end.isoformat(timespec="minutes"),"line":line,"model":model,
                     "defect_code":defect_code,"repair_code":repair_code,"defect_type":defect_type,"chunk_days":chunk_days},
            "rows":rows,"records_count":len(rows),"chunks":diagnostics}
