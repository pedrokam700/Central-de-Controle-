import {LINE_IDS} from './data/contract.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const rows=(snapshot,name)=>{
  if(name==='3028')return snapshot?.occurrences||[];
  if(name==='3074')return snapshot?.material_trace?.records||snapshot?.canonical?.datasets?.material_reuse||[];
  if(name==='2114')return snapshot?.pcba_history?.records||snapshot?.canonical?.datasets?.pcba_history||[];
  if(name==='3022')return snapshot?.process_timeline?.events||snapshot?.canonical?.datasets?.process_timeline||[];
  return [];
};
const status=(tone,label,detail)=>({tone,label,detail});

function sourceModel(store,source){
  const agent=store.agent();
  const reads=LINE_IDS.map((line,index)=>({line,index:index+1,read:store.read(line)}));
  const snapshots=reads.filter(x=>x.read.snapshot);
  const totalSnapshots=snapshots.length;
  const latest=snapshots.map(x=>x.read.snapshot?.collected_at).filter(Boolean).sort().at(-1)||null;

  if(source==='3028'){
    const count=snapshots.reduce((n,x)=>n+rows(x.read.snapshot,'3028').length,0);
    const fresh=snapshots.filter(x=>x.read.freshness==='fresh').length;
    const state=totalSnapshots===0?status('unknown',t('Sem snapshot','No snapshot'),t('Nenhuma linha carregada.','No line loaded.')):fresh===totalSnapshots&&totalSnapshots===LINE_IDS.length?status('ok',t('Atual','Current'),`${totalSnapshots}/${LINE_IDS.length} ${t('linhas com snapshot fresco','lines with fresh snapshot')}`):status('partial',t('Parcial','Partial'),`${fresh}/${LINE_IDS.length} ${t('linhas frescas','fresh lines')}`);
    return {source,label:'3028',name:t('Falhas / FPY','Failures / FPY'),count,state,latest,reads,unit:t('ocorrências carregadas','loaded occurrences')};
  }

  if(source==='3074'){
    const count=snapshots.reduce((n,x)=>n+rows(x.read.snapshot,'3074').length,0);
    const covered=snapshots.filter(x=>x.read.snapshot?.material_trace?.status&&x.read.snapshot.material_trace.status!=='not_collected').length;
    const state=totalSnapshots===0?status('unknown',t('Sem snapshot','No snapshot'),t('Sem base para avaliar a coleta.','No base snapshot to assess collection.')):covered===totalSnapshots?status('ok',t('Transportado','Transported'),`${covered}/${totalSnapshots} ${t('snapshots com dataset disponível','snapshots with dataset available')}`):status('partial',t('Parcial','Partial'),`${covered}/${totalSnapshots} ${t('snapshots com dataset disponível','snapshots with dataset available')}`);
    return {source,label:'3074',name:t('Materiais / vínculos','Materials / bindings'),count,state,latest,reads,unit:t('registros carregados','loaded records')};
  }

  if(source==='2114'){
    const count=snapshots.reduce((n,x)=>n+rows(x.read.snapshot,'2114').length,0);
    const covered=snapshots.filter(x=>x.read.snapshot?.pcba_history?.status&&x.read.snapshot.pcba_history.status!=='not_collected').length;
    const state=totalSnapshots===0?status('unknown',t('Sem snapshot','No snapshot'),t('Sem base para avaliar a coleta.','No base snapshot to assess collection.')):covered===totalSnapshots?status('ok',t('Transportado','Transported'),`${covered}/${totalSnapshots} ${t('snapshots com histórico disponível','snapshots with history available')}`):status('partial',t('Parcial','Partial'),`${covered}/${totalSnapshots} ${t('snapshots com histórico disponível','snapshots with history available')}`);
    return {source,label:'2114',name:t('Histórico PCBA','PCBA history'),count,state,latest,reads,unit:t('eventos históricos','history events')};
  }

  if(source==='3022'){
    const count=snapshots.reduce((n,x)=>n+rows(x.read.snapshot,'3022').length,0);
    const covered=snapshots.filter(x=>x.read.snapshot?.process_timeline?.status&&x.read.snapshot.process_timeline.status!=='not_collected').length;
    const capability=agent.capabilities?.process_timeline===true;
    const state=!capability?status('unknown',t('A validar','Needs validation'),t('O agente ainda não declarou a capacidade 3022.','The agent has not declared 3022 capability yet.')):totalSnapshots===0?status('unknown',t('Sem snapshot','No snapshot'),t('Nenhuma linha carregada.','No line loaded.')):covered===totalSnapshots?status('ok',t('Disponível','Available'),`${covered}/${totalSnapshots} ${t('snapshots com processo','snapshots with process data')}`):status('partial',t('Parcial','Partial'),`${covered}/${totalSnapshots} ${t('snapshots com processo','snapshots with process data')}`);
    return {source,label:'3022',name:t('Processo / passagem','Process / passage'),count,state,latest,reads,unit:t('eventos de processo','process events')};
  }

  const allOccurrences=snapshots.flatMap(x=>rows(x.read.snapshot,'3028'));
  const withEvidence=allOccurrences.filter(row=>Array.isArray(row?.repair_evidence_3012)&&row.repair_evidence_3012.length>0);
  const count=withEvidence.length;
  const state=!allOccurrences.length?status('unknown',t('Sem base','No base data'),t('Não há ocorrências para medir cobertura 3012.','There are no occurrences to assess 3012 coverage.')):count?status(count===allOccurrences.length?'ok':'partial',count===allOccurrences.length?t('Coberto','Covered'):t('Parcial','Partial'),`${count}/${allOccurrences.length} ${t('ocorrências com evidência 3012','occurrences with 3012 evidence')}`):status('unknown',t('Não comprovado','Not proven'),t('Nenhuma evidência 3012 foi associada a estas ocorrências; isso não equivale a zero reparos.','No 3012 evidence is linked to these occurrences; this does not mean zero repairs.'));
  return {source,label:'3012',name:t('Reparo / AT','Repair / AT'),count,state,latest,reads,unit:t('ocorrências com evidência','occurrences with evidence')};
}

