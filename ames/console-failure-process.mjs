import { LINE_IDS } from './data/contract.mjs';
import { displayValue } from './data/time-display.mjs';
import { trustedProductionEvidence, genericReturnEvidence } from './data/production-evidence.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';
import { defectDescription, knownDescription } from './defect-label.mjs';
import { failureGroupReuseSummaries, evidenceCountLabel, formatFailureLastOccurrence, groupedFailureName } from './failure-group-evidence.mjs';
import { EXTRA_EN } from './console-i18n-extra.mjs';

const fmt=(key,value)=>displayValue(key,value);
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;

Object.assign(EXTRA_EN,{
  'Registro da falha no MES não define quando ela foi gerada. Horário, turno e dia de produção só aparecem como comprovados quando existe passagem real da mesma PCBA no posto de referência 3022.':'The MES failure record does not define when the failure was generated. Time, shift and production day are only shown as proven when the same PCBA has real passage evidence at the 3022 reference station.',
  'ocorrência → posto de referência 3022 → última passagem válida ≤ registro da falha. Passagem anterior é contexto; não prova geração.':'occurrence → 3022 reference station → latest valid passage ≤ failure record. Previous passage is context; it does not prove generation.',
  'Registro da falha no MES é separado da passagem real 3022. Turno/dia/geração só aparecem quando a referência está comprovada.':'The MES failure record is separate from the real 3022 passage. Shift, production day and generation time appear only when the reference evidence is proven.',
  'Com geração 3022 comprovada':'With proven 3022 generation evidence',
  'ocorrência → posto de referência 3022 → última passagem concluída válida ≤ registro da falha':'occurrence → 3022 reference station → latest valid completed passage ≤ failure record',
  'Passagem anterior é contexto. Retorno pós-reparo usa o primeiro posto/operação comprovado; A5201 é apenas um possível posto, nunca uma regra fixa.':'Previous passage is context. Post-repair return uses the first proven station/operation; A5201 is only one possible station, never a fixed rule.',
  'Manual/Automatic é modo de registro da falha; reparo e retorno permanecem evidências separadas.':'Manual/Automatic is the failure registration mode; repair and return remain separate evidence.',
  'Com filtro de falha, a timeline mostra as PCBAs pertencentes aos contextos dessa falha. Os eventos abaixo são passagens 3022 reais; não são automaticamente o ponto de geração da falha.':'With a failure filter, the timeline shows PCBAs belonging to that failure context. The events below are real 3022 passages; they are not automatically the failure generation point.',
  'Hoje/Ontem usam o início operacional configurado neste posto.':'Today/Yesterday use this workstation’s configured operational start.',
  'Consultar outro período':'Query another period'
});

