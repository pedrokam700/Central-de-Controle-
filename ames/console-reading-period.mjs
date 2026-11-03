import {escapeHtml as esc} from './evidence-view.mjs';
import {LINE_IDS} from './data/contract.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';
import {fiveSourceEvidence} from './data/source-coverage.mjs';
import {projectRepairTechnicianNames} from './console-sn-repair-evidence.mjs';
import {createSourceCaptureHistory} from './console-source-capture-history.mjs';
import {operationalColumns,renderOperationalTable} from './console-base-view.mjs';
import {traceTargetForLine} from './data/trace-targets.mjs';
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;

export function paintReadingPeriod(root,store,controller,{onContinueTrace,onCollectCustom}={}){
  const p=store.readingPeriod(),status=store.agent().period_read;
  const oldForm=root.querySelector('[data-reading-range]');
  const samePeriod=root.dataset.readingScopeKey===JSON.stringify(p);
  const draftStart=samePeriod&&oldForm?.elements.start.value||p?.start||'';
  const draftEnd=samePeriod&&oldForm?.elements.end.value||p?.end||'';
  const editing=root.dataset.readingEditorOpen==='true'||p?.mode==='custom';
  root.dataset.readingScopeKey=JSON.stringify(p);
  const loaded=LINE_IDS.filter(line=>!!store.read(line).snapshot);
  const line=store.context?.()?.line_id||store.preferredLine?.();
  const missing=p?.mode!=='today'&&status?.status!=='loading'&&!!line&&!store.read(line).snapshot;
  const sourceChoice=status?.source_choices?.find(choice=>choice.line_id===line&&choice.options?.length);
  const unresolved=sourceChoice&&!sourceChoice.selected_source_id;
  const recovered=(status?.recovered_lines||[]).filter(item=>LINE_IDS.includes(item.line_id));
  // One consistent selector for the current line. It remains available AFTER opening a revision.
  const sourcePicker=sourceChoice&&status?.status!=='loading'?'<details class="mes-context" data-history-source-advanced><summary>'+t('Opções avançadas · origem do histórico','Advanced options · history source')+'</summary><div data-history-source-picker>'+
    '<label>'+t('Origem do histórico · Linha','Historical source · Line')+' '+esc(line)+
    '<select data-history-source-select aria-label="'+t('Trocar origem da coleta','Switch capture source')+'">'+
    '<option value=""'+(unresolved?' selected':' disabled')+'>'+t('Selecione a coleta comprovada','Select a verified capture')+'</option>'+
    sourceChoice.options.map(o=>'<option value="'+esc(o.source_id)+'"'+(sourceChoice.selected_source_id===o.source_id?' selected':'')+'>'+
      esc((o.history_source==='local'?t('Local','Local'):t('Compartilhado','Shared'))+' · '+o.source_id+
        ' · '+formatFactoryDateTime(o.collected_at)+' · r'+(o.snapshot_revision??'—'))+'</option>').join('')+
    '</select></label><small>'+t('Trocar a origem só muda a leitura desta linha. Nenhuma coleta MES será iniciada; revisões anteriores permanecem disponíveis.','Switching the source changes only this line\'s read. No MES collection starts; previous revisions remain available.')+'</small></div></details>':'';
  const note=status?.status==='loading'?t('Consultando revisões salvas…','Reading saved revisions…'):
    unresolved?t('Existem coletas de postos diferentes. Escolha a origem para abrir; nada será descartado.','Multiple workstation captures exist. Choose one to open; nothing will be discarded.') :
    missing?t('Nenhuma revisão salva disponível nesta linha e período. Não significa zero falhas. Após a coleta, use Atualizar leitura se necessário.','No saved revision for this line and period. This is not zero failures. After collection, use Refresh reading if needed.') :
    p?.mode!=='today'&&status?.status==='ready'?loaded.length+' '+t('linha(s) com revisão disponível','line(s) with saved revisions'):'';
  const advancedOpen=Boolean(root.querySelector('[data-history-source-advanced]')?.open);
  root.setAttribute('data-no-i18n','');
  root.innerHTML=`<nav class="ames-history-tabs" aria-label="${t('Período de leitura','Reading period')}">${[['today',t('Hoje','Today')],['previous',t('Último dia produtivo','Last production day')],['custom',t('Período…','Period…')]].map(([id,label])=>`<button type="button" class="button secondary" data-read-period="${id}" aria-pressed="${editing?id==='custom':p?.mode===id}">${label}</button>`).join('')}</nav><p class="mes-context" data-reading-label>${p?esc(formatFactoryDateTime(p.start)+' → '+formatFactoryDateTime(p.end)):''} · America/Sao_Paulo · ${t('07:00 → 07:00; turnos são outra dimensão','07:00 → 07:00; shifts are a separate dimension')}${p?.mode!=='today'?' · '+t('Somente leitura do passado','Read-only history'):''}</p><form data-reading-range${editing?'':' hidden'}><p class="mes-context">${t('Escolha a janela desejada. Ver dados não inicia A-MES; coletar exige clique explícito.','Choose a time window. Viewing saved data does not start MES; collection requires an explicit click.')}</p><div class="mes-filters"><label>${t('Início','Start')}<input type="datetime-local" name="start" required value="${esc(draftStart)}"></label><label>${t('Fim','End')}<input type="datetime-local" name="end" required value="${esc(draftEnd)}"></label></div><div class="mes-pagination"><button class="button secondary" type="submit">${t('Ver dados armazenados','View stored data')}</button>${typeof onCollectCustom==='function'?`<button class="button primary" type="button" data-reading-collect${store.agent().status==='connected'?'':' disabled'}>${t('Coletar período desta linha','Collect this line period')}</button>`:''}</div>${typeof onCollectCustom==='function'?`<small>${t('Linha selecionada','Selected line')}: ${esc(line||'—')}. ${t('A coleta será salva como histórico, sem substituir Hoje.','The capture will be saved as history without replacing Today.')}</small>`:''}</form><p role="status" data-reading-status>${esc(status?.errors?.length?status.errors.map(e=>e.line_id+': '+e.error).join(' · '):note)}</p>${recovered.length?`<div class="notice warn" data-reading-recovery role="status">${recovered.map(x=>esc(t('Linha','Line')+' '+x.line_id+' · '+t('revisão anterior aberta para leitura','older revision opened read-only')+' · snapshot '+x.snapshot_id+' / r'+x.snapshot_revision+' · '+x.unreadable_revisions+' '+t('revisão(ões) recente(s) indisponível(is). Atualize a leitura; não execute coleta MES nesta versão recuperada.','newer revision(s) unavailable. Refresh reading; do not collect MES from this recovered version.'))).join('<br>')}</div>`:''}${sourcePicker}${p?.mode!=='today'?'<button type="button" class="button secondary" data-reading-reload>'+t('Atualizar leitura','Refresh reading')+'</button>':''}`;
  if(p?.mode!=='today'&&typeof onContinueTrace==='function'){
    const target=traceTargetForLine(store,line),agent=store.agent();
    const enabled=target.available&&agent.status==='connected'&&agent.capabilities?.exact_trace_targets===true;
    const reason=!target.available?target.reason:agent.status!=='connected'
      ?t('Conecte o agente local para continuar.','Connect the local agent to continue.')
      :t('Este agente ainda não comprova rastreabilidade por revisão exata.','This agent does not verify exact-revision tracing.');
    const continuation=document.createElement('section');
    continuation.className='mes-context-panel';continuation.dataset.periodContinuation='';
    continuation.innerHTML=`<h4>${t('Completar a coleta deste período','Complete this period capture')}</h4>`+
      `<p class="mes-context">${t('Etapa 1: 3028 armazenada. Etapa 2: extrair 3074, 2114 e 3022 usando a mesma linha, origem e revisão, sem repetir a 3028.','Stage 1: stored 3028. Stage 2: extract 3074, 2114 and 3022 from the same line, source and revision without rerunning 3028.')}</p>`+
      `<p data-period-revision>${esc(line||'—')} · ${esc(target.available?'snapshot '+target.snapshot_id+' / r'+target.revision:reason)}</p>`+
      `<button type="button" class="button primary" data-period-extract${enabled?'':' disabled'}>${t('Continuar para 3074 + 2114 + 3022','Continue to 3074 + 2114 + 3022')}</button>`+
      `<small>${t('A próxima tela permite conferir as linhas e iniciar a coleta. Nenhum MES é consultado ao navegar.','The next screen lets you verify lines and start collection. Navigation does not query MES.')}</small>`;
    root.append(continuation);
    continuation.querySelector('[data-period-extract]')?.addEventListener('click',()=>{
      if(enabled)onContinueTrace(line);
    });
  }
  if(root.querySelector('[data-history-source-advanced]'))root.querySelector('[data-history-source-advanced]').open=advancedOpen;
  for(const b of root.querySelectorAll('[data-read-period]'))b.addEventListener('click',()=>{
    if(b.dataset.readPeriod==='custom'){
      root.dataset.readingEditorOpen='true';
      root.querySelector('[data-reading-range]').hidden=false;
      for(const option of root.querySelectorAll('[data-read-period]'))option.setAttribute('aria-pressed',String(option===b));
      return;
    }
    root.dataset.readingEditorOpen='false';
    void controller.select(b.dataset.readPeriod);
  });
  root.querySelector('[data-history-source-select]')?.addEventListener('change',event=>{
    // User explicitly chose a source; open it in one action without
    // automatically guessing between competing workstation publishers.
    const source_id=event.target.value;
    if(!source_id||!line)return;
    void controller.chooseSource(line,source_id).catch(error=>{
      const el=root.querySelector('[data-reading-status]');if(el)el.textContent=error.message;
    });
  });
  root.querySelector('[data-reading-reload]')?.addEventListener('click',()=>{
    const period=store.readingPeriod();
    void controller.select(period.mode,period.mode==='custom'?{start:period.start,end:period.end}:{}).catch(error=>{
      const el=root.querySelector('[data-reading-status]');if(el)el.textContent=error.message;
    });
  });
  const form=root.querySelector('[data-reading-range]');
  const range=()=>{
    if(!form.reportValidity())return null;
    const {start,end}=form.elements;
    if(start.value>=end.value){
      root.querySelector('[data-reading-status]').textContent=t('Fim deve ser posterior ao início.','End must be after start.');
      return null;
    }
    return {start:start.value,end:end.value};
  };
  root.querySelector('[data-reading-collect]')?.addEventListener('click',async event=>{
    const selected=range();if(!selected)return;
    const button=event.currentTarget;button.disabled=true;
    try{await onCollectCustom(selected);
    }catch(error){root.querySelector('[data-reading-status]').textContent=error.message||String(error);
    }finally{if(button.isConnected)button.disabled=false;}
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();const fields=event.currentTarget.elements;
    if(!range())return;
    root.dataset.readingEditorOpen='true';
    void controller.select('custom',{start:fields.start.value,end:fields.end.value}).catch(error=>{root.querySelector('[data-reading-status]').textContent=error.message;});
  });
}

