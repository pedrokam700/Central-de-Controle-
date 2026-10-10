import { LINE_IDS } from './data/contract.mjs';
import { selectDashboard } from './data/dashboard.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v===null||v===undefined?'—':String(v);
const pct=v=>v===null||v===undefined?'—':`${v}%`;
const lineOptions=(selected)=>LINE_IDS.map((id,i)=>`<option value="${id}"${id===selected?' selected':''}>Linha ${i+1} · ${id}</option>`).join('');

export function createLineOverview(root,store,client){
  let line=LINE_IDS[0],last='';
  const metric=(model,name)=>model.aggregates.find(x=>x.name===name)?.value??null;
  function render(){
    const models=LINE_IDS.map(id=>selectDashboard(store,{line_id:id}));
    const key=JSON.stringify([line,...models.map(m=>[m.snapshot?.snapshot_id,m.source,m.freshness,m.sample_metric?.value]),store.agent().status,store.agent().job?.id,store.agent().job?.status]);
    if(key===last)return;last=key;const model=models.find(m=>m.scope.line_id===line)||models[0];
    root.innerHTML=`<section class="mes-context-panel ames-line-center"><div class="section-head"><div><h2>Central das Linhas</h2><p>Uma linha por vez, sem misturar snapshots ou ocorrências.</p></div><div class="mes-pagination"><button class="button secondary" data-line-all${store.agent().status==='connected'?'':' disabled'}>Atualizar todas</button><button class="button secondary" data-line-refresh${store.agent().status==='connected'?'':' disabled'}>Atualizar leitura</button></div></div><div class="ames-line-tabs">${LINE_IDS.map((id,i)=>`<button class="button ${id===line?'primary':'secondary'}" data-line-tab="${id}">Linha ${i+1} · ${id}</button>`).join('')}</div><div class="ames-summary-grid ames-line-summary"><div class="stat"><span class="stat-label">FPY</span><strong class="stat-value">${esc(pct(metric(model,'fpy')))}</strong></div><div class="stat"><span class="stat-label">Check FPY</span><strong class="stat-value">${esc(pct(metric(model,'check_fpy')))}</strong></div><div class="stat"><span class="stat-label">Quantity</span><strong class="stat-value">${esc(number(metric(model,'quantity')))}</strong></div><div class="stat"><span class="stat-label">Falhas</span><strong class="stat-value">${esc(number(model.sample_metric?.value))}</strong></div><div class="stat"><span class="stat-label">Snapshot</span><strong class="stat-value ames-small-value">${esc(model.snapshot?.snapshot_id||'—')}</strong></div><div class="stat"><span class="stat-label">Origem</span><strong class="stat-value ames-small-value">${esc(model.source||'none')}</strong></div></div><div class="mes-pagination"><button class="button secondary" data-line-one${store.agent().status==='connected'?'':' disabled'}>Atualizar esta linha</button></div></section>`;
    for(const b of root.querySelectorAll('[data-line-tab]'))b.addEventListener('click',()=>{line=b.dataset.lineTab;last='';render();});
    root.querySelector('[data-line-refresh]')?.addEventListener('click',()=>client.refresh().catch(e=>store.updateAgent({error:e.message})));
    root.querySelector('[data-line-one]')?.addEventListener('click',()=>client.collect('today',{lines:[line],performance:store.agent().config?.performance||'balanced',max_failures:0,max_pcbas:0,defect_codes:[]}).catch(e=>store.updateAgent({error:e.message})));
    root.querySelector('[data-line-all]')?.addEventListener('click',()=>client.collect('today',{lines:[...LINE_IDS],performance:store.agent().config?.performance||'balanced',max_failures:0,max_pcbas:0,defect_codes:[]}).catch(e=>store.updateAgent({error:e.message})));
  }
  return {render,clear(){root?.replaceChildren();last='';}};
}

