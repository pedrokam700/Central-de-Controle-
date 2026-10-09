import { LINE_IDS } from './data/contract.mjs';
import { selectDashboard } from './data/dashboard.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v===null||v===undefined?'—':String(v);

export function createLineOverview(root,store,client){
  let line=LINE_IDS[0],last='';
  const metric=(model,name)=>model.aggregates.find(x=>x.name===name)?.value??null;
  function render(){
    const models=LINE_IDS.map(id=>selectDashboard(store,{line_id:id}));
    const key=JSON.stringify([line,...models.map(m=>[m.snapshot?.snapshot_id,m.source,m.freshness,m.sample_metric?.value]),store.agent().status,store.agent().job?.id,store.agent().job?.status]);
    if(key===last)return;last=key;const model=models.find(m=>m.scope.line_id===line)||models[0];
    root.innerHTML=`<section class="mes-context-panel"><div class="section-head"><div><h2>Central das Linhas</h2><p>As três linhas continuam isoladas. Selecione uma para ver o resumo sem empilhar três painéis grandes.</p></div><div class="mes-pagination"><button class="button secondary" data-line-all${store.agent().status==='connected'?'':' disabled'}>Atualizar todas as linhas</button><button class="button secondary" data-line-refresh${store.agent().status==='connected'?'':' disabled'}>Atualizar tela</button></div></div><div class="mes-pagination">${LINE_IDS.map((id,i)=>`<button class="button ${id===line?'primary':'secondary'}" data-line-tab="${id}">Linha ${i+1} · ${id}</button>`).join('')}</div><div class="ames-summary-grid" style="margin-top:12px"><div class="stat"><span class="stat-label">FPY</span><strong class="stat-value">${esc(number(metric(model,'fpy')))}${metric(model,'fpy')===null?'':'%'}</strong></div><div class="stat"><span class="stat-label">Check FPY</span><strong class="stat-value">${esc(number(metric(model,'check_fpy')))}${metric(model,'check_fpy')===null?'':'%'}</strong></div><div class="stat"><span class="stat-label">Quantity</span><strong class="stat-value">${esc(number(metric(model,'quantity')))}</strong></div><div class="stat"><span class="stat-label">Falhas carregadas</span><strong class="stat-value">${esc(number(model.sample_metric?.value))}</strong></div><div class="stat"><span class="stat-label">Snapshot</span><strong class="stat-value" style="font-size:13px">${esc(model.snapshot?.snapshot_id||'—')}</strong></div><div class="stat"><span class="stat-label">Origem</span><strong class="stat-value" style="font-size:13px">${esc(model.source||'none')}</strong></div></div><div class="mes-pagination"><button class="button secondary" data-line-one${store.agent().status==='connected'?'':' disabled'}>Atualizar esta linha</button></div></section>`;
    for(const b of root.querySelectorAll('[data-line-tab]'))b.addEventListener('click',()=>{line=b.dataset.lineTab;last='';render();});
    root.querySelector('[data-line-refresh]')?.addEventListener('click',()=>client.refresh().catch(e=>store.updateAgent({error:e.message})));
    root.querySelector('[data-line-one]')?.addEventListener('click',()=>client.collect('today',{lines:[line],performance:store.agent().config?.performance||'balanced',max_failures:0,max_pcbas:0,defect_codes:[]}).catch(e=>store.updateAgent({error:e.message})));
    root.querySelector('[data-line-all]')?.addEventListener('click',()=>client.collect('today',{lines:[...LINE_IDS],performance:store.agent().config?.performance||'balanced',max_failures:0,max_pcbas:0,defect_codes:[]}).catch(e=>store.updateAgent({error:e.message})));
  }
  return {render,clear(){root?.replaceChildren();last='';}};
}