export function createFailureProcessAddon(root,store,filterRoot){
  let last='';
  const selectedLine=()=>filterRoot?.querySelector('[data-failure-line]')?.value||LINE_IDS[0];
  const failureRowsForCurrentFilters=snapshot=>{
    const current=[...(snapshot?.occurrences||[])],removedAvailable=snapshot?.removed_occurrences_status==='available',removed=removedAvailable?[...(snapshot?.removed_occurrences||[])]:[];
    const rows=[...current,...removed],status=filterRoot?.querySelector('[data-failure-status]')?.value||'',shift=filterRoot?.querySelector('[data-failure-shift]')?.value||'',needle=(filterRoot?.querySelector('[data-failure-search]')?.value||'').trim().toLowerCase();
    return rows.filter(row=>{const isRemoved=row.present_in_3028===false,repair=String(row.repair_status||'').toUpperCase();const statusOk=!status||(status==='REMOVED'?isRemoved:status==='N'?!isRemoved&&(repair==='N'||repair==='OPEN'):status==='Y'?!isRemoved&&(repair==='Y'||repair==='CLOSED'||repair==='FINALIZADO'):true);const text=[row.pcba_sn,row.defect_code,row.defect_desc,row.repair_comment,row.repair_user,row.defect_type,row.product_model].join(' ').toLowerCase();return statusOk&&(!shift||row.production_shift===shift)&&(!needle||text.includes(needle));});
  };
  function enrichFailureGroups(){
    const table=filterRoot?.querySelector('[data-failure-groups] table');if(!table)return;
    const line=selectedLine(),snapshot=store.read(line).snapshot;if(!snapshot)return;
    const signature=JSON.stringify([snapshot.snapshot_id,filterRoot?.querySelector('[data-failure-status]')?.value||'',filterRoot?.querySelector('[data-failure-shift]')?.value||'',filterRoot?.querySelector('[data-failure-search]')?.value||'',document.documentElement.lang]);
    if(table.dataset.failureEvidence===signature)return;table.dataset.failureEvidence=signature;
    const summaries=failureGroupReuseSummaries(snapshot,failureRowsForCurrentFilters(snapshot));
    const headRow=table.querySelector('thead tr'),head=[...(headRow?.children||[])];
    if(head.length>=4){const latestHead=head[3];head[2]?.remove();for(const label of [t('PCBAs 2º+','2nd+ use PCBAs'),t('C/ item 2º+','With 2nd+ item'),t('Mesma falha/fam.','Same failure/family')]){const th=table.ownerDocument.createElement('th');th.textContent=label;headRow.insertBefore(th,latestHead);}latestHead.textContent=t('Última ocorrência','Last occurrence');}
    for(const tr of table.querySelectorAll('tbody tr')){
      const cells=[...tr.children],button=tr.querySelector('[data-failure-group]');if(cells.length<4||!button)continue;
      const name=button.dataset.failureGroup||button.textContent||'',summary=summaries[name]||{pcbaReuse:{count:0,exact:false},itemReuse:{count:0,exact:false},sameFailureOrFamily:{count:0,exact:false}};
      const latestCell=cells[3],rawLatest=latestCell.textContent.trim();cells[2].remove();
      for(const evidence of [summary.pcbaReuse,summary.itemReuse,summary.sameFailureOrFamily]){const td=table.ownerDocument.createElement('td');td.textContent=evidenceCountLabel(evidence);if(!evidence.exact)td.title=evidence.count>0?t('Contagem mínima; parte da evidência de reuso/correlação não está disponível nesta leitura.','Minimum count; part of the reuse/correlation evidence is unavailable in this read.'):t('Fonte de reuso/correlação não comprovada nesta leitura; não é zero.','Reuse/correlation source is not proven in this read; this is not zero.');tr.insertBefore(td,latestCell);}
      latestCell.dataset.rawTime=rawLatest;latestCell.title=rawLatest;latestCell.textContent=formatFailureLastOccurrence(rawLatest);
    }
  }
  function render(){
    const line=selectedLine(),read=store.read(line),snapshot=read.snapshot,contexts=snapshot?.process_timeline?.contexts||[];
    const key=JSON.stringify([line,snapshot?.snapshot_id,read.source,read.freshness,contexts,document.documentElement.lang]);if(key===last){enrichFailureGroups();return;}last=key;
    root.innerHTML=`<section class="mes-context-panel ames-failure-process-addon"><div class="section-head"><div><h3>${t('Contexto 3022 das falhas','3022 failure context')}</h3><p>${t('Registro da falha no MES não define quando ela foi gerada. Horário, turno e dia de produção só aparecem como comprovados quando existe passagem real da mesma PCBA no posto de referência 3022.','The MES failure record does not define when the failure was generated. Generation time, shift and production day are only shown as proven when the same PCBA has real 3022 passage evidence at the reference station.')}</p></div><span class="ames-runtime-job">${esc(contexts.length)} ${t('contexto(s)','context(s)')}</span></div><div class="ames-rule-strip ames-rule-strip-strong"><b>${t('Regra temporal:','Temporal rule:')}</b><span>${t('ocorrência → posto de referência 3022 → última passagem válida ≤ registro da falha. Passagem anterior é contexto; não prova geração.','occurrence → 3022 reference station → latest valid passage ≤ failure record. Previous passage is context; it does not prove generation.')}</span><small>${esc(line)} · snapshot ${esc(snapshot?.snapshot_id||t('não carregado','not loaded'))} · ${t('origem','source')} ${esc(read.source||'none')} · ${t('cobertura','coverage')} ${esc(snapshot?.coverage?.status||t('indisponível','unavailable'))}</small></div>${contexts.length?`<div class="table-wrap"><table><thead><tr><th>PCBA</th><th>${t('Falha','Failure')}</th><th>${t('Código técnico','Technical code')}</th><th>${t('Registro da falha (MES)','Failure record (MES)')}</th><th>${t('Modo de registro','Registration mode')}</th><th>${t('Posto de referência (3022)','Reference station (3022)')}</th><th>${t('Horário de geração (3022)','Generation time (3022)')}</th><th>${t('Turno comprovado (3022)','Proven shift (3022)')}</th><th>${t('Dia de produção (3022)','Production day (3022)')}</th><th>${t('Última passagem antes do registro','Last passage before record')}</th><th>${t('Horário da passagem anterior','Previous passage time')}</th><th>AT / ${t('ação','action')}</th><th>${t('Posto de retorno','Return station')}</th><th>${t('Horário do retorno','Return time')}</th><th>Status</th></tr></thead><tbody>${contexts.slice(0,2500).map(row=>{const production=trustedProductionEvidence(row),ret=genericReturnEvidence(row);return `<tr><td>${esc(fmt('pcba_sn',row.pcba_sn))}</td><td><b>${esc(knownDescription(row.defect_desc)||row.defect_code||defectDescription(''))}</b></td><td>${esc(fmt('defect_code',row.defect_code))}</td><td>${esc(fmt('defect_time',row.defect_time))}</td><td>${esc(fmt('registration_mode',row.registration_mode||row.manual_or_auto_2114||row.manual_or_auto))}</td><td>${esc(fmt('reference_station_code',production.station||row.reference_station_code))}</td><td>${esc(fmt('production_event_time',production.event_time))}</td><td>${esc(fmt('production_shift',production.shift))}</td><td>${esc(fmt('production_operational_date',production.operational_date))}</td><td>${esc(fmt('previous_operation_code',row.previous_operation_code||row.previous_operation_name))}</td><td>${esc(fmt('previous_event_time',row.previous_event_time))}</td><td>${esc(fmt('repair_action',row.repair_action))}</td><td>${esc(fmt('return_station_code',ret.label))}</td><td>${esc(fmt('return_event_time',ret.event_time))}</td><td>${esc(fmt('status',row.status))}</td></tr>`;}).join('')}</tbody></table></div><p class="ames-process-operator-note">${t('Manual/Automatic descreve como a falha foi registrada após reteste/caracterização; não é o tipo de reparo.','Manual/Automatic describes how the failure was registered after retest/characterization; it is not the repair type.')}</p>`:`<div class="ames-empty"><span>—</span><p>${t('3022 ainda não foi coletado para este snapshot/linha. Ausência de contexto não significa horário zero nem ausência de passagem no MES.','3022 has not been collected for this snapshot/line. Missing context does not mean zero time or no MES passage.')}</p></div>`}</section>`;
    enrichFailureGroups();
  }
  const onChange=e=>{if(e.target?.matches?.('[data-failure-line]')){last='';queueMicrotask(render);}};
  filterRoot?.addEventListener('change',onChange);
  const observer=globalThis.MutationObserver&&filterRoot?new MutationObserver(()=>queueMicrotask(enrichFailureGroups)):null;observer?.observe(filterRoot,{childList:true,subtree:true});
  return {render,clear(){filterRoot?.removeEventListener('change',onChange);observer?.disconnect();root?.replaceChildren();last='';}};
}
