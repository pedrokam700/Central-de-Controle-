import {displayValue,formatFactoryDateTime as factoryTime,formatFactoryDate as factoryDate} from './data/time-display.mjs';
import {processPassageDiagnostic} from './data/sn-process-diagnostic.mjs';
import {trustedProductionEvidence,genericReturnEvidence} from './data/production-evidence.mjs';
import {collectionStatus} from './collection-status.mjs';
import {componentFamily} from "./data/reuse-analysis.mjs";
import { LINE_IDS } from './data/contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';
import { createAgentEvidenceView } from './agent-evidence-view.mjs';
import {createSourceCaptureHistory} from './console-source-capture-history.mjs';
import {traceTargetForLine} from './data/trace-targets.mjs';

const lineOptions=(selected)=>LINE_IDS.map((line,i)=>`<option value="${line}"${selected===line?' selected':''}>Linha ${i+1} · ${line}</option>`).join('');
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const relationLabel=value=>({MESMA_FALHA:'MESMA FALHA',FALHA_SIMILAR:'MESMA FAMÍLIA / SIMILAR',FALHA_DIFERENTE:'OUTRA FALHA',SEM_HISTORICO:'SEM HISTÓRICO',SEM_FALHA_ATUAL:'SEM FALHA ATUAL'})[value]||fmt(value);
const kv=(label,value,note='')=>`<div class="ames-kv"><small>${esc(label)}</small><b>${esc(fmt(value))}</b>${note?`<span>${esc(note)}</span>`:''}</div>`;
const modeLabel=value=>({full:'Completo · 3074 + 2114 + 3022',process_only:'Somente processo · 3022',reuse_only:'Somente reuso · 3074 + 2114'})[value]||fmt(value);

function safeProcessContext(row={}){
  const production=trustedProductionEvidence(row),ret=genericReturnEvidence(row);
  const passage=processPassageDiagnostic(row);
  return {...row,
    previous_passage_shift:passage.passage_shift,
    previous_passage_operational_date:passage.passage_operational_date,
    reference_pass_count_before_defect:passage.status==='unmapped'?null:row.reference_pass_count_before_defect,
    reference_station_code:production.station,reference_event_time:production.event_time,
    production_event_time:production.event_time,production_shift:production.shift,
    production_operational_date:production.operational_date,production_evidence_proven:production.trusted,
    return_station_code:ret.label,return_event_time:ret.event_time,return_evidence_proven:ret.proven,
  };
}