// Stored evidence inside the existing SN/Base/CORA/3012 views. No live job result,
// localhost query or inferred repair association can enter a historical read.
export function createStoredPeriodRecords(root,store,{kind='base',client=null}={}){
  let key='',page=0,query='',dataset=kind==='repairs'?'repairs':'defects',capturePanel=null;
  const size=25;
  function render(){
    capturePanel?.clear();capturePanel=null;
    const line=store.context().line_id||store.preferredLine(),read=store.read(line),p=read.snapshot?.canonical;
    const signature=JSON.stringify([store.contextRevision(),line,p?.source_id,p?.snapshot_id,p?.snapshot_revision,document.documentElement.lang]);
    if(signature!==key){page=0;key=signature;}
    const sets={...(p?.datasets||{}),repairs:(p?.datasets?.defects||[]).flatMap(r=>(r.repair_evidence_3012||[]).map(e=>({...e,pcba_sn:r.pcba_sn,occurrence_id:r.occurrence_id,association:t('Candidata; não confirma reparo desta falha','Candidate; does not confirm repair of this failure')})))};
    const sourceRows=sets[dataset]||[];
    const all=dataset==='repairs'?projectRepairTechnicianNames(sourceRows,p?.datasets?.process_timeline||[]):sourceRows,
      needle=query.trim().toLowerCase();
    const rows=all.filter(r=>!needle|| (kind==='sn'?[r.pcba_sn,r.item_sn,r.material_sn].some(x=>String(x||'').toLowerCase()===needle):JSON.stringify(r).toLowerCase().includes(needle)));
    page=Math.min(page,Math.max(0,Math.ceil(rows.length/size)-1));
    const completeness=fiveSourceEvidence(p);
    const labels={3028:'3028 · FPY/falhas',3074:'3074 · materiais',2114:'2114 · PCBAs',3022:'3022 · passagens',3012:'3012 · AT'};
    const badges=completeness.map(s=>`<span data-source-view="${s.view}" data-source-status="${s.status}"><b>${labels[s.view]}</b>: ${s.status==='unknown'?t('não comprovado','not verified'):s.status==='candidate_partial'?t('candidatos parciais','partial candidates'):t('parcial','partial')}${s.count===null?'':` · ${s.count} ${t('registro(s)','row(s)')}`}</span>`).join(' · ');
    const titles={sn:t('Consultar SN nos dados armazenados','Find SN in stored data'),base:t('Base do período selecionado','Selected period database'),knowledge:t('Fatos armazenados do período','Stored facts for this period'),repairs:t('3012 · evidências candidatas armazenadas','3012 · stored candidate evidence')};
    root.setAttribute('data-no-i18n','');
    root.innerHTML=`<section class="mes-context-panel"><h3>${titles[kind]}</h3><p>${t('Somente os dados desta revisão. Cobertura ausente não significa zero; associação não confirma causa.','Only data from this revision. Missing coverage is not zero; association does not confirm cause.')}</p><p>${esc(line)} · ${esc(read.source)} · ${esc(p?.source_id||'—')} / ${esc(p?.snapshot_id||'—')} / r${esc(p?.snapshot_revision||'—')} · ${esc(formatFactoryDateTime(p?.collected_at))}</p><div data-five-source-coverage class="mes-context" role="status">${badges}<p>${t('Cobertura por fonte: linhas locais guardadas, não comprovação de extração integral do MES. 3012 somente associação candidata por PCBA.','Source coverage: stored local records, not proof that the entire MES view was queried. 3012 is a candidate PCBA association only.')}</p></div><form data-stored-search class="mes-filters"><label>${t('Fonte','Source')}<select name="dataset">${Object.keys(sets).map(n=>`<option value="${esc(n)}"${dataset===n?' selected':''}>${esc(({defects:'3028',pcba_history:'2114',material_reuse:'3074',process_timeline:'3022',repairs:'3012'})[n]||n)}</option>`).join('')}</select></label><label>${kind==='sn'?'SN':t('Buscar fatos','Search facts')}<input name="query" value="${esc(query)}"></label><button class="button secondary" type="submit">${t('Ver dados armazenados','View stored data')}</button></form>${dataset==='process_timeline'?'<p class="ames-process-provenance-warning">'+t('3022: AT/ação e retorno só aparecem quando uma sequência válida de reparo e passagem posterior está comprovada. Comentários 3012/3028 continuam evidências separadas; ausência de vínculo não é prova de inexistência do reparo.','3022: repair and return appear only when a valid repair/return sequence is verified. 3012/3028 comments remain separate evidence; a missing link does not prove no repair occurred.')+'</p>':''}<p role="status">${!p?t('Não coletado para este período/linha','Not collected for this period/line'):rows.length?`${rows.length} · ${t('registros observados','observed records')}`:t('Sem registro disponível; desfecho não comprovado','No available record; outcome unproven')}</p>${renderOperationalTable(rows.slice(page*size,(page+1)*size),operationalColumns(rows,dataset==='process_timeline'?'process_events':dataset,false),t('Nenhum registro comprovado para os filtros.','No verified record for the filters.'))}<div class="mes-pagination"><button class="button secondary" data-stored-prev ${page?'':'disabled'}>${t('Anterior','Previous')}</button><span>${page+1} / ${Math.max(1,Math.ceil(rows.length/size))}</span><button class="button secondary" data-stored-next ${(page+1)*size<rows.length?'':'disabled'}>${t('Próxima','Next')}</button></div>${kind==='base'&&client?'<section data-stored-captures></section>':''}</section>`;
    if(kind==='base'&&client){
      capturePanel=createSourceCaptureHistory(root.querySelector('[data-stored-captures]'),client,store);
      capturePanel.show(p,p?{history_source:read.source==='local'?'local':'shared',
        line_id:line,source_id:p.source_id,snapshot_id:p.snapshot_id,
        snapshot_revision:p.snapshot_revision}:null);
    }
    root.querySelector('form').addEventListener('submit',e=>{e.preventDefault();query=e.currentTarget.elements.query.value;dataset=e.currentTarget.elements.dataset.value;page=0;render();});
    root.querySelector('[data-stored-prev]').addEventListener('click',()=>{page--;render();});
    root.querySelector('[data-stored-next]').addEventListener('click',()=>{page++;render();});
  }
  return {render,clear(){capturePanel?.clear();capturePanel=null;root.replaceChildren();}};
}
