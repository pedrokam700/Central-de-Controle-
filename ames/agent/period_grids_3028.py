"""Page programs for reconciled 3028 periods. The sealed CLEAN V3 reader remains available. """

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

READ_MODELS = _SCOPED_STORES + r"""  const result=[];
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
