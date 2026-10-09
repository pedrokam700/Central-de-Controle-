import { LINE_IDS } from './data/contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';
import { createAgentEvidenceView } from './agent-evidence-view.mjs';

const lineOptions=(selected)=>LINE_IDS.map((line,i)=>`<option value="${line}"${selected===line?' selected':''}>Linha ${i+1} · ${line}</option>`).join('');
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const relationLabel=value=>({MESMA_FALHA:'MESMA FALHA',FALHA_SIMILAR:'MESMA FAMÍLIA / SIMILAR',FALHA_DIFERENTE:'OUTRA FALHA',SEM_HISTORICO:'SEM HISTÓRICO',SEM_FALHA_ATUAL:'SEM FALHA ATUAL'})[value]||fmt(value);
const kv=(label,value)=>`<div class="ames-kv"><small>${esc(label)}</small><b>${esc(fmt(value))}</b></div>`;
const scope=(line,performance='balanced')=>({lines:[line],performance,max_failures:0,max_pcbas:0,defect_codes:[]});

function rowsTable(rows,columns,{empty='Nenhum registro disponível.',highlight}={}){
  if(!rows?.length)return `<div class="mes-context-panel"><p>${esc(empty)}</p></div>`;
  return `<div class="table-wrap"><table><thead><tr>${columns.map(([key,label])=>`<th>${esc(label||key)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,index)=>`<tr${highlight?.(row,index)?' class="ames-evidence-hit"':''}>${columns.map(([key])=>`<td>${esc(fmt(row?.[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function createSnConsoleView(root,store,client){
  let mounted=false,line=LINE_IDS[0],performance='balanced',lastKey='';
  function render(){
    if(!mounted){
      root.innerHTML=`<div class="ames-view-intro"><h2>Consulta por SN</h2><p>Bipe uma PCBA ou Material SN e cruze 3074, 2114 e 3022 na mesma consulta.</p></div>
      <form class="ames-console-form" data-sn-form><div class="mes-filters"><label>Linha de contexto<select name="line">${lineOptions(line)}</select></label><label>PCBA / Material SN exato<input name="sn" autocomplete="off" placeholder="Bipe ou digite a SN"></label><label>Perfil<select name="performance"><option value="fast">Rápido</option><option value="balanced" selected>Equilibrado</option><option value="safe">Seguro</option></select></label></div><button type="button" class="button primary" data-sn-run>Consultar SN · 3074 + 2114 + 3022</button></form><div data-sn-status></div><section data-sn-result></section>`;
      mounted=true;
      root.querySelector('[name=line]').addEventListener('change',e=>line=e.target.value);
      root.querySelector('[name=performance]').addEventListener('change',e=>performance=e.target.value);
      root.querySelector('[data-sn-run]').addEventListener('click',async()=>{
        const sn=root.querySelector('[name=sn]').value.trim();if(!sn)return;
        root.querySelector('[data-sn-status]').textContent='Consultando A-MES...';
        try{await client.collect('sn',{...scope(line,performance),sn});}catch(error){root.querySelector('[data-sn-status]').textContent=error.message;}
      });
    }
    const a=store.agent(),job=a.job,result=a.resultSource==='sn'?job?.result:null;
    const key=JSON.stringify([job?.id,job?.status,job?.stage,job?.message,result]);if(key===lastKey)return;lastKey=key;
    root.querySelector('[data-sn-status]').innerHTML=job?.kind==='sn_lookup'?`<p><b>${esc(job.status||'')}</b> · ${esc(job.stage||'')} · ${esc(job.message||'')}</p>`:(a.error?`<p>${esc(a.error)}</p>`:'');
    if(!result){root.querySelector('[data-sn-result]').innerHTML='<div class="mes-context-panel"><p>Faça uma consulta para ver falha atual, falhas antigas, materiais reutilizados, PCBAs anteriores e processo 3022.</p></div>';return;}
    const current=result.trace_2114?.current_failure||null,previous=result.trace_2114?.previous_failures||[],reused=result.trace_3074?.reused_components||[],local=result.local_snapshot||{},process=result.trace_3022||{};
    root.querySelector('[data-sn-result]').innerHTML=`<div class="ames-summary-grid">${kv('Tipo detectado',result.detected_type)}${kv('Linha',result.line)}${kv('CPH / modelo',result.product_model)}${kv('Shift 2114',result.shift_2114)}${kv('Materiais 2º+ uso',reused.length)}${kv('Eventos 3022',result.summary?.['3022_events'])}</div>
      <section class="mes-context-panel"><h3>Falha atual da PCBA</h3>${current?rowsTable([current],[['Defect Code','Defect Code'],['Defect Description','Descrição'],['Defect Time','Defect Time'],['Manual/Automatic','Manual/Automatic'],['Repair Status','Repair Status'],['Defect Type','Defect Type']]):'<p>Falha atual não confirmada na 2114 para esta consulta.</p>'}</section>
      <section class="mes-context-panel"><h3>Falhas antigas da PCBA</h3>${rowsTable(previous,[['Defect Code','Defect Code'],['Defect Description','Descrição'],['Defect Time','Defect Time'],['Manual/Automatic','Log'],['Repair Status','Repair']])}</section>
      <section class="mes-context-panel"><h3>Materiais em 2º uso ou mais</h3>${reused.length?reused.map(item=>`<article class="ames-evidence-card"><div class="ames-evidence-card-head"><div><b>${esc(item.item_type||'Material')}</b><span>${esc(item.item_sn||'')}</span></div><span class="status">${esc(relationLabel(item.relation_to_current_failure))}</span></div><p>Usos conhecidos: ${esc(fmt(item.known_use_count))} · reusos: ${esc(fmt(item.reuse_count))}</p><p>PCBAs anteriores/desvinculadas: ${esc((item.previous_pcbas||[]).join(', ')||'nenhuma confirmada')}</p>${(item.previous_pcba_evidence||[]).map(ev=>`<div class="ames-prior-pcba"><b>${esc(ev.pcba_sn||'')}</b> · ${esc(relationLabel(ev.relation))}<br><small>${esc(ev.reason||'')}</small></div>`).join('')}</article>`).join(''):'<p>Nenhum Material SN em 2º+ uso confirmado nesta consulta.</p>'}</section>
      <section class="mes-context-panel"><h3>3022 · horário/processo</h3><p><b>Defect Time continua sendo detecção/registro.</b> Os horários abaixo são evidência de passagem pelo processo, não causa confirmada.</p>${rowsTable(local.process_contexts||[],[['defect_code','Falha'],['defect_time','Defect Time'],['registration_mode','Log'],['failure_family','Família'],['reference_station_code','Posto relevante'],['reference_event_time','Horário relevante'],['previous_operation_code','Processo anterior'],['previous_event_time','Horário anterior'],['repair_action','AT / ação'],['status','Status']])}${!local.process_contexts?.length&&process.process_passages?.length?rowsTable(process.process_passages,[['operation_code','Posto'],['operation_name','Processo'],['event_time','Horário'],['hist_seq','Hist Seq']]):''}</section>
      ${(result.warnings||[]).length?`<div class="notice warn">${result.warnings.map(esc).join('<br>')}</div>`:''}`;
  }
  return {render,clear(){root?.replaceChildren();mounted=false;lastKey='';}};
}

export function createTraceConsoleView(root,store,client){
  let mounted=false,line=LINE_IDS[0],evidence;
  function render(){
    if(!mounted){
      root.innerHTML=`<div class="ames-view-intro"><h2>Rastreabilidade</h2><p>3074 + 2114 + 3022 em lote, sempre separados por linha e ligados ao snapshot 3028.</p></div>
      <form class="ames-console-form" data-trace-form><fieldset><legend>Linhas desta execução</legend>${LINE_IDS.map((id,i)=>`<label class="mes-opt-in"><input type="checkbox" name="lines" value="${id}" checked>Linha ${i+1} · ${id}</label>`).join('')}</fieldset><div class="mes-filters"><label>Modo<select name="trace_mode"><option value="full">Completo · 3074 + 2114 + 3022</option><option value="process_only">Somente horários/processo · 3022</option><option value="reuse_only">Somente reuso/histórico · 3074 + 2114</option></select></label><label>Perfil<select name="performance"><option value="fast">Rápido</option><option value="balanced" selected>Equilibrado</option><option value="safe">Seguro</option></select></label><label>Ocorrências máximas / linha<input type="number" name="max_failures" min="0" value="0"></label><label>PCBAs máximas / linha<input type="number" name="max_pcbas" min="0" value="0"></label></div><label>Códigos exatos de falha, separados por vírgula<input name="codes" placeholder="vazio = todas"></label><div class="mes-pagination"><button type="button" class="button primary" data-trace-run>Coletar no modo selecionado</button><button type="button" class="button secondary" data-trace-cancel>Cancelar</button></div></form><div data-trace-status></div><div class="mes-filters"><label>Visualizar evidência da linha<select data-trace-line>${lineOptions(line)}</select></label></div><section data-trace-evidence></section>`;
      mounted=true;evidence=createAgentEvidenceView(root.querySelector('[data-trace-evidence]'),store);
      root.querySelector('[data-trace-line]').addEventListener('change',e=>{line=e.target.value;evidence.render(line);});
      root.querySelector('[data-trace-run]').addEventListener('click',async()=>{const form=root.querySelector('[data-trace-form]'),values=Object.fromEntries(new FormData(form)),codes=(values.codes||'').split(',').map(x=>x.trim()).filter(Boolean);try{await client.collect('deep',{lines:[...form.querySelectorAll('[name=lines]:checked')].map(x=>x.value),performance:values.performance,max_failures:Number(values.max_failures||0),max_pcbas:Number(values.max_pcbas||0),defect_codes:codes,trace_mode:values.trace_mode});}catch(error){root.querySelector('[data-trace-status]').textContent=error.message;}});
      root.querySelector('[data-trace-cancel]').addEventListener('click',()=>client.cancel().catch(error=>root.querySelector('[data-trace-status]').textContent=error.message));
    }
    const a=store.agent(),job=a.job;
    root.querySelector('[data-trace-status]').innerHTML=job?`<p><b>${esc(job.status||'')}</b> · ${esc(job.stage||'')} · ${esc(job.message||'')}</p>${Object.entries(job.stage_progress||{}).map(([stage,p])=>`<p>${esc(stage)} · ${esc(p.line||'')} · ${esc(fmt(p.current))}/${esc(fmt(p.total))} · ${esc(fmt(p.line_percent))}% · ${esc(p.detail||'')}</p>`).join('')}`:'<p>Nenhuma coleta de rastreabilidade iniciada nesta sessão.</p>';
    evidence?.render(line);
  }
  return {render,clear(){root?.replaceChildren();mounted=false;evidence=undefined;}};
}

const INSIGHT_DRILL={
  'PCBA em 2º uso':'pcba_second_use','PCBA em 3º+ uso':'pcba_3plus_use','PCBAs 2º+ uso com falha anterior':'pcba_reused_with_prior_failure',
  'PCBAs que repetiram a mesma falha':'pcba_same_failure','PCBAs com recorrência da mesma família':'pcba_same_family','PCBAs em 2º uso com mesma falha anterior':'pcba_second_use_same_failure','PCBAs em 2º uso com mesma família anterior':'pcba_second_use_same_family',
  'Materiais únicos 2º+ uso':'material_analysis','Materiais em 2º uso':'material_second_use','Materiais em 3º+ uso':'material_3plus_use',
  'Reuso COM falha em PCBA desvinculada':'material_with_old_failure','Reuso com a MESMA falha':'material_same_failure','Reuso com falha da MESMA família':'material_same_family',
  'Vínculos material↔PCBA com mesma falha':'correlation_same_failure','Vínculos material↔PCBA com mesma família':'correlation_same_family'
};

export function createReuseConsoleView(root,store){
  let line=LINE_IDS[0],selected='',mounted=false,last='';
  function render(){
    const snapshot=store.read(line).snapshot,insights=snapshot?.insights;
    const key=JSON.stringify([line,snapshot?.snapshot_id,selected,insights]);if(key===last)return;last=key;
    if(!mounted){mounted=true;}
    const groups=insights?.groups||{};const rows=selected?(insights?.drilldowns?.[selected]||[]):[];
    root.innerHTML=`<div class="ames-view-intro"><h2>Dashboards de reuso</h2><p>Área especializada de segundo uso/reutilização. Não substitui o Dashboard geral da Central.</p></div><div class="mes-filters"><label>Linha<select data-reuse-line>${lineOptions(line)}</select></label></div>
      ${!insights?'<div class="mes-context-panel"><p>Enriquecimento de reuso ainda não disponível nesta linha. Rode 3074 + 2114 pela Rastreabilidade.</p></div>':Object.entries(groups).map(([group,pairs])=>`<section class="mes-context-panel"><h3>${esc(group.replace('_kpis','').replaceAll('_',' '))}</h3><div class="ames-reuse-kpis">${pairs.map(([label,value])=>{const drill=INSIGHT_DRILL[label];return drill&&insights.drilldowns?.[drill]?`<button type="button" class="stat ames-kpi-button${selected===drill?' active':''}" data-reuse-drill="${esc(drill)}"><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(fmt(value))}</strong><span class="stat-note">Ver itens exatos</span></button>`:`<div class="stat"><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(fmt(value))}</strong><span class="stat-note">Sem drill-down carregado</span></div>`}).join('')}</div></section>`).join('')}
      ${selected?`<section class="mes-context-panel ames-selected-evidence"><h3>ITEM EXATO EM EVIDÊNCIA</h3><p>Indicador selecionado: <b>${esc(selected)}</b> · ${rows.length} registro(s). A tabela abaixo contém exatamente os itens que sustentam este indicador na leitura carregada.</p>${rows.length?`<div class="ames-evidence-card"><b>${esc(rows[0].current_pcba_sn||rows[0].pcba_sn||rows[0].item_sn||rows[0].material_sn||'Primeiro item')}</b><span>${esc(rows[0].item_type||rows[0].defect_code||'')}</span></div>`:''}${rowsTable(rows,Object.keys(rows[0]||{}).filter(k=>!k.startsWith('_')).slice(0,10).map(k=>[k,k]),{highlight:(_,i)=>i===0})}</section>`:''}`;
    root.querySelector('[data-reuse-line]')?.addEventListener('change',e=>{line=e.target.value;selected='';last='';render();});
    for(const btn of root.querySelectorAll('[data-reuse-drill]'))btn.addEventListener('click',()=>{selected=btn.dataset.reuseDrill;last='';render();root.querySelector('.ames-selected-evidence')?.scrollIntoView({behavior:'smooth',block:'start'});});
  }
  return {render,clear(){root?.replaceChildren();mounted=false;last='';selected='';}};
}

export function createProcessConsoleView(root,store){
  let line=LINE_IDS[0],pcba='',defect='',mounted=false,last='';
  function render(){
    const snapshot=store.read(line).snapshot,process=snapshot?.process_timeline||{},contexts=(process.contexts||[]).filter(r=>(!pcba||r.pcba_sn===pcba)&&(!defect||r.defect_code===defect)),events=(process.events||[]).filter(r=>!pcba||r.pcba_sn===pcba);
    const key=JSON.stringify([line,snapshot?.snapshot_id,pcba,defect,contexts.length,events.length]);if(key===last)return;last=key;
    const codes=[...new Set((process.contexts||[]).map(r=>r.defect_code).filter(Boolean))];
    root.innerHTML=`<div class="ames-view-intro"><h2>Processo / 3022 & AT</h2><p>Horário real de passagem por postos, detecção e reparo. Evidência temporal não é causa confirmada.</p></div><div class="mes-filters"><label>Linha<select data-process-line>${lineOptions(line)}</select></label><label>PCBA exata<input data-process-pcba value="${esc(pcba)}" placeholder="todas"></label><label>Falha<select data-process-defect><option value="">Todas</option>${codes.map(code=>`<option${code===defect?' selected':''}>${esc(code)}</option>`).join('')}</select></label></div>
      <div class="info-note"><b>Defect Time</b> = detecção/registro. <b>Horário relevante 3022</b> = passagem pelo posto que a regra associa à condição. Montagem/teste até A5700 fica separada de packing; Manual/Automatic e retrabalhos permanecem evidência explícita.</div>
      <section class="mes-context-panel"><h3>Falha → evidência temporal / AT</h3>${rowsTable(contexts,[['pcba_sn','PCBA'],['defect_code','Falha'],['defect_time','Defect Time'],['registration_mode','Log'],['failure_family','Família'],['reference_rule_id','Regra'],['reference_station_code','Posto relevante'],['reference_event_time','Horário relevante'],['reference_pass_count_before_defect','Passagens antes'],['repair_action','AT / ação'],['return_a5201_event_time','Retorno A5201'],['next_reference_event_time','Próx. posto relevante'],['previous_operation_code','Processo anterior'],['previous_event_time','Horário anterior'],['status','Status']])}</section>
      <details class="mes-context-panel"><summary>Timeline 3022 carregada · ${events.length} evento(s)</summary>${rowsTable(events,[['pcba_sn','PCBA'],['operation_code','Posto'],['operation_name','Processo'],['station','Station'],['event_time','Horário'],['event_group','Grupo'],['hist_seq','Hist Seq']])}</details>`;
    root.querySelector('[data-process-line]').addEventListener('change',e=>{line=e.target.value;pcba='';defect='';last='';render();});
    root.querySelector('[data-process-pcba]').addEventListener('change',e=>{pcba=e.target.value.trim();last='';render();});
    root.querySelector('[data-process-pcba]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.dispatchEvent(new Event('change'));}});
    root.querySelector('[data-process-defect]').addEventListener('change',e=>{defect=e.target.value;last='';render();});
  }
  return {render,clear(){root?.replaceChildren();mounted=false;last='';}};
}

export function createBaseConsoleView(root,store,client){
  let mounted=false,line=LINE_IDS[0],result=null;
  function paint(){
    const rows=result?.rows||result?.datasets||result?.jobs||result?.results||[];
    root.querySelector('[data-base-result]').innerHTML=result?`<h3>${esc(result.name||'Resultado')}</h3>${rowsTable(rows,Object.keys(rows[0]||{}).slice(0,10).map(k=>[k,k]))}`:'<div class="mes-context-panel"><p>Escolha um dataset, catálogo, tendência ou busca local.</p></div>';
  }
  function render(){
    if(!mounted){root.innerHTML=`<div class="ames-view-intro"><h2>Base local</h2><p>SQLite, catálogo, datasets, tendências, jobs, backup e exportação. Leitura local; não altera o MES.</p></div><div class="mes-filters"><label>Linha<select data-base-line>${lineOptions(line)}</select></label><label>Dataset<select data-base-dataset><option value="defects">Falhas</option><option value="pcba_history">Histórico 2114</option><option value="material_reuse">Materiais / reuso 3074</option><option value="process_events">Eventos 3022</option><option value="process_defect_contexts">Falha → processo 3022</option><option value="history_contexts">Contextos históricos</option></select></label><label>Busca CORA/local<input data-base-q></label></div><div class="mes-pagination"><button class="button secondary" data-base="dataset">Ler dataset</button><button class="button secondary" data-base="catalog">Catálogo</button><button class="button secondary" data-base="trends">Tendências</button><button class="button secondary" data-base="jobs">Histórico de jobs</button><button class="button secondary" data-base="backup">Backup local</button><button class="button secondary" data-base="search">Pesquisar</button><button class="button secondary" data-base="excel">Baixar Excel</button></div><section data-base-result></section>`;mounted=true;root.querySelector('[data-base-line]').addEventListener('change',e=>line=e.target.value);for(const button of root.querySelectorAll('[data-base]'))button.addEventListener('click',async()=>{try{const name=button.dataset.base;if(name==='excel'){const blob=await client.excel(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AMES_EQUIPE_LINHAS.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}const value={line,snapshot_id:store.read(line).snapshot?.snapshot_id,dataset:root.querySelector('[data-base-dataset]').value,q:root.querySelector('[data-base-q]').value};const r=await client.auxiliary(name,value);result={name, ...(Array.isArray(r)?{rows:r}:r)};paint();}catch(error){result={name:'Erro',rows:[{erro:error.message}]};paint();}});paint();}
  }
  return {render,clear(){root?.replaceChildren();mounted=false;result=null;}};
}

export function createKnowledgeConsoleView(root,client){
  let mounted=false,line=LINE_IDS[0],result=[];
  function paint(){root.querySelector('[data-knowledge-result]').innerHTML=rowsTable(result,[['line','Linha'],['kind','Tipo'],['pcba_sn','PCBA'],['defect_code','Falha'],['defect_desc','Descrição'],['text','Conteúdo'],['source','Fonte']]);}
  function render(){if(!mounted){root.innerHTML=`<div class="ames-view-intro"><h2>CORA conhecimento</h2><p>Busca estruturada na base A-MES local. Fatos, correlações e evidências continuam separados de causa confirmada.</p></div><div class="mes-filters"><label>Linha<select data-knowledge-line>${lineOptions(line)}</select></label><label>Buscar<input data-knowledge-q placeholder="PCBA, Material SN, falha, processo..."></label></div><button class="button primary" data-knowledge-run>Buscar na base local</button><section data-knowledge-result></section>`;mounted=true;root.querySelector('[data-knowledge-line]').addEventListener('change',e=>line=e.target.value);root.querySelector('[data-knowledge-run]').addEventListener('click',async()=>{try{const r=await client.auxiliary('search',{line,q:root.querySelector('[data-knowledge-q]').value});result=r.results||[];}catch(error){result=[{text:error.message,source:'erro'}];}paint();});paint();}}
  return {render,clear(){root?.replaceChildren();mounted=false;result=[];}};
}
