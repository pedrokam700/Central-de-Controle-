import { LINE_IDS } from './data/contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';
import { createAgentEvidenceView } from './agent-evidence-view.mjs';

const lineOptions=(selected)=>LINE_IDS.map((line,i)=>`<option value="${line}"${selected===line?' selected':''}>Linha ${i+1} · ${line}</option>`).join('');
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const relationLabel=value=>({MESMA_FALHA:'MESMA FALHA',FALHA_SIMILAR:'MESMA FAMÍLIA / SIMILAR',FALHA_DIFERENTE:'OUTRA FALHA',SEM_HISTORICO:'SEM HISTÓRICO',SEM_FALHA_ATUAL:'SEM FALHA ATUAL'})[value]||fmt(value);
const kv=(label,value,note='')=>`<div class="ames-kv"><small>${esc(label)}</small><b>${esc(fmt(value))}</b>${note?`<span>${esc(note)}</span>`:''}</div>`;
const modeLabel=value=>({full:'Completo · 3074 + 2114 + 3022',process_only:'Somente processo · 3022',reuse_only:'Somente reuso · 3074 + 2114'})[value]||fmt(value);

function rowsTable(rows,columns,{empty='Nenhum registro disponível.',highlight}={}){
  if(!rows?.length)return `<div class="ames-empty"><span>—</span><p>${esc(empty)}</p></div>`;
  return `<div class="table-wrap"><table><thead><tr>${columns.map(([key,label])=>`<th>${esc(label||key)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,index)=>`<tr${highlight?.(row,index)?' class="ames-evidence-hit"':''}>${columns.map(([key])=>`<td>${esc(fmt(row?.[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function sectionHead(title,subtitle='',right=''){
  return `<div class="section-head"><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${right}</div>`;
}

export function createSnConsoleView(root,store,client){
  let mounted=false,lastKey='',lastSn='';
  function render(){
    if(!mounted){
      root.innerHTML=`<section class="ames-console-form ames-sn-search" data-sn-form>
        <div class="section-head"><div><h3>Consulta individual por SN</h3><p>Bipe uma PCBA ou Material SN para cruzar histórico 2114, reutilização 3074 e processo 3022 na mesma leitura.</p></div></div>
        <div class="ames-sn-grid ames-sn-grid-direct"><label class="ames-sn-input">PCBA / Material SN exato<input name="sn" autocomplete="off" placeholder="Bipe ou digite a SN"></label><button type="button" class="button primary" data-sn-run>Consultar</button></div>
        <p class="mes-context">A consulta individual aceita somente a SN. Linha, CPH/modelo e Shift abaixo são identificados pelo retorno real da fonte; não existem filtros decorativos de linha ou perfil nesta operação.</p>
        <div class="ames-pipeline" aria-label="Pipeline da consulta"><span>SN</span><i>→</i><span>3074</span><i>→</i><span>2114</span><i>→</i><span>3022</span><i>→</i><span>Resultado único</span></div>
      </section><div data-sn-status class="ames-job-strip"></div><section data-sn-result></section>`;
      mounted=true;
      const run=async()=>{const sn=root.querySelector('[name=sn]').value.trim();if(!sn)return;lastSn=sn;root.querySelector('[data-sn-status]').innerHTML='<b>Consultando A-MES…</b><span>3074 + 2114 + 3022 quando houver evidência</span>';try{await client.collect('sn',{sn});}catch(error){root.querySelector('[data-sn-status]').innerHTML=`<b>Falha na consulta</b><span>${esc(error.message)}</span>`;}};
      root.querySelector('[data-sn-run]').addEventListener('click',run);
      root.querySelector('[name=sn]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run();}});
    }
    const a=store.agent(),job=a.job,result=a.resultSource==='sn'?job?.result:null;
    const key=JSON.stringify([job?.id,job?.status,job?.stage,job?.message,result,a.error]);if(key===lastKey)return;lastKey=key;
    const status=root.querySelector('[data-sn-status]');
    if(job?.kind==='sn_lookup')status.innerHTML=`<b>${esc(job.status||'')}</b><span>${esc(job.stage||'')} · ${esc(job.message||'')}</span>`;
    else if(a.error)status.innerHTML=`<b>Agente</b><span>${esc(a.error)}</span>`;
    else status.innerHTML='<b>Pronto para consulta</b><span>Sem job de SN em execução.</span>';
    if(!result){root.querySelector('[data-sn-result]').innerHTML=`<div class="ames-empty ames-empty-large"><span>⌕</span><h3>Consulte uma SN para abrir a investigação completa</h3><p>O resultado reunirá falha atual, falhas anteriores, materiais em 2º+ uso, PCBAs anteriores/desvinculadas e evidência temporal 3022 quando retornadas pela fonte.</p></div>`;return;}
    const current=result.trace_2114?.current_failure||null,previous=result.trace_2114?.previous_failures||[],reused=result.trace_3074?.reused_components||[],local=result.local_snapshot||{},process=result.trace_3022||{},contexts=local.process_contexts||[],passages=process.process_passages||[];
    root.querySelector('[data-sn-result]').innerHTML=`<div class="ames-summary-grid ames-sn-summary">${kv('SN consultada',result.sn||lastSn,'entrada exata')}${kv('Tipo detectado',result.detected_type,'retorno da fonte')}${kv('Linha',result.line,'detectada pela fonte')}${kv('CPH / modelo',result.product_model,'CPH exato retornado')}${kv('Shift 2114',result.shift_2114,'retorno automático')}${kv('Materiais 2º+ uso',reused.length)}${kv('Eventos 3022',result.summary?.['3022_events']??passages.length)}${kv('Falhas anteriores',previous.length)}</div>
      <div class="ames-investigation-grid"><section class="mes-context-panel ames-priority-panel">${sectionHead('Falha atual da PCBA','Registro 2114 associado à ocorrência atual.')}${current?rowsTable([current],[['Defect Code','Defect Code'],['Defect Description','Descrição'],['Defect Time','Defect Time'],['Manual/Automatic','Manual/Automatic'],['Repair Status','Repair Status'],['Defect Type','Defect Type']]):'<div class="ames-empty"><span>—</span><p>Falha atual não confirmada na 2114 para esta consulta.</p></div>'}</section>
      <section class="mes-context-panel">${sectionHead('Falhas antigas da PCBA','Histórico da própria PCBA, separado da falha atual.')}${rowsTable(previous,[['Defect Code','Defect Code'],['Defect Description','Descrição'],['Defect Time','Defect Time'],['Manual/Automatic','Log'],['Repair Status','Repair']])}</section></div>
      <section class="mes-context-panel">${sectionHead('Materiais em 2º uso ou mais','Segundo uso de Material SN é separado de segundo uso da própria PCBA.')}${reused.length?`<div class="ames-reuse-list">${reused.map(item=>`<article class="ames-evidence-card"><div class="ames-evidence-card-head"><div><b>${esc(item.item_type||'Material')}</b><span>${esc(item.item_sn||'')}</span></div><span class="status">${esc(relationLabel(item.relation_to_current_failure))}</span></div><div class="ames-inline-facts"><span>Usos conhecidos <b>${esc(fmt(item.known_use_count))}</b></span><span>Reusos <b>${esc(fmt(item.reuse_count))}</b></span></div><p>PCBAs anteriores/desvinculadas: ${esc((item.previous_pcbas||[]).join(', ')||'nenhuma confirmada')}</p>${(item.previous_pcba_evidence||[]).map(ev=>`<div class="ames-prior-pcba"><b>${esc(ev.pcba_sn||'')}</b> · ${esc(relationLabel(ev.relation))}<br><small>${esc(ev.reason||'')}</small></div>`).join('')}</article>`).join('')}</div>`:'<div class="ames-empty"><span>—</span><p>Nenhum Material SN em 2º+ uso confirmado nesta consulta.</p></div>'}</section>
      <section class="mes-context-panel ames-process-evidence">${sectionHead('3022 · horário real de processo','Defect Time continua sendo detecção/registro; o horário abaixo é evidência de passagem, não causa confirmada.')}<div class="ames-rule-strip"><b>Regra temporal:</b><span>ocorrência atual → Defect Time → posto relevante → última passagem concluída válida ≤ Defect Time</span></div>${contexts.length?rowsTable(contexts,[['defect_code','Falha'],['defect_time','Defect Time'],['registration_mode','Log'],['failure_family','Família'],['reference_station_code','Posto relevante'],['reference_event_time','Horário relevante'],['reference_pass_count_before_defect','Passagens antes'],['previous_operation_code','Processo anterior'],['previous_event_time','Horário anterior'],['repair_action','AT / ação'],['return_a5201_event_time','Retorno A5201'],['status','Status']]):rowsTable(passages,[['operation_code','Posto'],['operation_name','Processo'],['event_time','Horário'],['hist_seq','Hist Seq']],{empty:'Nenhuma evidência 3022 carregada para esta consulta.'})}</section>
      ${(result.warnings||[]).length?`<div class="notice warn"><b>Atenção</b><br>${result.warnings.map(esc).join('<br>')}</div>`:''}`;
  }
  return {render,clear(){root?.replaceChildren();mounted=false;lastKey='';lastSn='';}};
}

export function createTraceConsoleView(root,store,client){
  let mounted=false,line=LINE_IDS[0],evidence;
  function render(){
    if(!mounted){
      root.innerHTML=`<div class="ames-trace-layout"><section class="ames-console-form ames-trace-config" data-trace-form>
        ${sectionHead('Escopo desta coleta','A coleta selecionada nunca mistura linhas e um modo não apaga evidência já existente dos outros modos.')}
        <fieldset><legend>Linhas desta execução</legend>${LINE_IDS.map((id,i)=>`<label class="mes-opt-in"><input type="checkbox" name="lines" value="${id}" checked>Linha ${i+1} · ${id}</label>`).join('')}</fieldset>
        <div class="ames-mode-grid"><label class="ames-mode-card"><input type="radio" name="trace_mode" value="full" checked><span><b>Completo</b><small>3074 + 2114 + 3022</small></span></label><label class="ames-mode-card"><input type="radio" name="trace_mode" value="process_only"><span><b>Processo</b><small>Somente horários 3022</small></span></label><label class="ames-mode-card"><input type="radio" name="trace_mode" value="reuse_only"><span><b>Reuso</b><small>3074 + 2114</small></span></label></div>
        <div class="mes-filters"><label>Perfil<select name="performance"><option value="fast">Rápido</option><option value="balanced" selected>Equilibrado</option><option value="safe">Seguro</option></select></label><label>Ocorrências máximas / linha<input type="number" name="max_failures" min="0" value="0"></label><label>PCBAs máximas / linha<input type="number" name="max_pcbas" min="0" value="0"></label></div><label>Códigos exatos de falha<input name="codes" placeholder="vazio = todas"></label><div class="mes-pagination"><button type="button" class="button primary" data-trace-run>Iniciar coleta</button><button type="button" class="button secondary" data-trace-cancel>Cancelar</button></div>
      </section><aside class="mes-context-panel ames-trace-progress"><h3>Progresso da rastreabilidade</h3><div data-trace-status></div></aside></div>
      <section class="mes-context-panel ames-trace-evidence-wrap">${sectionHead('Evidência carregada','Selecione uma linha para inspecionar exatamente o que sustenta a leitura.',`<label>Visualizar linha<select data-trace-line>${lineOptions(line)}</select></label>`)}<section data-trace-evidence></section></section>`;
      mounted=true;evidence=createAgentEvidenceView(root.querySelector('[data-trace-evidence]'),store);
      root.querySelector('[data-trace-line]').addEventListener('change',e=>{line=e.target.value;evidence.render(line);});
      root.querySelector('[data-trace-run]').addEventListener('click',async()=>{const form=root.querySelector('[data-trace-form]'),data=new FormData(form),mode=data.get('trace_mode')||'full',codes=String(data.get('codes')||'').split(',').map(x=>x.trim()).filter(Boolean),lines=[...form.querySelectorAll('[name=lines]:checked')].map(x=>x.value);if(!lines.length){root.querySelector('[data-trace-status]').innerHTML='<div class="ames-empty"><span>!</span><p>Selecione pelo menos uma linha.</p></div>';return;}try{await client.collect('deep',{lines,performance:data.get('performance'),max_failures:Number(data.get('max_failures')||0),max_pcbas:Number(data.get('max_pcbas')||0),defect_codes:codes,trace_mode:mode});}catch(error){root.querySelector('[data-trace-status]').innerHTML=`<div class="notice warn">${esc(error.message)}</div>`;}});
      root.querySelector('[data-trace-cancel]').addEventListener('click',()=>client.cancel().catch(error=>root.querySelector('[data-trace-status]').innerHTML=`<div class="notice warn">${esc(error.message)}</div>`));
    }
    const a=store.agent(),job=a.job,status=root.querySelector('[data-trace-status]');
    if(job){const progress=Object.entries(job.stage_progress||{});status.innerHTML=`<div class="ames-job-head"><b>${esc(job.status||'')}</b><span>${esc(modeLabel(job.scope?.trace_mode||job.trace_mode||''))}</span></div><p>${esc(job.stage||'')} · ${esc(job.message||'')}</p>${progress.length?`<div class="ames-progress-list">${progress.map(([stage,p])=>`<article><div><b>${esc(stage)}</b><span>${esc(p.line||'')}</span></div><progress max="100" value="${Number(p.line_percent||0)}"></progress><small>${esc(fmt(p.current))}/${esc(fmt(p.total))} · ${esc(fmt(p.line_percent))}% · ${esc(p.detail||'')}</small></article>`).join('')}</div>`:'<div class="ames-empty"><span>…</span><p>Aguardando progresso detalhado.</p></div>'}`;}else status.innerHTML='<div class="ames-empty"><span>○</span><p>Nenhuma coleta de rastreabilidade iniciada nesta sessão.</p></div>';
    evidence?.render(line);
  }
  return {render,clear(){root?.replaceChildren();mounted=false;evidence=undefined;}};
}

export function createProcessConsoleView(root,store){
  let line=LINE_IDS[0],pcba='',defect='',mounted=false,last='';
  function render(){
    const snapshot=store.read(line).snapshot,process=snapshot?.process_timeline||{},allContexts=process.contexts||[],allEvents=process.events||[],contexts=allContexts.filter(r=>(!pcba||r.pcba_sn===pcba)&&(!defect||r.defect_code===defect)),events=allEvents.filter(r=>!pcba||r.pcba_sn===pcba);
    const key=JSON.stringify([line,snapshot?.snapshot_id,pcba,defect,contexts.length,events.length]);if(key===last)return;last=key;
    const codes=[...new Set(allContexts.map(r=>r.defect_code).filter(Boolean))],pcbas=[...new Set(allContexts.map(r=>r.pcba_sn).filter(Boolean))],withReference=contexts.filter(r=>r.reference_event_time).length,withAt=contexts.filter(r=>r.repair_action||r.return_a5201_event_time).length,multiPass=contexts.filter(r=>Number(r.reference_pass_count_before_defect||0)>1).length;
    root.innerHTML=`<section class="ames-process-toolbar mes-context-panel">${sectionHead('Leitura temporal 3022 / AT','Investigue a ocorrência pela falha, PCBA e posto relevante — sem confundir Defect Time com horário real de processo.')}<div class="mes-filters"><label>Linha<select data-process-line>${lineOptions(line)}</select></label><label>PCBA exata<input data-process-pcba value="${esc(pcba)}" placeholder="todas as PCBAs"></label><label>Falha<select data-process-defect><option value="">Todas as falhas</option>${codes.map(code=>`<option${code===defect?' selected':''}>${esc(code)}</option>`).join('')}</select></label></div></section>
      <div class="ames-summary-grid ames-process-kpis">${kv('Contextos',contexts.length)}${kv('PCBAs no recorte',pcba?1:pcbas.length)}${kv('Com horário relevante',withReference)}${kv('Com AT / retorno',withAt)}${kv('Múltiplas passagens',multiPass)}${kv('Eventos 3022',events.length)}</div>
      <div class="ames-rule-strip ames-rule-strip-strong"><b>Regra temporal obrigatória</b><span>ocorrência atual → Defect Time → posto relevante → última passagem concluída válida ≤ Defect Time</span><small>Nunca usar simplesmente o último evento da peça. A5700 fecha o conjunto de testes relevante; packing continua preservado, mas fora do foco analítico.</small></div>
      <section class="mes-context-panel ames-process-contexts">${sectionHead('Falha → evidência temporal / AT','Manual/Automatic é modo de registro da falha; retrabalho, A5162, A5201 e retornos continuam separados como evidência.')}${rowsTable(contexts,[['pcba_sn','PCBA'],['defect_code','Falha'],['defect_time','Defect Time'],['registration_mode','Manual/Automatic'],['failure_family','Família'],['reference_rule_id','Regra'],['reference_station_code','Posto relevante'],['reference_event_time','Horário relevante'],['reference_pass_count_before_defect','Passagens antes'],['repair_action','AT / ação'],['return_a5201_event_time','Retorno A5201'],['next_reference_event_time','Próx. posto'],['previous_operation_code','Processo anterior'],['previous_event_time','Horário anterior'],['status','Status']],{empty:'Nenhum contexto de falha/processo carregado neste recorte.'})}</section>
      <details class="mes-context-panel ames-timeline-panel"${pcba?' open':''}><summary>Timeline 3022 carregada · ${events.length} evento(s)${pcba?` · ${esc(pcba)}`:''}</summary><div class="ames-timeline-note">A5100, A5150, A5162, A5201, A5202, A5265, A5700 e A7600 permanecem como postos relevantes conforme família/regra. Múltiplas passagens precisam preservar a ordem real.</div>${rowsTable(events,[['pcba_sn','PCBA'],['operation_code','Posto'],['operation_name','Processo'],['station','Station'],['event_time','Horário'],['event_group','Grupo'],['hist_seq','Hist Seq']],{empty:'Nenhum evento 3022 carregado para este recorte.'})}</details>`;
    root.querySelector('[data-process-line]').addEventListener('change',e=>{line=e.target.value;pcba='';defect='';last='';render();});
    root.querySelector('[data-process-pcba]').addEventListener('change',e=>{pcba=e.target.value.trim();last='';render();});
    root.querySelector('[data-process-pcba]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.dispatchEvent(new Event('change',{bubbles:true}));}});
    root.querySelector('[data-process-defect]').addEventListener('change',e=>{defect=e.target.value;last='';render();});
  }
  return {render,clear(){root?.replaceChildren();mounted=false;last='';}};
}