// Last proven passage is process context, never a substitute for defect generation.
function processReferenceNotes(contexts){
  return contexts.filter(c=>!c.production_evidence_proven||['OPERATIONAL_ESTIMATE_NOT_CAUSE','OBSERVED_DEFECT_STATION_NOT_ROOT_CAUSE'].includes(c.reference_confidence)).map(ctx=>{
    const estimated=ctx.reference_confidence==='OPERATIONAL_ESTIMATE_NOT_CAUSE';
    const atAssembly=ctx.reference_confidence==='OBSERVED_DEFECT_STATION_NOT_ROOT_CAUSE';
    if(estimated||atAssembly){
      const station=ctx.reference_station_code||'—',title=estimated
        ?'Referência aproximada de montagem: '+station
        :'Falha registrada na montagem: '+station;
      const timing=ctx.production_evidence_proven
        ?'<div class="ames-inline-facts"><span>Horário da referência: <b>'+esc(factoryTime(ctx.reference_event_time))+
         '</b></span><span>Turno da referência: <b>'+esc(ctx.production_shift||'—')+
         '</b></span><span>Dia produtivo: <b>'+esc(factoryDate(ctx.production_operational_date))+'</b></span></div>'
        :'<p>Sem passagem/registro temporal 3022 comprovado para esta referência.</p>';
      const caveat=estimated
        ?'A5150 é um marco intermediário da montagem usado para estimar o turno da ocorrência funcional detectada no teste; NÃO é prova do posto exato nem da causa.'
        :'Posto onde a falha foi registrada dentro de A5100–A5162; NÃO comprova o instante em que o defeito começou ou sua causa.';
      return '<article class="ames-evidence-card" data-sn-operational-reference>'+
        '<strong>'+esc(title)+'</strong><p>Falha '+esc(ctx.defect_code||'—')+' · Família '+esc(ctx.failure_family||'—')+
        ' · Modelo '+esc(ctx.product_model||'—')+'</p>'+timing+
        '<p>'+esc(ctx.reference_reason||'')+'</p><p class="mes-context">'+esc(caveat)+'</p></article>';
    }
    const d=processPassageDiagnostic(ctx),unmapped=d.status==='unmapped';
    const observed=d.evidence==='3022_COMPLETED_PRE_DEFECT';
    const title=unmapped?'Posto de geração ainda não mapeado para esta falha':'Passagem de referência ainda não comprovada';
    const facts=observed
      ?'<div class="ames-inline-facts"><span>Última passagem concluída: <b>'+esc(d.code)+'</b></span><span>Horário da passagem: <b>'+esc(factoryTime(d.passage_time))+'</b></span><span>Turno da passagem: <b>'+esc(d.passage_shift)+'</b></span><span>Dia operacional da passagem: <b>'+esc(factoryDate(d.passage_operational_date))+'</b></span></div>'
      :'<p>Não há horário anterior comprovado neste contexto.</p>';
    return '<article class="ames-evidence-card" data-sn-unmapped-origin><strong>'+esc(title)+'</strong>'+
      '<p>Falha '+esc(ctx.defect_code||'—')+' · Família '+esc(d.family||'não classificada')+
      ' · Modelo '+esc(d.model||'não informado')+' · Registro '+esc(ctx.registration_mode||'não informado')+'</p>'+
      (d.reason?'<p>'+esc(d.reason)+'</p>':'')+facts+
      '<p class="mes-context">Os horários acima pertencem à passagem observada, NÃO à geração da falha. A causa não foi confirmada.</p></article>';
  }).join('');
}

