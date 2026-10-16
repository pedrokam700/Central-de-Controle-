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