export function createTrendAddon(root,store,client){
  let line=LINE_IDS[0],rows=[],message='';
  function paint(){
    root.innerHTML=`<section class="mes-context-panel"><div class="section-head"><div><h3>Evolução por snapshots</h3><p>Mesma evolução da automação local, usando os snapshots salvos no agente.</p></div></div><div class="mes-filters"><label>Linha<select data-trend-line>${LINE_IDS.map((id,i)=>`<option value="${id}"${id===line?' selected':''}>Linha ${i+1} · ${id}</option>`).join('')}</select></label></div><button class="button secondary" data-trend-refresh${store.agent().status==='connected'?'':' disabled'}>Atualizar evolução</button>${message?`<p>${esc(message)}</p>`:''}${rows.length?`<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Snapshot</th><th>Coleta</th><th>Linha</th><th>FPY</th><th>Check FPY</th><th>Quantity</th><th>Falhas</th><th>Repair N</th><th>Top 3</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.snapshot_id)}</td><td>${esc(r.collected_at)}</td><td>${esc(r.line)}</td><td>${esc(number(r.fpy))}</td><td>${esc(number(r.check_fpy))}</td><td>${esc(number(r.quantity))}</td><td>${esc(number(r.defect_rows))}</td><td>${esc(number(r.repair_n))}</td><td>${esc((r.top3||[]).map((x,i)=>`${i+1}. ${x.defect_code||''} (${x.qty??0})`).join(' · '))}</td></tr>`).join('')}</tbody></table></div>`:''}</section>`;
    root.querySelector('[data-trend-line]')?.addEventListener('change',e=>{line=e.target.value;rows=[];message='';paint();});
    root.querySelector('[data-trend-refresh]')?.addEventListener('click',async()=>{message='Carregando evolução...';paint();try{const r=await client.auxiliary('trends',{line,limit:80});rows=r.rows||[];message=rows.length?'':'Ainda não há snapshots suficientes nesta janela.';}catch(e){message=e.message;rows=[];}paint();});
  }
  return {render:paint,clear(){root?.replaceChildren();rows=[];message='';}};
}

export function createFailuresParityView(root,store,client){
  let line=LINE_IDS[0],q='',status='';
  function render(){
    const read=store.read(line),rows=[...(read.snapshot?.occurrences||[])];
    const needle=q.trim().toLowerCase();
    const filtered=rows.filter(r=>{
      const removed=r.present_in_3028===false;
      const s=String(r.repair_status||'').toUpperCase();
      const statusOk=!status||(status==='REMOVED'?removed:status==='N'?(s==='N'||s==='OPEN'):status==='Y'?(s==='Y'||s==='CLOSED'||s==='FINALIZADO'):true);
      const text=[r.pcba_sn,r.defect_code,r.defect_desc,r.repair_comment,r.product_model].join(' ').toLowerCase();
      return statusOk&&(!needle||text.includes(needle));
    });
    root.innerHTML=`<section class="mes-context-panel"><div class="mes-filters"><label>Linha<select data-failure-line>${LINE_IDS.map((id,i)=>`<option value="${id}"${id===line?' selected':''}>Linha ${i+1} · ${id}</option>`).join('')}</select></label><label>Pesquisar<input data-failure-search value="${esc(q)}" placeholder="SN, código ou descrição"></label><label>Status<select data-failure-status><option value=""${!status?' selected':''}>Todos os estados</option><option value="N"${status==='N'?' selected':''}>Repair N</option><option value="Y"${status==='Y'?' selected':''}>Repair Y</option><option value="REMOVED"${status==='REMOVED'?' selected':''}>Removida do export</option></select></label></div><div class="mes-pagination"><button class="button secondary" data-failure-reload${store.agent().status==='connected'?'':' disabled'}>Recarregar</button><span>${filtered.length} registro(s) nesta leitura · ${esc(read.source)}</span></div></section>${filtered.length?`<div class="table-wrap"><table><thead><tr><th>Linha</th><th>PCBA</th><th>Defect Time</th><th>Código</th><th>Falha</th><th>CPH</th><th>Status</th><th>Defect Type</th></tr></thead><tbody>${filtered.slice(0,2500).map(r=>`<tr><td>${esc(r.line_id)}</td><td>${esc(r.pcba_sn)}</td><td>${esc(r.defect_time)}</td><td>${esc(r.defect_code)}</td><td>${esc(r.defect_desc)}</td><td>${esc(r.product_model)}</td><td>${esc(r.repair_status)}</td><td>${esc(r.defect_type)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="mes-context-panel"><p>Nenhum registro para os filtros. Ausência na lista parcial não significa ausência de falha.</p></div>'}`;
    root.querySelector('[data-failure-line]').addEventListener('change',e=>{line=e.target.value;render();});
    root.querySelector('[data-failure-status]').addEventListener('change',e=>{status=e.target.value;render();});
    root.querySelector('[data-failure-search]').addEventListener('input',e=>{q=e.target.value;});
    root.querySelector('[data-failure-search]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();q=e.target.value;render();}});
    root.querySelector('[data-failure-search]').addEventListener('change',e=>{q=e.target.value;render();});
    root.querySelector('[data-failure-reload]')?.addEventListener('click',()=>client.refresh().catch(e=>store.updateAgent({error:e.message})));
  }
  return {render,clear(){root?.replaceChildren();}};
}

