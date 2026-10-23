import {escapeHtml as esc} from './evidence-view.mjs';
import {formatFactoryDateTime as factoryTime} from './data/time-display.mjs';

const txt=value=>String(value??'').trim();
const t=(locale,pt,en)=>String(locale||'').startsWith('en')?en:pt;
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const dt=value=>value?factoryTime(value):'—';

function failureLine(entry,locale){
  const h=entry.history||{},pcba=entry.pcba_sn||entry.cycle?.pcba_sn;
  const repairs=entry.repairs||[];
  return '<article class="ames-evidence-card"><div class="ames-evidence-card-head"><b>'+esc(pcba||'—')+'</b>'+
    '<button class="button secondary" type="button" data-sn-open-pcba="'+esc(pcba||'')+'">'+
    t(locale,'Consultar PCBA','Query PCBA')+'</button></div><p><b>'+esc(fmt(h['Defect Code']))+'</b> · '+
    esc(fmt(h['Defect Description']))+' · 2114 '+esc(dt(h['Defect Time']))+'</p>'+
    '<p class="mes-context">'+esc(entry.reason||'')+' · 3074 + 2114 · '+
    t(locale,'Associação temporal; causa não confirmada','Temporal association; cause unproven')+'</p>'+
    (repairs.length?'<details><summary>3012 · '+repairs.length+' '+t(locale,'registros','records')+'</summary><ul>'+
      repairs.map(r=>'<li>'+esc(fmt(r.repair_time||r['Repair Time']))+' · '+
      esc(fmt(r.repair_user||r['Repair User']))+' · '+esc(fmt(r.repair_comment||r['Repair Comment']))+
      ' · '+t(locale,'associação candidata à ocorrência','candidate occurrence association')+'</li>').join('')+
      '</ul></details>':'')+'</article>';
}

export function renderMaterialSnInvestigation(result={},locale='pt-BR'){
  const model=result.material_investigation;
  if(result.detected_type!=='MATERIAL_SN'||!model)return '';
  const cycles=model.observed_cycles||[],links=model.failure_links||{},proven=links.proven||[],
    candidates=links.candidates||[],excluded=links.excluded||[],recurrences=model.recurrences||[];
  const repairRows=result.trace_3012?.rows||[],processRows=result.trace_3022?.process_passages||[];
  const forPcba=pcba=>repairRows.filter(r=>txt(r.pcba_sn||r['PCBA'])===txt(pcba)).slice(0,8);
  const renderFailure=item=>failureLine({...item,repairs:forPcba(item.pcba_sn)},locale);
  const isPartial=model.coverage==='partial',omitted=Number(model.omitted_pcba_count)||0;
  return '<section class="mes-context-panel ames-material-investigation" data-material-sn-investigation data-no-i18n>'+
    '<div class="section-head"><div><h3>'+t(locale,'Rastreabilidade do Material SN','Material SN traceability')+'</h3><p>'+esc(fmt(model.query_material_sn))+
    ' · 3074 → PCBA → 2114 → 3012/3022</p></div><span class="status '+(isPartial?'warn':'ok')+'">'+
    (isPartial?t(locale,'Cobertura parcial','Partial coverage'):t(locale,'Registros observados','Observed records'))+'</span></div>'+
    '<div class="ames-summary-grid"><div class="stat"><small>'+t(locale,'Vínculos temporais observados','Observed binding intervals')+'</small><strong>'+cycles.length+'</strong></div>'+
    '<div class="stat"><small>'+t(locale,'Usos com Bind Time','Uses with Bind Time')+'</small><strong>'+esc(fmt(model.known_use_count))+'</strong></div>'+
    '<div class="stat"><small>'+t(locale,'PCBAs distintas','Distinct PCBAs')+'</small><strong>'+esc(fmt(model.distinct_pcba_count))+'</strong></div>'+
    '<div class="stat"><small>'+t(locale,'Falhas temporalmente associadas','Temporally linked failures')+'</small><strong>'+proven.length+'</strong></div></div>'+
    '<p class="mes-context">'+t(locale,'As contagens representam o retorno investigado; vínculos ou falhas não consultados permanecem desconhecidos. Y/N descreve o vínculo atual, não o passado. Nenhuma correlação prova causa ou erro do AT.',
      'Counts represent investigated evidence; unqueried links and failures remain unknown. Y/N describes current linkage, not the past. No correlation proves cause or technician error.')+
    (omitted?' · '+omitted+' '+t(locale,'PCBAs não investigadas pelo limite seguro','PCBAs beyond the safe query limit'):'')+'</p>'+
    (recurrences.length?'<div class="notice warn"><strong>'+t(locale,'Alerta · possível recorrência associada ao mesmo material','Alert · possible recurrence associated with the same material')+'</strong><ul>'+
      recurrences.map(a=>'<li><b>'+esc(a.severity==='high'?'ALTA':'MÉDIA')+'</b> · '+
        esc(a.earlier?.pcba_sn)+' → '+esc(a.later?.pcba_sn)+' · '+
        esc(fmt(a.earlier?.history?.['Defect Code']))+' / '+esc(fmt(a.later?.history?.['Defect Code']))+
        ' · '+esc(a.message||'')+'</li>').join('')+'</ul></div>':'')+
    '<details open><summary>'+t(locale,'Ciclos de vínculo na 3074','3074 binding cycles')+' ('+cycles.length+')</summary>'+
    '<div class="ames-reuse-list">'+cycles.map(c=>'<article class="ames-evidence-card"><b>'+esc(fmt(c.pcba_sn))+'</b> · '+
      esc(fmt(c.iss_status_now))+' · '+t(locale,'Vínculo','Bind')+': '+esc(dt(c.bind_time_utc))+
      ' · '+t(locale,'Desvínculo','Unbind')+': '+esc(dt(c.unbind_time_utc))+
      (Number(c.event_count)>1?' · '+esc(c.event_count)+' '+t(locale,'registros do mesmo intervalo','same-interval rows'):'')+
      ' <button type="button" class="button secondary" data-sn-open-pcba="'+esc(c.pcba_sn)+'">'+
      t(locale,'Consultar PCBA','Query PCBA')+'</button></article>').join('')+'</div></details>'+
    '<details open><summary>'+t(locale,'Falhas comprovadas dentro dos vínculos','Failures proven inside binding intervals')+
    ' ('+proven.length+')</summary>'+ (proven.length?proven.map(renderFailure).join(''):
      '<p class="mes-context">'+t(locale,'Nenhuma associação temporal confirmada nesta cobertura; isso não comprova ausência de defeitos.',
        'No confirmed temporal association in this coverage; this does not prove an absence of defects.')+'</p>')+'</details>'+
    (candidates.length?'<details><summary>'+t(locale,'Falhas candidatas · intervalo insuficiente','Candidate failures · uncertain interval')+
      ' ('+candidates.length+')</summary>'+candidates.map(renderFailure).join('')+'</details>':'')+
    '<p class="mes-context">'+excluded.length+' '+t(locale,'registros 2114 fora do período de vínculo, excluídos da relação com o material.',
      '2114 records outside binding periods excluded from material correlation.')+'</p>'+
    '<p class="mes-context">3022 · '+processRows.length+' '+t(locale,'passagens retornadas (contexto de processo, não associação automática à falha).',
      'returned process passages (process context, not automatic failure attribution).')+'</p></section>';
}