function rowsTable(rows,columns,{empty='Nenhum registro disponível.',highlight}={}){
  if(!rows?.length)return `<div class="ames-empty"><span>—</span><p>${esc(empty)}</p></div>`;
  return `<div class="table-wrap"><table><thead><tr>${columns.map(([key,label])=>`<th>${esc(label||key)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,index)=>`<tr${highlight?.(row,index)?' class="ames-evidence-hit"':''}>${columns.map(([key])=>`<td>${esc(displayValue(key,row?.[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
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
    const trace2114=result.trace_2114,trace3074=result.trace_3074,trace3022=result.trace_3022;
    const has2114=!!trace2114&&Array.isArray(trace2114.previous_failures),has3074=!!trace3074&&Array.isArray(trace3074.reused_components),has3022=!!trace3022&&(Array.isArray(trace3022.process_passages)||Number.isFinite(result.summary?.['3022_events']));
    const reuseCountVerified=has3074&&trace3074?.material_selection?.status==='selected_at_latest_2114_candidate'&&
      trace3074?.material_selection?.temporal_unknown===0&&
      (Array.isArray(trace3074?.query?.rows)||trace3074?.status==='complete');
    const current=has2114?trace2114.current_failure||null:null,previous=has2114?trace2114.previous_failures:[],reused=has3074?trace3074.reused_components:[],local=result.local_snapshot||{},process=trace3022||{},contexts=(local.process_contexts||[]).map(safeProcessContext),passages=Array.isArray(process.process_passages)?process.process_passages:[];
    const processCount=has3022?(Number.isFinite(result.summary?.['3022_events'])?result.summary['3022_events']:passages.length):'indisponível';
    root.querySelector('[data-sn-result]').innerHTML=`<div class="ames-summary-grid ames-sn-summary">${kv('SN consultada',result.sn||lastSn,'entrada exata')}${kv('Tipo detectado',result.detected_type,'retorno da fonte')}${kv('Linha',result.line,'detectada pela fonte')}${kv('CPH / modelo',result.product_model,'CPH exato retornado')}${kv('Shift 2114',result.shift_2114,'retornado pela fonte; seleção automática é validada no gate físico')}${kv('Materiais 2º+ uso',reuseCountVerified?reused.length:'indisponível',reuseCountVerified?'contagem observada 3074 com vínculo temporal':'3074 ausente ou classificação temporal incompleta')}${kv('Eventos 3022',processCount,has3022?'3022 consultada':'3022 ausente na resposta')}${kv('Falhas anteriores',has2114?previous.length:'indisponível',has2114?'2114 consultada':'2114 ausente na resposta')}</div>
      <div class="ames-investigation-grid"><section class="mes-context-panel ames-priority-panel">${sectionHead('Falha atual da PCBA','Registro 2114 associado à ocorrência atual.')}${!has2114?'<div class="ames-empty"><span>—</span><p>2114 indisponível nesta resposta; ausência não equivale a zero ou a inexistência de histórico.</p></div>':current?rowsTable([current],[['Defect Description','Descrição da falha'],['Defect Type','Tipo de análise 2114'],['Defect Hist Seq','Sequência 2114'],['Defect Time','Registro da falha (MES)'],['Manual/Automatic','Registro'],['Repair Status','Vínculo Y/N']]):'<div class="ames-empty"><span>—</span><p>A 2114 foi consultada, mas não confirmou falha atual para esta SN.</p></div>'}</section>
      <section class="mes-context-panel">${sectionHead('Falhas antigas da PCBA','Histórico da própria PCBA, separado da falha atual.')}<p class="ames-2114-table-note">2114 identifica a falha e a sequência. Os nomes dos ATs aparecem nos registros 3012 do alerta, sem atribuição a um Hist Seq quando não há vínculo comprovado. Y/N indica vínculo, não reparo realizado.</p>${has2114?rowsTable(previous,[['Defect Description','Descrição da falha'],['Defect Type','Tipo de análise 2114'],['Defect Hist Seq','Sequência 2114'],['Defect Time','Registro da falha (MES)'],['Manual/Automatic','Registro'],['Repair Status','Vínculo Y/N'],['relation','Relação histórica']],{empty:'A 2114 foi consultada e não retornou falhas anteriores para esta SN.'}):'<div class="ames-empty"><span>—</span><p>Histórico 2114 indisponível nesta resposta.</p></div>'}</section></div>
      <section class="mes-context-panel">${sectionHead('Materiais em 2º uso ou mais','Segundo uso de Material SN é separado de segundo uso da própria PCBA.')}${!has3074?'<div class="ames-empty"><span>—</span><p>3074 indisponível nesta resposta; não converter ausência de fonte em zero de reuso.</p></div>':reused.length?`<div class="ames-reuse-list">${reused.map(item=>`<article class="ames-evidence-card"><div class="ames-evidence-card-head"><div><b>${esc(componentFamily(item.item_type)||item.item_type||'Material')}</b><span>${esc(item.item_sn||'')}</span></div><span class="status">${esc(relationLabel(item.relation_to_current_failure))}</span></div><div class="ames-inline-facts"><span>Usos conhecidos <b>${esc(fmt(item.known_use_count))}</b></span><span>Reusos <b>${esc(fmt(item.reuse_count))}</b></span></div><p>PCBAs anteriores/desvinculadas: ${esc((item.previous_pcbas||[]).join(', ')||'nenhuma confirmada')}</p>${(item.previous_pcba_evidence||[]).map(ev=>`<div class="ames-prior-pcba"><b>${esc(ev.pcba_sn||'')}</b> · ${esc(relationLabel(ev.relation))}<br><small>${esc(ev.reason||'')}</small>${ev.history?rowsTable([ev.history],[['Defect Code','Defect Code antigo'],['Defect Description','Defect Description antigo'],['Defect Time','Registro antigo (MES)'],['Manual/Automatic','Manual/Automatic'],['Repair Status','Repair Status']]):''}${ev.repair_evidence_3012?.length?'<p>3012 · candidatos da mesma PCBA</p>'+rowsTable(ev.repair_evidence_3012,[['defect_code','Defect Code'],['defect_time','Registro da falha (MES)'],['repair_user','Repair User'],['repair_time','Repair Time'],['repair_code','Repair Code'],['repair_comment','Repair Comment']]):''}</div>`).join('')}</article>`).join('')}</div>`:'<div class="ames-empty"><span>—</span><p>A 3074 foi consultada e nenhum Material SN em 2º+ uso foi confirmado nesta resposta.</p></div>'}</section>
      <section class="mes-context-panel ames-process-evidence">${sectionHead('3022 · evidência temporal de processo','Registro da falha (MES) não define geração. Geração, turno e dia só aparecem quando a passagem no posto de referência é comprovada pela 3022.')}<div class="ames-rule-strip"><b>Regra temporal:</b><span>ocorrência → posto de referência 3022 → última passagem concluída válida ≤ registro da falha</span></div>${contexts.length?processReferenceNotes(contexts)+rowsTable(contexts,[['defect_code','Falha'],['defect_time','Registro da falha (MES)'],['registration_mode','Modo de registro'],['failure_family','Família'],['reference_station_code','Posto de referência (3022)'],['reference_event_time','Horário da referência (3022)'],['production_shift','Turno da referência (3022)'],['production_operational_date','Dia da referência (3022)'],['reference_pass_count_before_defect','Passagens no posto de referência'],['previous_operation_code','Última passagem antes do registro'],['previous_event_time','Horário da passagem anterior'],['previous_passage_shift','Turno da passagem anterior'],['previous_passage_operational_date','Dia operacional da passagem anterior'],['reference_confidence','Classificação da referência'],['reference_reason','Critério da referência'],['repair_action','AT / ação'],['return_station_code','Posto de retorno'],['return_event_time','Horário do retorno'],['status','Status']]):has3022?rowsTable(passages,[['operation_code','Posto'],['operation_name','Processo'],['event_time','Horário da passagem 3022'],['production_shift','Turno da passagem 3022'],['production_operational_date','Dia operacional da passagem'],['hist_seq','Hist Seq']],{empty:'A 3022 foi consultada, mas nenhuma evidência temporal foi retornada para esta SN.'}):'<div class="ames-empty"><span>—</span><p>3022 indisponível nesta resposta; não mostrar zero como se a tela tivesse sido consultada com sucesso.</p></div>'}</section>
      ${process.operator_evidence?.length?`<section class="mes-context-panel">${sectionHead('Operador / 3022','Campos retornados pela fonte; não confirma causa raiz.')}${rowsTable(process.operator_evidence,[['pcba_sn','PCBA'],['operator_id','Operator ID'],['operator_name','Operador'],['station','Posto'],['operation_name','Processo'],['event_time','Horário'],['source','Fonte']])}</section>`:''}
      ${(result.warnings||[]).length?`<div class="notice warn"><b>Atenção</b><br>${result.warnings.map(esc).join('<br>')}</div>`:''}`;
  }
  return {render,clear(){root?.replaceChildren();mounted=false;lastKey='';lastSn='';}};
}

export function createTraceConsoleView(root,store,client){
  let mounted=false,line=store.context?.()?.line_id||store.preferredLine?.()||LINE_IDS[0],evidence,captures,periodKey=null;
  function render(){
    const contextLine=store.context?.()?.line_id||store.preferredLine?.();
    if(contextLine&&LINE_IDS.includes(contextLine)&&contextLine!==line){
      line=contextLine;
      const picker=root.querySelector('[data-trace-line]');
      if(picker)picker.value=line;
    }
    if(!mounted){
      root.innerHTML=`<div class="ames-trace-layout"><form class="ames-console-form ames-trace-config" data-trace-form>
        ${sectionHead('Escopo desta coleta','A coleta selecionada nunca mistura linhas e um modo não apaga evidência já existente dos outros modos.')}
        <fieldset><legend>Linhas desta execução</legend>${LINE_IDS.map((id,i)=>`<label class="mes-opt-in"><input type="checkbox" name="lines" value="${id}"${id===line?' checked':''}>Linha ${i+1} · ${id} <small data-trace-line-state="${id}"></small></label>`).join('')}</fieldset>
        <p class="mes-context" data-trace-context></p>
        <div class="ames-mode-grid"><label class="ames-mode-card"><input type="radio" name="trace_mode" value="full" checked><span><b>Completo</b><small>3074 + 2114 + 3022</small></span></label><label class="ames-mode-card"><input type="radio" name="trace_mode" value="process_only"><span><b>Processo</b><small>Somente horários 3022</small></span></label><label class="ames-mode-card"><input type="radio" name="trace_mode" value="reuse_only"><span><b>Reuso</b><small>3074 + 2114</small></span></label></div>
        <div class="mes-filters"><label>Perfil<select name="performance"><option value="fast">Rápido</option><option value="balanced" selected>Equilibrado</option><option value="safe">Seguro</option></select></label></div><details data-trace-limits><summary>Limites avançados</summary><p>Sem limite por padrão. Preencha somente para limitar esta execução.</p><div class="mes-filters"><label>Ocorrências máximas / linha<input type="number" name="max_failures" min="1" placeholder="Sem limite"></label><label>PCBAs máximas / linha<input type="number" name="max_pcbas" min="1" placeholder="Sem limite"></label></div></details><details><summary>Códigos manuais (avançado)</summary><label>Códigos exatos de falha<input name="codes" placeholder="Separados por vírgula"></label></details><div class="mes-pagination"><button type="button" class="button primary" data-trace-run>Iniciar coleta</button><button type="button" class="button secondary" data-trace-cancel>Cancelar</button></div>
      </form><aside class="mes-context-panel ames-trace-progress"><h3>Progresso da rastreabilidade</h3><div data-trace-status></div></aside></div>
      <section class="mes-context-panel ames-trace-evidence-wrap">${sectionHead('Evidência carregada','Selecione uma linha para inspecionar exatamente o que sustenta a leitura.',`<label>Visualizar linha<select data-trace-line>${lineOptions(line)}</select></label>`)}<section data-trace-evidence></section><section data-trace-capture-index></section></section>`;
      mounted=true;evidence=createAgentEvidenceView(root.querySelector('[data-trace-evidence]'),store);
      captures=createSourceCaptureHistory(root.querySelector('[data-trace-capture-index]'),client,store);
      root.querySelector('[data-trace-line]').addEventListener('change',e=>{line=e.target.value;evidence.render(line);});
      root.querySelector('[data-trace-form]').addEventListener('submit',e=>{e.preventDefault();root.querySelector('[data-trace-run]').click();});
      root.querySelector('[data-trace-run]').addEventListener('click',async()=>{
        const button=root.querySelector('[data-trace-run]');if(button.disabled)return;
        button.disabled=true;store.updateAgent({submitting:true,error:''});render();
        try{
          const form=root.querySelector('[data-trace-form]'),data=new FormData(form),lines=[...form.querySelectorAll('[name=lines]:checked')].map(x=>x.value);
          if(!lines.length)throw Error('Selecione pelo menos uma linha.');
          await client.collect('deep',{lines,performance:data.get('performance'),max_failures:Number(data.get('max_failures')||0),max_pcbas:Number(data.get('max_pcbas')||0),defect_codes:String(data.get('codes')||'').split(',').map(x=>x.trim()).filter(Boolean),trace_mode:data.get('trace_mode')||'full'});
        }catch(error){store.updateAgent({error:error.message});}
        finally{store.updateAgent({submitting:false});render();}
      });
      root.querySelector('[data-trace-cancel]').addEventListener('click',()=>client.cancel().catch(error=>root.querySelector('[data-trace-status]').innerHTML=`<div class="notice warn">${esc(error.message)}</div>`));
    }
    const currentPeriod=store.readingPeriod?.(),nextPeriodKey=JSON.stringify(currentPeriod);
    // Changing Hoje/Último dia produtivo never retains a hidden multi-line
    // selection from another period. The operator can opt in to other lines.
    if(nextPeriodKey!==periodKey){
      periodKey=nextPeriodKey;
      for(const check of root.querySelectorAll('[name=lines]'))check.checked=check.value===line;
    }
    for(const id of LINE_IDS){
      const eligibility=traceTargetForLine(store,id),target=root.querySelector(`[data-trace-line-state="${id}"]`);
      if(target){target.textContent=eligibility.available?`snapshot ${eligibility.snapshot_id} · r${eligibility.revision}`:eligibility.reason;
        target.title=eligibility.available?'Revisão local deste período disponível':eligibility.reason;}
    }
    const contextNote=root.querySelector('[data-trace-context]');
    if(contextNote)contextNote.textContent=currentPeriod?.mode==='today'
      ?'Coleta explícita da revisão 3028 selecionada. Nenhuma consulta ao A-MES é iniciada ao navegar.'
      :'Período histórico somente leitura · Para completar 3074/2114/3022, marque as linhas com revisão local comprovada. Linhas sem revisão não bloqueiam as demais.';
    const a=store.agent(),status=root.querySelector('[data-trace-status]');
    root.querySelector('[data-trace-run]').disabled=!!a.submitting;
    status.setAttribute('aria-live','polite');status.innerHTML=collectionStatus(a);
    evidence?.render(line);
    const selected=currentPeriod,read=store.read(line),payload=read.snapshot?.canonical;
    const box=root.querySelector('[data-trace-capture-index]');
    if(box)box.hidden=selected?.mode==='today';
    if(selected?.mode!=='today'){
      // Read-only SQLite capture index bound to selected historical revision.
      captures?.show(payload,payload?{history_source:read.source==='local'?'local':'shared',
        line_id:line,source_id:payload.source_id,snapshot_id:payload.snapshot_id,
        snapshot_revision:payload.snapshot_revision}:null);
    }
  }
  return {render,clear(){captures?.clear();captures=undefined;root?.replaceChildren();mounted=false;evidence=undefined;}};
}

export function filterProcessScope(allContexts=[],allEvents=[],{pcba='',defect=''}={}){
  const contexts=(allContexts||[]).map(safeProcessContext).filter(row=>(!pcba||row.pcba_sn===pcba)&&(!defect||row.defect_code===defect));
  const pcbas=[...new Set(contexts.map(row=>row.pcba_sn).filter(Boolean))],pcbaSet=new Set(pcbas);
  const events=allEvents.filter(row=>{if(pcba&&row.pcba_sn!==pcba)return false;if(defect&&!pcbaSet.has(row.pcba_sn))return false;return true;});
  return {contexts,events,pcbas};
}

export function createProcessConsoleView(root,store){
  let line=LINE_IDS[0],pcba='',defect='',shift='',mounted=false,last='';
  function render(){
    const snapshot=store.read(line).snapshot,process=snapshot?.process_timeline||{},allContexts=process.contexts||[],allEvents=process.events||[];
    const scope=filterProcessScope(allContexts,allEvents,{pcba,defect});
    const {pcbas}=scope,shiftEvidence=scope.contexts.some(r=>r.production_evidence_proven&&r.production_shift),contexts=scope.contexts.filter(r=>!shift||!shiftEvidence||r.production_shift===shift),events=scope.events.filter(r=>!shift||!shiftEvidence||r.production_shift===shift);
    const key=JSON.stringify([line,snapshot?.snapshot_id,pcba,defect,shift,contexts,events,pcbas]);if(key===last)return;last=key;
    const codes=[...new Set(allContexts.map(r=>r.defect_code).filter(Boolean))],withReference=contexts.filter(r=>r.production_evidence_proven).length,withAt=contexts.filter(r=>r.repair_action||r.return_evidence_proven).length,multiPass=contexts.filter(r=>Number(r.reference_pass_count_before_defect||0)>1).length;
    root.innerHTML=`<section class="ames-process-toolbar mes-context-panel">${sectionHead('Leitura temporal 3022 / AT','Registro da falha no MES é separado da passagem real 3022. Turno/dia/geração só aparecem quando a referência está comprovada.')}<div class="mes-filters"><label>Linha<select data-process-line>${lineOptions(line)}</select></label><label>PCBA exata<input data-process-pcba value="${esc(pcba)}" placeholder="todas as PCBAs"></label><label>Turno comprovado 3022<select data-process-shift><option value="">Todos</option><option value="1st Shift"${shift==='1st Shift'?' selected':''}>1º Turno</option><option value="2nd Shift"${shift==='2nd Shift'?' selected':''}>2º Turno</option></select></label><label>Falha<select data-process-defect><option value="">Todas as falhas</option>${codes.map(code=>`<option${code===defect?' selected':''}>${esc(code)}</option>`).join('')}</select></label></div></section>
      <div class="ames-summary-grid ames-process-kpis">${kv('Contextos',contexts.length)}${kv('PCBAs no recorte',pcbas.length)}${kv('Com geração 3022 comprovada',withReference)}${kv('Com AT / retorno comprovado',withAt)}${kv('Múltiplas passagens',multiPass)}${kv('Eventos 3022',events.length)}${kv('1º Turno · comprovados',scope.contexts.filter(r=>r.production_shift==='1st Shift').length)}${kv('2º Turno · comprovados',scope.contexts.filter(r=>r.production_shift==='2nd Shift').length)}${kv('Turno sem evidência',scope.contexts.filter(r=>!r.production_evidence_proven).length)}</div>
      <div class="ames-rule-strip ames-rule-strip-strong"><b>Regra temporal obrigatória</b><span>ocorrência → posto de referência 3022 → última passagem concluída válida ≤ registro da falha</span><small>Passagem anterior é contexto. Retorno pós-reparo usa o primeiro posto/operação comprovado; A5201 é apenas um possível posto, nunca uma regra fixa.</small></div>
      <section class="mes-context-panel ames-process-contexts">${sectionHead('Falha → evidência temporal / AT','Manual/Automatic é modo de registro da falha; reparo e retorno permanecem evidências separadas.')}${rowsTable(contexts,[['pcba_sn','PCBA'],['defect_code','Falha'],['defect_time','Registro da falha (MES)'],['registration_mode','Manual/Automatic'],['failure_family','Família'],['reference_rule_id','Regra'],['reference_station_code','Posto de referência (3022)'],['reference_event_time','Horário de geração (3022)'],['production_shift','Turno comprovado (3022)'],['production_operational_date','Dia de produção (3022)'],['reference_pass_count_before_defect','Passagens antes'],['repair_action','AT / ação'],['return_station_code','Posto de retorno'],['return_event_time','Horário do retorno'],['next_reference_event_time','Próx. posto'],['previous_operation_code','Última passagem antes do registro'],['previous_event_time','Horário da passagem anterior'],['status','Status']],{empty:'Nenhum contexto de falha/processo carregado neste recorte.'})}</section>
      <details class="mes-context-panel ames-timeline-panel"${pcba||defect?' open':''}><summary>Timeline 3022 do recorte · ${events.length} evento(s)${pcba?` · ${esc(pcba)}`:''}${defect?` · falha ${esc(defect)}`:''}</summary><div class="ames-timeline-note">Com filtro de falha, a timeline mostra as PCBAs pertencentes aos contextos dessa falha. Os eventos abaixo são passagens 3022 reais; não são automaticamente o ponto de geração da falha.</div>${rowsTable(events,[['pcba_sn','PCBA'],['operation_code','Posto'],['operation_name','Processo'],['station','Station'],['event_time','Horário da passagem 3022'],['production_shift','Turno da passagem 3022'],['production_operational_date','Dia operacional da passagem'],['event_group','Grupo'],['hist_seq','Hist Seq']],{empty:'Nenhum evento 3022 carregado para este recorte.'})}</details>`;
    const operatorRows=events.flatMap(e=>(e.provenance?.adapter?.operator_events||[]).map(o=>({...o,pcba_sn:e.pcba_sn}))),uniqueOperators=[...new Map(operatorRows.map(r=>[JSON.stringify(r),r])).values()];
    if(uniqueOperators.length){const box=document.createElement('section');box.className='mes-context-panel';box.innerHTML=sectionHead('Operador / 3022','Campos retornados pela fonte; não confirma causa raiz.')+rowsTable(uniqueOperators,[['pcba_sn','PCBA'],['operator_id','Operator ID'],['operator_name','Operador'],['station','Posto'],['operation_name','Processo'],['event_time','Horário'],['source','Fonte']]);root.append(box);}
    root.querySelector('[data-process-line]').addEventListener('change',e=>{line=e.target.value;pcba='';defect='';last='';render();});
    root.querySelector('[data-process-pcba]').addEventListener('change',e=>{pcba=e.target.value.trim();last='';render();});
    root.querySelector('[data-process-pcba]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.dispatchEvent(new Event('change',{bubbles:true}));}});
    root.querySelector('[data-process-shift]').addEventListener('change',e=>{shift=e.target.value;last='';render();});
    root.querySelector('[data-process-defect]').addEventListener('change',e=>{defect=e.target.value;last='';render();});
  }
  return {render,clear(){root?.replaceChildren();mounted=false;last='';}};
}