export function createTop3ParityView(root,store){
  let line=LINE_IDS[0],product='',defect='',last='';
  const metric=(model,name)=>model.aggregates.find(x=>x.name===name)?.value??null;
  function render(){
    const model=selectDashboard(store,{line_id:line,product:product||undefined,defect_code:defect||undefined});
    const key=JSON.stringify([line,product,defect,model.snapshot?.snapshot_id,model.rows,model.aggregates]);if(key===last)return;last=key;
    const products=model.products||[],defects=model.defects||[],top=model.pareto||[];
    const open=model.rows.filter(r=>['N','OPEN'].includes(String(r.repair_status||'').toUpperCase())).length;
    root.innerHTML=`<section class="ames-top3-head"><div class="mes-filters"><label>Linha<select data-top3-line>${lineOptions(line)}</select></label><label>CPH exato<select data-top3-product><option value="">Todos os modelos</option>${products.map(v=>`<option value="${esc(v)}"${v===product?' selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Defect Code<select data-top3-defect><option value="">Todos os códigos</option>${defects.map(v=>`<option value="${esc(v)}"${v===defect?' selected':''}>${esc(v||'Não informado')}</option>`).join('')}</select></label></div></section>
    <section class="ames-top3-grid"><article class="ames-top3-kpis"><div class="ames-summary-grid"><div class="stat"><span class="stat-label">FPY</span><strong class="stat-value">${esc(pct(metric(model,'fpy')))}</strong></div><div class="stat"><span class="stat-label">Check FPY</span><strong class="stat-value">${esc(pct(metric(model,'check_fpy')))}</strong></div><div class="stat"><span class="stat-label">Quantity</span><strong class="stat-value">${esc(number(metric(model,'quantity')))}</strong></div><div class="stat"><span class="stat-label">Ocorrências</span><strong class="stat-value">${esc(number(model.sample_metric?.value))}</strong></div></div><div class="ames-top3-meta"><span>${esc(line)}</span><span>${esc(model.snapshot?.collected_at||'Coleta não informada')}</span><span>${esc(model.snapshot?.snapshot_id||'Sem snapshot')}</span><span>${open} Repair N/Open</span></div></article>
    <article class="mes-context-panel ames-top3-panel"><div class="section-head"><div><h3>Top 3 defeitos</h3><p>Ranking da lista carregada nesta linha e filtro.</p></div></div>${top.length?`<div class="ames-top3-list">${top.slice(0,3).map((item,i)=>`<button type="button" data-top3-code="${esc(item.code)}" class="ames-top3-item"><span class="ames-rank">${i+1}</span><span><b>${esc(item.code||'Código não informado')}</b><small>${esc(item.description||'')}</small></span><strong>${esc(number(item.count))}</strong></button>`).join('')}</div>`:'<p>Nenhuma ocorrência disponível neste escopo.</p>'}</article></section>
    <section class="mes-context-panel"><div class="section-head"><div><h3>Ocorrências da leitura</h3><p>${esc(model.rows.length)} registro(s) disponíveis. Clique no Top 3 para filtrar rapidamente.</p></div><button type="button" class="button secondary" data-top3-clear>Limpar filtro</button></div>${model.rows.length?`<div class="table-wrap"><table><thead><tr><th>PCBA</th><th>Defect Time</th><th>Código</th><th>Descrição</th><th>CPH</th><th>Repair</th><th>Log</th></tr></thead><tbody>${model.rows.slice(0,800).map(r=>`<tr><td>${esc(r.pcba_sn)}</td><td>${esc(r.defect_time)}</td><td>${esc(r.defect_code)}</td><td>${esc(r.defect_desc)}</td><td>${esc(r.product_model)}</td><td>${esc(r.repair_status)}</td><td>${esc(r.registration_mode||r['Manual/Automatic']||'')}</td></tr>`).join('')}</tbody></table></div>`:'<p>Nenhum registro carregado para esta combinação.</p>'}</section>`;
    root.querySelector('[data-top3-line]')?.addEventListener('change',e=>{line=e.target.value;product='';defect='';last='';render();});
    root.querySelector('[data-top3-product]')?.addEventListener('change',e=>{product=e.target.value;defect='';last='';render();});
    root.querySelector('[data-top3-defect]')?.addEventListener('change',e=>{defect=e.target.value;last='';render();});
    root.querySelector('[data-top3-clear]')?.addEventListener('click',()=>{product='';defect='';last='';render();});
    for(const b of root.querySelectorAll('[data-top3-code]'))b.addEventListener('click',()=>{defect=b.dataset.top3Code;last='';render();});
  }
  return {render,clear(){root?.replaceChildren();last='';}};
}

export function createTrendAddon(root,store,client){
  let line=LINE_IDS[0],rows=[],message='';
  function paint(){
    root.innerHTML=`<section class="mes-context-panel"><div class="section-head"><div><h3>Evolução do dia</h3><p>Snapshots salvos pelo agente para a linha selecionada.</p></div><div class="mes-pagination"><select data-trend-line>${lineOptions(line)}</select><button class="button secondary" data-trend-refresh${store.agent().status==='connected'?'':' disabled'}>Atualizar evolução</button></div></div>${message?`<p>${esc(message)}</p>`:''}${rows.length?`<div class="table-wrap"><table><thead><tr><th>Coleta</th><th>FPY</th><th>Check FPY</th><th>Quantity</th><th>Falhas</th><th>Repair N</th><th>Top 3</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.collected_at)}</td><td>${esc(number(r.fpy))}</td><td>${esc(number(r.check_fpy))}</td><td>${esc(number(r.quantity))}</td><td>${esc(number(r.defect_rows))}</td><td>${esc(number(r.repair_n))}</td><td>${esc((r.top3||[]).map((x,i)=>`${i+1}. ${x.defect_code||''} (${x.qty??0})`).join(' · '))}</td></tr>`).join('')}</tbody></table></div>`:'<p>Ainda não há evolução carregada nesta sessão.</p>'}</section>`;
    root.querySelector('[data-trend-line]')?.addEventListener('change',e=>{line=e.target.value;rows=[];message='';paint();});
    root.querySelector('[data-trend-refresh]')?.addEventListener('click',async()=>{message='Carregando evolução...';paint();try{const r=await client.auxiliary('trends',{line,limit:80});rows=r.rows||[];message=rows.length?'':'Ainda não há snapshots suficientes nesta janela.';}catch(e){message=e.message;rows=[];}paint();});
  }
  return {render:paint,clear(){root?.replaceChildren();rows=[];message='';}};
}

