import { AGENT_URL } from './data/agent-contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const TOKEN_KEY='central.ames.agentToken.v1';
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
function token(){try{return window.sessionStorage?.getItem(TOKEN_KEY)||'';}catch{return '';}}
async function localLookup(sn){
  const headers={};const auth=token();if(auth)headers['X-Central-Agent-Token']=auth;
  const response=await fetch(AGENT_URL+'/local/sn?'+new URLSearchParams({sn,limit:'10000'}),{headers,cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(response.status===401)throw new Error('Abra a Central pelo launcher deste posto para acessar a base local.');
  if(!response.ok)throw new Error(data.message||data.error||`HTTP ${response.status}`);
  return data;
}
function table(rows,cols,empty){if(!rows?.length)return `<div class="ames-empty"><span>—</span><p>${esc(empty)}</p></div>`;return `<div class="table-wrap ames-fastlane-table"><table><thead><tr>${cols.map(([,label])=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,1000).map(row=>`<tr>${cols.map(([key])=>`<td>${esc(fmt(row?.[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function friendlyError(message){
  const raw=String(message||'').trim(),low=raw.toLowerCase();
  if(!raw)return '';
  if(low.includes('2114')&&(low.includes('shift')||low.includes('turno')||low.includes('unconfirmed')||low.includes('não confirmado')))return '2114 indisponível nesta consulta · turno não confirmado. As demais fontes e o cache local continuam válidos quando houver evidência.';
  if(low.includes('timeout')||low.includes('timed out'))return 'Uma fonte A-MES excedeu o tempo de resposta. Preserve os resultados das demais fontes e tente atualizar somente a fonte pendente.';
  if(/traceback|runtimeerror|typeerror|playwright|locator|extjs/i.test(raw))return 'Uma fonte A-MES falhou tecnicamente nesta consulta. O detalhe interno foi preservado no diagnóstico do agente; a investigação continua com as fontes disponíveis.';
  return raw.length>220?raw.slice(0,217)+'…':raw;
}
function traceState(trace){
  if(!trace)return {kind:'unknown',label:'Não disponível'};
  const state=String(trace.status||trace.state||'').toLowerCase();
  const error=trace.error||trace.reason;
  if(state==='error'||state==='failed'||error)return {kind:'bad',label:'Erro'};
  if(state==='partial')return {kind:'warn',label:'Parcial'};
  return {kind:'ok',label:'Disponível'};
}
function has3012(result){
  const current=result?.trace_2114?.current_failure||{},prior=result?.trace_2114?.previous_failures||[],reuse=result?.trace_3074?.reused_components||[];
  return Boolean(current.repair_evidence_3012?.length||prior.some(x=>x.repair_evidence_3012?.length)||reuse.some(x=>(x.previous_pcba_evidence||[]).some(e=>e.repair_evidence_3012?.length))||result?.local_snapshot?.repair_3012?.length);
}
function renderLiveSources(root,store){
  root.querySelector('[data-sn-source-health]')?.remove();
  const agent=store.agent(),result=agent.resultSource==='sn'?agent.job?.result:null;
  const status=root.querySelector('[data-sn-status]');if(!status)return;
  const section=document.createElement('div');section.dataset.snSourceHealth='1';section.className='ames-local-coverage ames-sn-source-health';
  const s3074=traceState(result?.trace_3074),s2114=traceState(result?.trace_2114),s3022=traceState(result?.trace_3022);
  const states=result?[
    ['3028',result.local_snapshot?'ok':'unknown',result.local_snapshot?'Cache/snapshot local':'Não consultado neste fluxo'],
    ['3074',s3074.kind,s3074.label],['2114',s2114.kind,s2114.label],['3022',s3022.kind,s3022.label],
    ['3012',has3012(result)?'ok':'unknown',has3012(result)?'Evidência/cache':'Não comprovado']
  ]:[['3028','unknown','Aguardando'],['3074','unknown','Aguardando'],['2114','unknown','Aguardando'],['3022','unknown','Aguardando'],['3012','unknown','Aguardando']];
  section.innerHTML=states.map(([name,kind,label])=>`<span class="status ${kind==='ok'?'ok':kind==='bad'?'bad':kind==='warn'?'warn':''}">${name} · ${esc(label)}</span>`).join('');
  status.after(section);
  if(agent.error&&!result){const text=friendlyError(agent.error);status.innerHTML=`<b>Consulta parcial / fonte indisponível</b><span>${esc(text)}</span>`;}
}
function renderLocal(root,result,error=''){
  root.querySelector('[data-sn-local-result]')?.remove();if(!result&&!error)return;
  const section=document.createElement('section');section.dataset.snLocalResult='1';section.className='mes-context-panel ames-fastlane-panel ames-local-sn-result';
  if(error){section.innerHTML=`<div class="section-head"><div><h3>Base local</h3><p>Consulta offline do posto.</p></div><span class="status bad">ERRO</span></div><div class="notice warn">${esc(friendlyError(error))}</div>`;root.append(section);return;}
  const s=result.summary||{},coverage=result.coverage||{};
  section.innerHTML=`<div class="section-head"><div><h3>Consulta offline · base local</h3><p>Resultado somente do SQLite deste posto. Nenhuma chamada ao A-MES ou à nuvem foi feita.</p></div><span class="status ok">LOCAL</span></div>
    <div class="ames-fastlane-kpis"><div><small>PCBAs relacionadas</small><b>${esc(fmt(s.pcbas_related))}</b></div><div><small>Histórico 2114</small><b>${esc(fmt(s.history_2114))}</b></div><div><small>Processos 3022</small><b>${esc(fmt(s.process_3022))}</b></div><div><small>Reparos 3012</small><b>${esc(fmt(s.repair_3012))}</b></div></div>
    <div class="ames-local-coverage">${['3028','3074','2114','3022','3012'].map(k=>`<span class="status ${coverage[k]?'ok':''}">${k} · ${coverage[k]?'evidência local':'não comprovado no cache'}</span>`).join('')}</div>
    <h4>3012 · reparo / análise</h4>${table(result.repair_3012,[['pcba_sn','PCBA'],['defect_time','Defect Time'],['defect_code','Defect Code'],['defect_desc','Falha'],['repair_user','Repair User'],['repair_time','Repair Time'],['repair_code','Repair Code'],['repair_comment','Repair Comment']], 'Nenhuma evidência 3012 armazenada para esta SN.')}
    <h4>2114 · histórico de falhas</h4>${table(result.pcba_history,[['pcba_sn','PCBA'],['defect_code','Defect Code'],['defect_desc','Falha'],['defect_time','Defect Time'],['repair_status','Repair'],['manual_or_auto','Manual/Automatic'],['defect_type','Defect Type']], 'Nenhuma evidência 2114 local para esta SN.')}
    <h4>3074 · vínculos de material</h4>${table(result.material_reuse,[['current_pcba_sn','PCBA atual'],['item_type','Tipo'],['item_sn','Material SN'],['usage_status','Uso'],['previous_pcba_count','PCBAs anteriores'],['previous_pcbas_json','PCBAs desvinculadas']], 'Nenhuma evidência 3074 local para esta SN.')}
    <h4>3022 · processo</h4>${table(result.process_events,[['pcba_sn','PCBA'],['station','Posto'],['operation_code','Operação'],['operation_name','Processo'],['event_time','Horário'],['production_shift','Turno de produção'],['production_operational_date','Data operacional']], 'Nenhuma evidência 3022 local para esta SN.')}`;
  const cache=result.cached_lookup;
  if(cache){const detail=document.createElement('div');detail.innerHTML=`<h4>Consulta SN armazenada · ${esc(result.cached_at||'')}</h4><p>Última evidência coletada para esta SN; consulte A-MES para atualizar.</p><h4>Falha atual / falhas antigas da própria PCBA</h4>${table([cache.trace_2114?.current_failure,...(cache.trace_2114?.previous_failures||[])].filter(Boolean),[['Defect Code','Defect Code'],['Defect Description','Falha'],['Defect Time','Defect Time'],['Manual/Automatic','Manual/Automatic'],['Repair Status','Repair'],['relation','Relação']], '2114 indisponível nesta consulta armazenada.')}<h4>Material → PCBA anterior → falha</h4>${table((cache.trace_3074?.reused_components||[]).flatMap(m=>(m.previous_pcba_evidence||[]).map(e=>({material_sn:m.item_sn,family:m.item_type,pcba:e.pcba_sn,code:e.history?.['Defect Code'],desc:e.history?.['Defect Description'],time:e.history?.['Defect Time'],relation:e.relation,repair_user:(e.repair_evidence_3012||[]).map(r=>r.repair_user).filter(Boolean).join(', '),repair_comment:(e.repair_evidence_3012||[]).map(r=>r.repair_comment).filter(Boolean).join(' | ')}))),[['material_sn','Material SN'],['family','Componente'],['pcba','PCBA anterior'],['code','Defect Code'],['desc','Falha'],['time','Defect Time'],['relation','Relação'],['repair_user','Repair User · 3012'],['repair_comment','Repair Comment · 3012']], 'Nenhuma evidência de material reutilizado armazenada.')}<h4>Turno de produção · 3022</h4>${table(cache.local_snapshot?.process_contexts||[],[['pcba_sn','PCBA'],['defect_code','Defect Code'],['production_shift','Turno de produção'],['production_operational_date','Data operacional'],['production_event_time','Horário 3022']], 'Sem correlação de turno armazenada.')}`;section.append(detail);}
  root.append(section);
}

export function withOfflineSnLookup(base,root,store){
  let localResult=null,localError='',lastSn='';
  function resetForNewSn(){localResult=null;localError='';store.updateAgent?.({error:''});root.querySelector('[data-sn-local-result]')?.remove();root.querySelector('[data-sn-result]')?.removeAttribute('hidden');}
  function install(){
    const form=root.querySelector('[data-sn-form]');if(!form||form.querySelector('[data-sn-local]'))return;
    const primary=form.querySelector('[data-sn-run]');if(primary){primary.textContent='Consultar A-MES';primary.addEventListener('click',resetForNewSn);}
    const input=form.querySelector('[name=sn]');input?.addEventListener('input',()=>{if(input.value.trim()!==lastSn){store.updateAgent?.({error:''});root.querySelector('[data-sn-source-health]')?.remove();}});
    const button=document.createElement('button');button.type='button';button.className='button secondary';button.dataset.snLocal='1';button.textContent='Consultar base local';primary?.after(button);
    const context=form.querySelector('.mes-context');if(context)context.textContent='No posto MES, use Consultar A-MES para enriquecer por fonte. Se uma fonte falhar, as demais e o SQLite continuam válidos. Na Assistência/offline, use Consultar base local.';
    const pipeline=form.querySelector('.ames-pipeline');if(pipeline)pipeline.innerHTML='<span>SN</span><i>→</i><span>3074</span><i>+</i><span>2114</span><i>+</i><span>3022</span><i>+</i><span>3012/cache</span><i>→</i><span>Resultado por evidência</span>';
    button.addEventListener('click',async()=>{const sn=root.querySelector('[name=sn]')?.value.trim();if(!sn)return;lastSn=sn;resetForNewSn();root.querySelector('[data-sn-result]')?.setAttribute('hidden','');button.disabled=true;button.textContent='Consultando local…';try{localResult=await localLookup(sn);}catch(error){localResult=null;localError=error.message||String(error);}finally{button.disabled=false;button.textContent='Consultar base local';renderLocal(root,localResult,localError);renderLiveSources(root,store);}});
  }
  return {render(){base.render();install();renderLiveSources(root,store);if(localResult||localError)renderLocal(root,localResult,localError);},clear(){base.clear?.();root.querySelector('[data-sn-local-result]')?.remove();root.querySelector('[data-sn-source-health]')?.remove();localResult=null;localError='';lastSn='';store.updateAgent?.({error:''});}};
}
