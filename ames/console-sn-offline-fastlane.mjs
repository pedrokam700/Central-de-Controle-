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
function table(rows,cols,empty){
  if(!rows?.length)return `<div class="ames-empty"><span>—</span><p>${esc(empty)}</p></div>`;
  return `<div class="table-wrap ames-fastlane-table"><table><thead><tr>${cols.map(([,label])=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,1000).map(row=>`<tr>${cols.map(([key])=>`<td>${esc(fmt(row?.[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderLocal(root,result,error=''){
  root.querySelector('[data-sn-local-result]')?.remove();
  if(!result&&!error)return;
  const section=document.createElement('section');section.dataset.snLocalResult='1';section.className='mes-context-panel ames-fastlane-panel ames-local-sn-result';
  if(error){section.innerHTML=`<div class="section-head"><div><h3>Base local</h3><p>Consulta offline do posto.</p></div><span class="status bad">ERRO</span></div><div class="notice warn">${esc(error)}</div>`;root.append(section);return;}
  const s=result.summary||{},coverage=result.coverage||{};
  section.innerHTML=`<div class="section-head"><div><h3>Consulta offline · base local</h3><p>Resultado somente do SQLite deste posto. Nenhuma chamada ao A-MES ou à nuvem foi feita.</p></div><span class="status ok">LOCAL</span></div>
    <div class="ames-fastlane-kpis"><div><small>PCBAs relacionadas</small><b>${esc(fmt(s.pcbas_related))}</b></div><div><small>Histórico 2114</small><b>${esc(fmt(s.history_2114))}</b></div><div><small>Processos 3022</small><b>${esc(fmt(s.process_3022))}</b></div><div><small>Reparos 3012</small><b>${esc(fmt(s.repair_3012))}</b></div></div>
    <div class="ames-local-coverage">${['3028','3074','2114','3022','3012'].map(k=>`<span class="status ${coverage[k]?'ok':''}">${k} · ${coverage[k]?'com dados':'sem dados locais'}</span>`).join('')}</div>
    <h4>3012 · reparo / análise</h4>${table(result.repair_3012,[['pcba_sn','PCBA'],['defect_time','Defect Time'],['defect_code','Defect Code'],['defect_desc','Falha'],['repair_user','Repair User'],['repair_time','Repair Time'],['repair_code','Repair Code'],['repair_comment','Repair Comment']], 'Nenhum dado 3012 armazenado para esta SN.')}
    <h4>2114 · histórico de falhas</h4>${table(result.pcba_history,[['pcba_sn','PCBA'],['defect_code','Defect Code'],['defect_desc','Falha'],['defect_time','Defect Time'],['repair_status','Repair'],['manual_or_auto','Manual/Automatic'],['defect_type','Defect Type']], 'Nenhum histórico 2114 local para esta SN.')}
    <h4>3074 · vínculos de material</h4>${table(result.material_reuse,[['current_pcba_sn','PCBA atual'],['item_type','Tipo'],['item_sn','Material SN'],['usage_status','Uso'],['previous_pcba_count','PCBAs anteriores'],['previous_pcbas_json','PCBAs desvinculadas']], 'Nenhum vínculo 3074 local para esta SN.')}
    <h4>3022 · processo</h4>${table(result.process_events,[['pcba_sn','PCBA'],['station','Posto'],['operation_code','Operação'],['operation_name','Processo'],['event_time','Horário'],['production_shift','Turno de produção'],['production_operational_date','Data operacional']], 'Nenhum evento 3022 local para esta SN.')}`;
  const cache=result.cached_lookup;
  if(cache){
    const detail=document.createElement('div');
    detail.innerHTML=`<h4>Consulta SN armazenada · ${esc(result.cached_at||'')}</h4><p>Última evidência coletada para esta SN; consulte A-MES para atualizar.</p><h4>Falha atual / falhas antigas da própria PCBA</h4>${table([cache.trace_2114?.current_failure,...(cache.trace_2114?.previous_failures||[])].filter(Boolean),[['Defect Code','Defect Code'],['Defect Description','Falha'],['Defect Time','Defect Time'],['Manual/Automatic','Manual/Automatic'],['Repair Status','Repair'],['relation','Relação']], '2114 indisponível nesta consulta armazenada.')}<h4>Material → PCBA anterior → falha</h4>${table((cache.trace_3074?.reused_components||[]).flatMap(m=>(m.previous_pcba_evidence||[]).map(e=>({material_sn:m.item_sn,family:m.item_type,pcba:e.pcba_sn,code:e.history?.['Defect Code'],desc:e.history?.['Defect Description'],time:e.history?.['Defect Time'],relation:e.relation,repair_user:(e.repair_evidence_3012||[]).map(r=>r.repair_user).filter(Boolean).join(', '),repair_comment:(e.repair_evidence_3012||[]).map(r=>r.repair_comment).filter(Boolean).join(' | ')}))),[['material_sn','Material SN'],['family','Componente'],['pcba','PCBA anterior'],['code','Defect Code'],['desc','Falha'],['time','Defect Time'],['relation','Relação'],['repair_user','Repair User · 3012'],['repair_comment','Repair Comment · 3012']], 'Nenhuma evidência de material reutilizado armazenada.')}<h4>Turno de produção · 3022</h4>${table(cache.local_snapshot?.process_contexts||[],[['pcba_sn','PCBA'],['defect_code','Defect Code'],['production_shift','Turno de produção'],['production_operational_date','Data operacional'],['production_event_time','Horário 3022']], 'Sem correlação de turno armazenada.')}`;
    section.append(detail);
  }
  root.append(section);
}

export function withOfflineSnLookup(base,root,store){
  let localResult=null,localError='',lastSn='';
  function install(){
    const form=root.querySelector('[data-sn-form]');if(!form||form.querySelector('[data-sn-local]'))return;
    const primary=form.querySelector('[data-sn-run]');if(primary){primary.textContent='Consultar A-MES';primary.addEventListener('click',()=>{localResult=null;localError='';root.querySelector('[data-sn-local-result]')?.remove();root.querySelector('[data-sn-result]')?.removeAttribute('hidden');});}
    const button=document.createElement('button');button.type='button';button.className='button secondary';button.dataset.snLocal='1';button.textContent='Consultar base local';primary?.after(button);
    const context=form.querySelector('.mes-context');if(context)context.textContent='No posto MES, use Consultar A-MES para buscar fontes ao vivo. Na Assistência/offline, use Consultar base local para cruzar tudo que já foi armazenado no SQLite.';
    const pipeline=form.querySelector('.ames-pipeline');if(pipeline)pipeline.innerHTML='<span>SN</span><i>→</i><span>3074</span><i>→</i><span>2114</span><i>→</i><span>3022</span><i>→</i><span>3012</span><i>→</i><span>Resultado único</span>';
    button.addEventListener('click',async()=>{
      const sn=root.querySelector('[name=sn]')?.value.trim();if(!sn)return;lastSn=sn;root.querySelector('[data-sn-result]')?.setAttribute('hidden','');button.disabled=true;button.textContent='Consultando local…';localError='';
      try{localResult=await localLookup(sn);}catch(error){localResult=null;localError=error.message||String(error);}finally{button.disabled=false;button.textContent='Consultar base local';renderLocal(root,localResult,localError);}
    });
  }
  return {render(){base.render();install();if(localResult||localError)renderLocal(root,localResult,localError);},clear(){base.clear?.();root.querySelector('[data-sn-local-result]')?.remove();localResult=null;localError='';lastSn='';}};
}