export function buildDataHealth(store){
  return ['3028','3074','2114','3022','3012'].map(source=>sourceModel(store,source));
}

export function createDataHealthView(root,store,{onEvidence=()=>{}}={}){
  let last='';
  function render(){
    const model=buildDataHealth(store),agent=store.agent();
    const key=JSON.stringify([model,agent.status,agent.agent_build,document.documentElement.lang]);if(key===last)return;last=key;
    root.setAttribute('data-no-i18n','');
    root.innerHTML=`<section class="mes-context-panel ames-data-health"><div class="section-head"><div><h3>${t('Saúde e cobertura dos dados','Data health and coverage')}</h3><p>${t('Mostra o que foi realmente carregado. Ausência de evidência nunca é apresentada como zero.','Shows what was actually loaded. Missing evidence is never presented as zero.')}</p></div><span class="ames-health-agent ${agent.status==='connected'?'ok':'unknown'}">${agent.status==='connected'?t('Agente conectado','Agent connected'):t('Dados compartilhados / cache','Shared data / cache')}</span></div><div class="ames-data-health-grid">${model.map(item=>`<article class="ames-health-card ${item.state.tone}"><div class="ames-health-card-head"><div><b>${esc(item.label)}</b><span>${esc(item.name)}</span></div><span class="ames-health-state">${esc(item.state.label)}</span></div><strong>${item.count}</strong><small>${esc(item.unit)}</small><p>${esc(item.state.detail)}</p><footer><span>${esc(item.latest||t('coleta não informada','collection not provided'))}</span><button type="button" class="button secondary" data-health-evidence="${esc(item.source)}">${t('Ver evidência','View evidence')}</button></footer></article>`).join('')}</div></section>`;
    root.querySelectorAll('[data-health-evidence]').forEach(button=>button.addEventListener('click',()=>{
      const item=model.find(x=>x.source===button.dataset.healthEvidence);if(!item)return;
      onEvidence({title:`${item.label} · ${item.name}`,description:item.state.detail,fields:[[t('Estado','Status'),item.state.label],[t('Registros visíveis','Visible records'),item.count],[t('Última coleta','Last collection'),item.latest||'—'],[t('Build do agente','Agent build'),agent.agent_build||agent.capabilities?.agent_build||'—']],lines:item.reads.map(x=>({label:`${t('Linha','Line')} ${x.index} · ${x.line}`,snapshot:x.read.snapshot?.snapshot_id||t('sem snapshot','no snapshot'),freshness:x.read.freshness,detail:x.read.source})),notes:[t('Cobertura mede evidência disponível no snapshot atual. Zero registros pode ser válido; quando a coleta não pode ser comprovada, o estado fica desconhecido/parcial.','Coverage reflects evidence available in the current snapshot. Zero records can be valid; when collection cannot be proven, status remains unknown/partial.')]});
    }));
  }
  return {render,clear(){root?.replaceChildren();last='';}};
}