export function createFailuresParityView(root,store,client){
  let line=LINE_IDS[0],q='',status='',last='',lastSnapshot=null;
  function render(){
    const read=store.read(line),snapshot=read.snapshot,currentRows=[...(snapshot?.occurrences||[])],removedRows=[...(snapshot?.removed_occurrences||[])],rows=[...currentRows,...removedRows];
    const needle=q.trim().toLowerCase();
    const filtered=rows.filter(r=>{const removed=r.present_in_3028===false,s=String(r.repair_status||'').toUpperCase();const statusOk=!status||(status==='REMOVED'?removed:status==='N'?!removed&&(s==='N'||s==='OPEN'):status==='Y'?!removed&&(s==='Y'||s==='CLOSED'||s==='FINALIZADO'):true);const text=[r.pcba_sn,r.defect_code,r.defect_desc,r.repair_comment,r.repair_user,r.defect_type,r.product_model].join(' ').toLowerCase();return statusOk&&(!needle||text.includes(needle));});
    const key=JSON.stringify([line,q,status,store.agent().status]);if(key===last&&snapshot===lastSnapshot)return;last=key;lastSnapshot=snapshot;
    const nCount=currentRows.filter(r=>['N','OPEN'].includes(String(r.repair_status||'').toUpperCase())).length,yCount=currentRows.filter(r=>['Y','CLOSED','FINALIZADO'].includes(String(r.repair_status||'').toUpperCase())).length,removedCount=removedRows.length;
    root.innerHTML=`<section class="mes-context-panel ames-failure-toolbar"><div class="mes-filters"><label>Linha<select data-failure-line>${lineOptions(line)}</select></label><label>Pesquisar<input data-failure-search value="${esc(q)}" placeholder="SN, código, descrição, reparo..."></label><label>Status<select data-failure-status><option value=""${!status?' selected':''}>Todos os estados</option><option value="N"${status==='N'?' selected':''}>Repair N</option><option value="Y"${status==='Y'?' selected':''}>Repair Y</option><option value="REMOVED"${status==='REMOVED'?' selected':''}>Removida do export</option></select></label></div><div class="ames-failure-summary"><span><b>${currentRows.length}</b> atuais</span><span><b>${nCount}</b> Repair N</span><span><b>${yCount}</b> Repair Y</span><span><b>${removedCount}</b> removidas</span><span>${esc(snapshot?.snapshot_id||'sem snapshot')}</span><button class="button secondary" data-failure-reload${store.agent().status==='connected'?'':' disabled'}>Recarregar</button></div></section>${filtered.length?`<div class="table-wrap ames-failures-table"><table><thead><tr><th>Presença</th><th>Linha</th><th>PCBA</th><th>Defect Time</th><th>Código</th><th>Falha</th><th>CPH</th><th>Repair</th><th>Log</th><th>Defect Type</th><th>Comentário</th></tr></thead><tbody>${filtered.slice(0,2500).map(r=>`<tr><td>${r.present_in_3028===false?'Removida do export':'Atual'}</td><td>${esc(r.line_id||line)}</td><td>${esc(r.pcba_sn)}</td><td>${esc(r.defect_time)}</td><td><b>${esc(r.defect_code)}</b></td><td>${esc(r.defect_desc)}</td><td>${esc(r.product_model)}</td><td>${esc(r.repair_status)}</td><td>${esc(r.registration_mode||r['Manual/Automatic']||'')}</td><td>${esc(r.defect_type)}</td><td>${esc(r.repair_comment)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="mes-context-panel"><p>Nenhum registro para os filtros. Ausência na lista parcial não significa ausência de falha.</p></div>'}`;
    root.querySelector('[data-failure-line]')?.addEventListener('change',e=>{line=e.target.value;last='';lastSnapshot=null;render();});
    root.querySelector('[data-failure-status]')?.addEventListener('change',e=>{status=e.target.value;last='';render();});
    root.querySelector('[data-failure-search]')?.addEventListener('input',e=>{q=e.target.value;});
    root.querySelector('[data-failure-search]')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();q=e.target.value;last='';render();}});
    root.querySelector('[data-failure-search]')?.addEventListener('change',e=>{q=e.target.value;last='';render();});
    root.querySelector('[data-failure-reload]')?.addEventListener('click',()=>client.refresh().catch(e=>store.updateAgent({error:e.message})));
  }
  return {render,clear(){root?.replaceChildren();last='';lastSnapshot=null;}};
}
