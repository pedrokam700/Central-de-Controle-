import {buildReuseCohorts,filterReuseCohorts,analysisScope2114} from './data/reuse-cohorts.mjs';
import {reuseHistoryIdentity} from './data/reuse-history-timeline.mjs';
import {renderReuseHistoryTimeline,paginateReuseHistory} from './console-reuse-history-timeline.mjs';
import {a6900TechnicianFor} from './data/a6900-technician.mjs';
import {projectRepairTechnicianNames} from './console-sn-repair-evidence.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';
import {compareFailures} from './data/failure-taxonomy.mjs';
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const scopeLabel=scope=>({board_disassembly:t('Desmontagem da placa registrada','Board disassembly recorded'),phone_disassembly:t('Desmontagem do telefone registrada','Phone disassembly recorded'),battery_cover_only:t('Somente tampa da bateria','Battery cover only'),not_recorded:t('Análise não informada','Analysis not recorded'),other:t('Outra análise','Other analysis')})[scope]||'—';
const labels=()=>({observed:t('PCBAs investigadas','Investigated boards'),scope_pcbas:t('PCBAs investigadas na coleta','Boards investigated in collection'),first_use:t('1º uso','1st use'),reused:t('2º uso ou mais','2nd use or more'),second_use:t('2º uso','2nd use'),third_plus_use:t('3º+ uso','3rd+ use'),unknown_use:t('Uso na falha não determinado','Use at failure undetermined'),known_mountings:t('PCBAs com ciclos de montagem 3074 conhecidos','Boards with known 3074 mounting cycles'),known_reused_mountings:t('PCBAs com 2+ ciclos físicos 3074','Boards with 2+ physical 3074 mounting cycles'),failed:t('Reutilizados com falha observada','Reused with observed failure'),associated:t('Reutilizados associados a PCBA defeituosa','Reused associated with defective PCBA'),prior_failure:t('Reutilizados com falha histórica associada','Reused with associated historical failure'),same_failure:t('Mesma falha anterior','Same previous failure'),same_family:t('Mesma família anterior','Same previous family'),verified_no_failure:t('Sem falha registrada · somente com cobertura integral','No recorded failure · complete coverage required'),unknown_outcome:t('Histórico insuficiente para concluir','Insufficient history to conclude')});
// Physical 3074 reuse and 2114 defect recurrence are independent measures.
const metricLabel=(kind,key)=>kind==='pcbas'?({
 prior_failure:t('PCBAs com falha anterior na 2114','Boards with prior 2114 failures'),
 same_failure:t('PCBAs com a mesma falha anterior','Boards with the same earlier failure'),
 same_family:t('PCBAs com falha anterior da mesma família','Boards with a similar earlier failure')
}[key]||labels()[key]):({
 observed:t('Componentes físicos identificados','Identified physical components'),
 known_mountings:t('Componentes com usos físicos 3074 conhecidos','Components with known 3074 physical uses'),
 known_reused_mountings:t('Componentes com 2+ usos físicos 3074','Components with 2+ physical 3074 uses'),
 prior_failure:t('Componentes em PCBAs com falha histórica','Components on boards with historical failure'),
 same_failure:t('Componentes com a mesma falha em PCBAs distintas','Components with the same failure across boards')
}[key]||labels()[key]);
const boardBasisLabel=r=>r.use_basis==='3074_OWN_PCBA_CYCLES'
 ?t('Ciclos próprios observados na 3074','Observed own 3074 mounting cycles')
 :r.use_basis==='2114_AND_3022_REPAIR_RETURN'
 ?t('Falha anterior, desmontagem concluída na 2114 e reparo seguido de retorno à montagem na 3022; quantidade mínima, não ordinal exato','Earlier defect, completed 2114 dismantling, and 3022 repair followed by assembly return; minimum only, not exact ordinal')
 :r.use_basis==='2114_DISASSEMBLY_THEN_3022_PRODUCTION'
 ?t('Desmontagem datada na 2114 seguida de retorno à produção na 3022; quantidade mínima','Dated 2114 dismantling followed by 3022 production return; minimum only')
 :r.use_basis==='CONFLICTING_3074_ORDINALS'
 ?t('Dados divergentes de uso próprio da PCBA; não foi escolhido um número arbitrário','Conflicting own-board ordinals; no arbitrary count chosen')
 :r.use_basis==='KNOWN_3074_CYCLES_DEFECT_INTERVAL_UNPROVEN'
 ?t('A 3074 comprova ciclos físicos da PCBA, mas o ciclo no instante da falha 3028 não foi identificado','3074 proves physical board cycles, but not the cycle at the 3028 failure time')
 :r.use_basis==='CONFLICTING_3074_KNOWN_CYCLE_COUNTS'
 ?t('Contagens físicas 3074 conflitantes no mesmo escopo; investigar a revisão, sem escolher um valor','Conflicting physical 3074 cycle counts within this scope; inspect revision without selecting an arbitrary value')
 :t('Falhas anteriores foram registradas, mas falta comprovação de nova montagem pela 3074 própria ou retorno 2114/3022','Earlier failures were registered, but own 3074 mounting or 2114/3022 return has not been proven');
// Keep exactly one first/second+/unknown partition for BOTH physical populations.
// A component's association with a defective board remains in its detail; it
// must not replace the missing first-use population in the overview.
export const reuseOverviewMetrics={pcbas:['observed','first_use','reused','known_mountings','known_reused_mountings','prior_failure','same_failure','unknown_use'],components:['observed','first_use','reused','known_mountings','known_reused_mountings','prior_failure','same_failure','unknown_use']};
// Display one fault per PCBA and exact MES failure identity, but retain every
// underlying 2114 Hist Seq / 3028 occurrence in the expandable evidence.
// Each 2114 Hist Seq or 3028 occurrence gets its own historical row.
export function consolidateComponentHistory(bindings=[]){
 const rows=[];
 for(const binding of bindings){
  const seen=new Set(),failures=[];
  for(const f of binding.failures||[]){
   const key=reuseHistoryIdentity(f);
   if(seen.has(key))continue;
   seen.add(key);failures.push(f);
  }
  if(!failures.length)rows.push({pcba_sn:binding.pcba_sn,role:binding.role,bindings:[binding],observations:[]});
  for(const f of failures)rows.push({pcba_sn:binding.pcba_sn,role:binding.role,bindings:[binding],
   defect_code:f.defect_code,defect_desc:f.defect_desc,
   recurrence_pcba_count:f.recurrence_pcba_count||0,observations:[f]});
 }
 return rows;
}
export function matchCached3012Repairs(observations=[],history=[]){
 const sample=observations[0];if(!sample)return [];
 // Defect Time, never Repair Time. A matching board and exact fault code is
 // an investigation candidate, not a proved one-to-one 2114 Hist Seq link.
 const candidates=history.filter(row=>row.pcba_sn===sample.pcba_sn&&
    observations.some(f=>compareFailures(f.defect_code,f.defect_desc,row.defect_code,row.defect_desc).classification==='EXACT'));
 return [...new Map(candidates.map(row=>[row.row_key||JSON.stringify([row.pcba_sn,row.defect_code,row.defect_time,row.repair_time,row.repair_user,row.repair_comment]),row])).values()];
}
export function matchCached3012FaultTimes(observations=[],history=[]){
 return [...new Set(matchCached3012Repairs(observations,history).map(row=>String(row.defect_time||'').trim()).filter(Boolean))].sort();
}
const distinctText=values=>[...new Set(values.map(value=>String(value??'').trim()).filter(Boolean))];
function compactEvidenceTimes(observations=[]){
 const entries=distinctText(observations.filter(h=>h.defect_time).map(h=>`${h.source_view||'MES'} · ${formatFactoryDateTime(h.defect_time)}`));
 if(!entries.length)return `<span class="ames-reuse-unproven">${t('Não informado na fonte','Not reported by source')}</span>`;
 const first=entries.slice(0,2).map(item=>`<span class="ames-reuse-time-line">${esc(item)}</span>`).join('');
 return first+(entries.length>2?`<details class="ames-reuse-compact-more"><summary>+${entries.length-2} ${t('horário(s)','time(s)')}</summary>${entries.slice(2).map(item=>`<span class="ames-reuse-time-line">${esc(item)}</span>`).join('')}</details>`:'');
}
// A 3028 timestamp can duplicate the 3012 Defect Time. Use the freed column
// for the 2114 analysis actually returned by MES, never infer it from 3028.
export function compact2114Analysis(observations=[]){
 const values=distinctText(observations.filter(row=>row.source_view==='2114').map(row=>row.defect_type));
 if(!values.length)return `<span class="ames-reuse-unproven" title="${t('Análise não informada pela 2114','2114 analysis not reported')}">—</span>`;
 const render=label=>`<span class="ames-reuse-time-line">${esc(label)}</span>`;
 return values.slice(0,2).map(render).join('')+(values.length>2?`<details class="ames-reuse-compact-more"><summary>+${values.length-2} ${t('análise(s)','analyses')}</summary>${values.slice(2).map(render).join('')}</details>`:'');
}
// The person who recorded/analysed the fault at A6900 is a different role
// from 3012 Repair User and from a later Export Repair hand-off. Never assign
// the former by simply finding the latter's BRM code elsewhere in the MES.
export function enrichReuseRepairTechnicians(repairs=[],processEvents=[]){
 return (repairs||[]).map(repair=>{
  const technician=a6900TechnicianFor(repair,processEvents);
  return {...repair,a6900_technician_name:technician?.name||null,a6900_technician_id:technician?.id||null};
 });
}
export function compact3012CandidateCells(repairs=[]){
 const entries=(repairs||[]).map(r=>{
  const atName=String(r.a6900_technician_name||'').trim();
  const atId=String(r.a6900_technician_id||'').trim();
  const repairName=String(r.repair_user_name||r.repair_technician_name||'').trim();
  const repairId=String(r.repair_user||'').trim();
  // The 3012 Repair User is the technician field for this repair.
  // A6900 identifies a different actor and must not silently replace them.
  const a6900Note=atName&&atName!==atId
   ?`<small>${t('Operador observado na 3022/A6900 (não prova autoria do reparo)','Observed 3022/A6900 operator (not proof of repair)')}: ${esc(atName)}${atId?' · '+esc(atId):''}</small>`
   :'';
  const technician=repairName&&repairName!==repairId
   ?`<span class="ames-reuse-visible-value">${esc(repairName)}</span><small>${t('Reparo 3012','3012 repair')}${repairId?' · '+esc(repairId):''}</small>${a6900Note}`
   :repairId
    ?`<span class="ames-reuse-visible-value">${esc(repairId)}</span><small>${t('ID do usuário do reparo 3012 · nome não comprovado','3012 repair user ID · name unverified')}</small>${a6900Note}`
    :`<span class="ames-reuse-unproven">—</span>${a6900Note}`;
  return {fault:r.defect_time?esc(formatFactoryDateTime(r.defect_time)):'—',
    technician,repair:r.repair_time?esc(formatFactoryDateTime(r.repair_time)):'—',
    comment:r.repair_comment?`<span class="ames-reuse-visible-comment">${esc(r.repair_comment)}</span>`:'—'};
 });
 const field=key=>entries.length?entries.map(e=>`<div class="ames-reuse-separate-evidence">${e[key]}</div>`).join(''):'<span class="ames-reuse-unproven">—</span>';
 return {fault:field('fault'),technician:field('technician'),repair:field('repair'),comment:field('comment')};
}
function sourceAudit(r,rowKind){
 const uniqueEvidence=[...new Map((r.evidence||[]).map(e=>[
  JSON.stringify([e.source_view,e.source_id,e.snapshot_id,e.snapshot_revision,e.record_id,e.raw]),e])).values()];
 const records=uniqueEvidence.map(e=>`<details><summary>${esc(e.source_view)} · ${esc(e.source_id||'—')} / ${esc(e.snapshot_id)} / r${esc(e.snapshot_revision||'—')} · ${esc(e.record_id||'—')}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(e.raw,null,2))}</pre></details>`).join('');
 const histories=rowKind!=='components'?'':(r.binding_history||[]).map(binding=>
  `<details><summary>2114/3028 · ${esc(binding.pcba_sn)} · ${binding.failures.length} ${t('registro(s)','record(s)')}</summary>${binding.failures.map(h=>`<div>${esc(h.source_view)} · ${esc(h.defect_desc||h.defect_code||'—')} · ${esc(h.defect_time?formatFactoryDateTime(h.defect_time):t('horário não comprovado','unproven timestamp'))} · ${esc(h.defect_type||'—')} · Hist Seq ${h.hist_seq==null?'—':esc(h.hist_seq)}</div>`).join('')}</details>`).join('');
 return `<details data-component-source-audit><summary>${t('Auditoria técnica dos registros originais (3074/2114/3028)','Technical audit of original records (3074/2114/3028)')} · ${uniqueEvidence.length}</summary>${records}${histories}</details>`;
}
// Compatibility entry points: both now render the same source-event table.
export function renderComponentComparisonTable(groups=[],{repairs=[],operators=[],status={}}={}){
 const failures=groups.flatMap(group=>(group.observations||[]).map(row=>({...row,
  pcba_sn:row.pcba_sn||group.pcba_sn,source_view:row.source_view||'2114'})));
 const bindings=[...new Map(groups.flatMap(g=>g.bindings||[{pcba_sn:g.pcba_sn,role:g.role}])
  .map(binding=>{const {failures,...evidence}=binding;return [JSON.stringify(evidence),evidence];})).values()];
 const stored=failures.flatMap(e=>e.repair_evidence_3012||[]);
 return renderReuseHistoryTimeline({failures,repairs:[...stored,...repairs],operators,bindings},{status});
}
export function renderBoardComparisonTable(board={}, {repairs=[],operators=[],status={}}={}){
 const history=Array.isArray(board.history_2114)&&board.history_2114.length?board.history_2114:(board.prior_events||[]);
 const failures=[...history.map(e=>({...e,pcba_sn:e.pcba_sn||board.sn,source_view:'2114'})),
  ...(board.events||[]).map(e=>({...e,pcba_sn:e.pcba_sn||board.sn,source_view:'3028'}))];
 const stored=failures.flatMap(e=>e.repair_evidence_3012||[]);
 return renderReuseHistoryTimeline({failures,repairs:[...stored,...repairs],operators,pcbas:[board.sn||failures[0]?.pcba_sn].filter(Boolean)},{board:true,status});
}
export function mountReuseCohorts(root,snapshot,{cachedRepairHistory,cached3022Operators}={}){
 let selection=null,filters={};
 const all=buildReuseCohorts(snapshot),options=(key,values)=>`<select name="${key}"><option value="">${t('Todos','All')}</option>${[...new Set(values.filter(Boolean))].sort().map(v=>`<option${filters[key]===v?' selected':''} value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`;
 function render(){
  const model=filterReuseCohorts(all,filters),names=labels();
  // Uncollected/partial evidence must not be rendered as a verified zero-failure cohort.
  const verifiedEvidence=model.pcbas.counts.verified_no_failure!==null||model.components.counts.verified_no_failure!==null;
  const health=snapshot.insights?.local_reconstruction||null;
  const failure=snapshot.insights?.ready===false||!snapshot.insights?.drilldowns;
  const missingBoardUse=model.pcbas.counts.unknown_use||0;
  const board3074=model.pcbas.rows.filter(r=>r.use_basis==='3074_OWN_PCBA_CYCLES').length;
  const board3022=model.pcbas.rows.filter(r=>r.use_lower_bound===true).length;
  const boardUseDiagnostic=missingBoardUse?`<p role="status" class="mes-context" data-reuse-pcba-proof-diagnostic><strong>${missingBoardUse} ${t('PCBAs ainda sem uso físico classificado','boards still without a classified physical use')}.</strong> ${t('Nesta revisão, evidências suficientes classificaram','In this revision, enough evidence classified')} ${board3074} ${t('pela 3074 própria e','by own 3074 cycles and')} ${board3022} ${t('por retorno 2114 → 3022. A atualização visual não cria vínculos ausentes. Antes de repetir a coleta, confira se a revisão existente contém os vínculos próprios da PCBA na 3074 e os retornos de produção na 3022.','by 2114 → 3022 return. Refreshing the display does not create missing bindings. Before repeating collection, check whether this revision has the board’s own 3074 bindings and 3022 production returns.')}</p>`:'';
  const stored3074=Number(snapshot.coverage?.sources?.['3074']?.stored_rows??snapshot.material_trace?.records?.length??0);
  const missingInsightWarning=stored3074>0
    ? t(`Há ${stored3074} vínculos 3074 armazenados, mas a classificação de uso físico da PCBA não está disponível nesta leitura. Coleta realizada não é sinônimo de ciclos próprios de montagem comprovados.`,
        `There are ${stored3074} stored 3074 links, but physical board-use classification is unavailable in this reading. A completed query does not prove own mounting cycles.`)
    : t('A classificação 3074/2114 não está disponível. Uso indeterminado não significa primeiro uso.','3074/2114 classification unavailable. Unknown use is not first use.');
  const proof=snapshot.insights?.proof_diagnostics;
  const proofWarning=proof&&missingBoardUse?`<p role="status" class="mes-context" data-reuse-raw-pcba-diagnostic><strong>${t('Diagnóstico dos dados brutos 3074:','Raw 3074 diagnostic:')}</strong> ${Number(proof.raw_pcbas_observed||0)} ${t('PCBAs com resultado bruto,','boards with raw results,')} ${Number(proof.raw_pcbas_with_self_rows||0)} ${t('com linhas próprias PCBA e','with own-PCBA rows and')} ${Number(proof.pcba_occurrences_classified||0)} ${t('ocorrências com montagem comprovada na data da falha. A consulta completa não garante classificação temporal.','occurrences with verified mounting at failure time. Complete extraction does not guarantee temporal classification.')}</p>`:'';
  const evidenceWarning=failure
    ? `<p role="status" class="mes-context" data-reuse-proof-warning>${esc(snapshot.insight_status?.message||snapshot.insights?.message||missingInsightWarning)}</p>`
    : health&&health.source_complete===false
      ? `<p role="status" class="mes-context" data-reuse-proof-warning>${t('Recuperação local parcial, sem nova consulta MES:','Partial local recovery, without MES query:')} ${Number(health.recovered_pcbas||0)}/${Number(health.expected_pcbas||0)} PCBAs · ${Number(health.pcbas_with_3074_self_binding||0)} ${t('vínculos próprios de PCBA comprovados na 3074. Ausência de dados não comprova primeiro uso nem ausência de reuso.','own-PCBA bindings verified in 3074. Missing data do not prove first use or no reuse.')}</p>`
      : proofWarning;
  const partitions=['pcbas','components'].map(kind=>{
    const counts=model[kind].counts;
    const classified=counts.first_use+counts.reused+counts.unknown_use;
    const valid=classified===counts.observed;
    return `<p class="mes-context" data-reuse-partition="${kind}" data-partition-valid="${valid}"><strong>${kind==='pcbas'?t('PCBAs','Boards'):t('Componentes','Components')}:</strong> ${counts.observed} = ${counts.first_use} ${t('em 1º uso','in first use')} + ${counts.reused} ${t('em 2º+ uso','in second+ use')} + ${counts.unknown_use} ${t('indeterminados','unknown')}.${valid?'':` <strong>${t('Inconsistência na contagem — não interpretar indicadores','Count mismatch — do not interpret indicators')}</strong>`}</p>`;
  }).join('');
  root.innerHTML=`<h3>${t('Populações observadas de reuso','Observed reuse populations')}</h3>${evidenceWarning}${boardUseDiagnostic}${partitions}<p>${t('Denominador não comprovado. Contagens da amostra investigada; taxa de falha indisponível. Zero observado não prova ausência.','Unproven denominator. Counts from the investigated sample; failure rate unavailable. An observed zero does not prove absence.')}</p>
  <p>${t('SN/CPH filtram ambas as populações; tipo e part number filtram os componentes.','SN/CPH filter both populations; type and part number filter components.')}</p><form data-cohort-filters class="ames-toolbar" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end"><label>SN <input name="sn" value="${esc(filters.sn||'')}"></label><label>CPH ${options('product',[...all.pcbas.rows,...all.components.rows].flatMap(r=>r.products))}</label><label>${t('Tipo','Type')} ${options('item_type',all.components.rows.map(r=>r.item_type))}</label><label>Part number ${options('part_number',all.components.rows.flatMap(r=>r.part_numbers))}</label><button type="submit" class="button secondary">${t('Filtrar','Filter')}</button></form>
  ${['pcbas','components'].map(kind=>`<section data-cohort="${kind}"><h4>${kind==='pcbas'?t('Placas / PCBAs','Boards / PCBAs'):t('Componentes físicos · Material SN + tipo','Physical components · Material SN + type')}</h4>${kind==='components'?`<p class="mes-context" data-component-scope-note>${t('O total identificado conta unidades físicas distintas rastreadas por Material SN + tipo nos dados carregados. Não representa códigos Material ID nem o total produzido. Compare este total com o número de componentes de 2º uso ou mais; a quantidade de PCBAs investigadas aparece acima.','The identified total counts distinct physical units traced by Material SN + type in the loaded data. It is neither a count of Material IDs nor all manufactured parts. Compare it with the number of components on their second or later use; the investigated board count appears above.')}</p>`:''}<div class="ames-reuse-kpis">${Object.entries(names).filter(([key])=>reuseOverviewMetrics[kind].includes(key)).map(([key,label])=>`<button type="button" class="stat ames-kpi-button" data-cohort-kind="${kind}" data-cohort-metric="${key}"><span class="stat-label">${metricLabel(kind,key)}</span><strong class="stat-value">${key==='scope_pcbas'?all.pcbas.counts.observed:model[kind].counts[key]??'—'}</strong></button>`).join('')}</div></section>`).join('')}
  <details class="ames-reuse-coverage" data-cohort-limits><summary>${t('Limites da cobertura e casos inconclusivos','Coverage limits and unresolved outcomes')}</summary>
  <p>${t('Sem registro de falha não comprova ausência de falha. A categoria sem falha só é calculada quando a população e os desfechos têm comprovação integral. Mesma falha = código exato; mesma família = classificação similar, podendo a mesma peça ter históricos dos dois tipos.','No failure record does not prove no failure. No-failure counts require complete population and outcome proof. Exact failure and similar family are different historical comparisons.')}</p>
  ${verifiedEvidence?`<p>${t('Categorias sem falha só podem ser examinadas com comprovante integral de cobertura.','No-failure categories can be examined only with complete coverage proof.')}</p>`:''}
  ${['pcbas','components'].map(kind=>`<button type="button" class="button secondary" data-cohort-kind="${kind}" data-cohort-metric="unknown_outcome">${kind==='pcbas'?t('PCBAs com histórico inconclusivo','Boards with unresolved history'):t('Componentes com histórico inconclusivo','Components with unresolved history')} · ${model[kind].counts.unknown_outcome}</button>`).join('')}
  </details><div data-cohort-detail></div>`;
  if(failure||(model.pcbas.counts.observed>0&&model.pcbas.counts.unknown_use===model.pcbas.counts.observed)){
    // Every investigated PCBA without mounting evidence must not look like
    // a verified 0 in both first-use and reused cards. Keep the auditable
    // unknown count and the source-level warning visible instead.
    for(const metric of ['first_use','reused']){
      const button=root.querySelector(`[data-cohort-kind="pcbas"][data-cohort-metric="${metric}"]`);
      if(button){const val=button.querySelector?.('.stat-value');if(val)val.textContent='—';button.disabled=true;
        button.title=t('Nenhuma PCBA possui montagem comprovada nesta revisão; não interpretar como zero.','No board has a proven mounting in this revision; do not interpret this as zero.');}
    }
  }
  root.querySelector('form').addEventListener('submit',e=>{e.preventDefault();filters=Object.fromEntries(new FormData(e.currentTarget));selection=null;render();});
  for(const button of root.querySelectorAll('[data-cohort-metric]'))button.addEventListener('click',()=>{
    selection=[button.dataset.cohortKind,button.dataset.cohortMetric];
    for(const metricButton of root.querySelectorAll('[data-cohort-metric]')){
      const active=metricButton.dataset.cohortKind===selection[0]&&metricButton.dataset.cohortMetric===selection[1];
      metricButton.classList.toggle('active',active);
      metricButton.setAttribute('aria-pressed',String(active));
    }
    detail(model,all);
    // Previously this detail was appended below two full KPI matrices:
    // clicking the first PCBAs card appeared to do nothing.
    root.querySelector('[data-cohort-detail]')?.scrollIntoView?.({behavior:'smooth',block:'start'});
  });
  if(selection)detail(model,all);
 }
 function detail(model,all){
  const [kind,metric]=selection,scope=metric==='scope_pcbas',rowKind=scope?'pcbas':kind,
   rows=scope?all.pcbas.metrics.observed:model[kind].metrics[metric],host=root.querySelector('[data-cohort-detail]');
  if(metric==='verified_no_failure'&&model[kind].counts.verified_no_failure===null){
   host.innerHTML=`<h4>${metricLabel(kind,metric)} · —</h4><p role="status">${t('Indisponível: não existe prova do universo completo dos reutilizados e do desfecho de cada item. Isso não equivale a zero materiais sem falha.','Unavailable: the full reused population and each item outcome have not been verified. This is not zero components without failures.')}</p>`;
   return;
  }
  host.innerHTML=`<h4>${metricLabel(kind,metric)} · ${rows.length} ${t('itens observados','observed items')}</h4><p>${scope?t('Placas distintas da 3028 nesta revisão. A consulta ou cobertura integral dos históricos 3074/2114 precisa de comprovação independente.','Distinct boards in this revision’s 3028. Actual historical query/coverage of 3074/2114 requires separate evidence.'):t('Associação e recorrência não confirmam causa. Horários abaixo são registros MES, não horários de produção comprovados.','Association and recurrence do not confirm cause. Times below are MES records, not proven production times.')}</p>${rows.map(r=>`<details data-cohort-row><summary>${esc(r.sn)} · ${esc(r.item_type||'PCBA')} · ${r.use_index?`${r.use_lower_bound?t('pelo menos ','at least '):''}${r.use_index}º ${t('uso','use')}`:r.known_mounting_cycles
 ?t('uso na falha não determinado · ','use at failure unknown · ')+r.known_mounting_cycles+' '+t('uso(s) físico(s) 3074 conhecidos','known physical 3074 uses')
 :t('uso não determinado','use unknown')}</summary><p>CPH: ${esc(r.products.join(', ')||'—')} · PN: ${esc(r.part_numbers.join(', ')||'—')} · ${t('PCBAs anteriores','Previous PCBAs')}: ${esc(r.previous_pcbas.join(', ')||'—')}</p><p>${t('Falhas atuais','Current failures')}: ${r.events.length} · ${rowKind==='components'?t('Registros de falha nas PCBAs vinculadas','Failure records on linked boards')+': '+r.binding_history.reduce((sum,b)=>sum+b.failures.length,0):t('Falhas históricas','Historical failures')+': '+r.prior_events.length} · ${t('Mesma falha','Same failure')}: ${r.same_failure?t('sim','yes'):t('não comprovada','not proven')}${r.use_conflict?' · '+t('Usos divergentes: consultar evidências','Conflicting uses: inspect evidence'):''}</p>
  ${rowKind==='components'&&r.known_mounting_cycles?`<p data-material-known-cycles><strong>${t('Usos físicos do Material SN observados na 3074','Physical Material SN uses observed in 3074')}:</strong> ${r.known_mounting_cycles}. ${t('O histórico físico conhecido não determina em qual uso estava o componente na falha investigada.','Known physical history does not establish which use coincided with this defect.')}</p>`:''}
  ${rowKind==='pcbas'&&r.known_mounting_cycles?`<p data-pcba-known-cycles><strong>${t('Ciclos físicos da própria PCBA, comprovados na 3074','Own-PCBA physical mounting cycles proven by 3074')}:</strong> ${r.known_mounting_cycles}. ${t('É o total observado de ciclos da placa; não significa que ela estivesse nesse uso no instante da falha.','This is the known number of board cycles, not necessarily the use number at the failure time.')}</p>`:''}
  ${rowKind==='pcbas'&&r.use_basis?`<p data-pcba-reuse-proof><strong>${t('Classificação física','Physical classification')}:</strong> ${esc(boardBasisLabel(r))}${r.process_reuse_evidence?.returns.length?' · '+r.process_reuse_evidence.returns.map(x=>esc((x.dismantle_type||'2114')+' → '+(x.production_station||'3022')+' ('+formatFactoryDateTime(x.production_time)+')')).join('; '):''}</p>`:''}
  ${rowKind==='pcbas'&&r.unproven_use_context?`<p class="mes-context" data-pcba-use-limits>${t('Evidências encontradas para esta PCBA','Evidence found for this board')}: 2114 · ${r.unproven_use_context['2114_records']} ${t('registros','records')} (${r.unproven_use_context['2114_dismantlings']} ${t('desmontagens registradas','dismantling scopes')}); 3022 · ${r.unproven_use_context['3022_process_passages']} ${t('passagens','passages')} / ${r.unproven_use_context['3022_correlations']} ${t('correlações','correlations')}. ${t('Isso não permite afirmar primeiro uso nem segundo uso sem uma montagem comprovada.','These facts alone cannot establish first or second physical use.')}</p>`:''}
  ${rowKind==='pcbas'?renderBoardComparisonTable(timelineBoard(r),{operators:snapshot.process_timeline?.events||[]}):''}
  ${rowKind==='components'&&r.binding_history?.length?`<section data-component-binding-history><h5>${t('Todos os vínculos 3074 e históricos 2114 disponíveis','All 3074 bindings and available 2114 histories')} · ${r.binding_history.length} ${t('PCBAs vinculadas/investigadas','linked/investigated boards')}</h5><p class="mes-context" data-component-at-candidate-note>${t('Eventos 2114, 3028, 3012 e 3022 permanecem independentes na mesma timeline; nenhum reparo é atribuído à Hist Seq por PCBA + código.','2114, 3028, 3012 and 3022 events remain independent in one timeline; board + code never assigns a repair to Hist Seq.')}</p>
  <p>${t('Recorrência neste indicador = mesmo código de falha em pelo menos duas PCBAs distintas que tiveram vínculo 3074 com este SN. Repetições na mesma placa contam uma placa; associação não prova causa nem o instante de montagem.','Here recurrence means the same defect code on at least two different boards linked to this physical SN in 3074. Repetitions on one board count once; association does not prove cause or mounting time.')}</p>
  ${r.cross_board_recurrences?.length?`<p data-component-cross-board-recurrence><strong>${t('Mesma falha em PCBAs distintas','Same failure across different boards')}:</strong> ${r.cross_board_recurrences.map(group=>esc((group.defect_desc||group.defect_code)+' · '+group.pcba_count+' '+t('PCBAs','boards')+' ('+group.pcbas.join(', ')+')')).join(' · ')}</p>`:''}
  ${renderComponentComparisonTable(timelineComponent(r),{operators:snapshot.process_timeline?.events||[]})}</section>`:''}
  <p>${kind==='components'?t('Para estado Y/N e horários de vínculo consulte as evidências 3074; vínculo antigo não prova montagem atual.','For Y/N status and binding times inspect 3074 evidence; prior binding does not prove current mounting.'):''}</p>${sourceAudit(r,rowKind)}</details>`).join('')}`;
  wireReuseHistoryTimeline(host,rows,rowKind);
 }
 // These are display-only source rows. Do not change buildReuseCohorts or its KPIs.
 const boardOf=row=>String(row.pcba_sn||row.current_pcba_sn||'').trim();
 const grouped=rows=>{const out=new Map();for(const row of rows){const key=boardOf(row);if(!out.has(key))out.set(key,[]);out.get(key).push(row);}return out;};
 const displayHistory=grouped(snapshot.pcba_history?.records||[]),displayCurrent=grouped(snapshot.occurrences||[]);
 function timelineBoard(row){
  const originals=displayHistory.get(row.sn)||[],factsById=new Map();
  for(const facts of row.history_2114||[])if(facts.record_id&&!factsById.has(facts.record_id))factsById.set(facts.record_id,facts);
  const history=originals.length?originals.map(h=>{
   const facts=factsById.get(h.record_id)||{};
   return {...facts,...h,analysis_scope:analysisScope2114(h.defect_type)};
  }):row.history_2114;
  const events=displayCurrent.get(row.sn)||[];
  return {...row,history_2114:history,events:events.length?events:row.events};
 }
 function timelineComponent(row){
  const bindings=(row.binding_history||[]).flatMap(binding=>{
   const rawHistory=displayHistory.get(binding.pcba_sn)||[];
   const rawCurrent=displayCurrent.get(binding.pcba_sn)||[];
   const failures=rawHistory.length||rawCurrent.length
    ?[...rawHistory.map(h=>({...h,source_view:'2114'})),...rawCurrent.map(h=>({...h,source_view:'3028'}))]:binding.failures;
   const own=(row.evidence||[]).filter(ref=>ref.source_view==='3074'&&boardOf(ref.raw||{})===binding.pcba_sn);
   if(!own.length)return [{...binding,failures}];
   return own.map(ref=>({...binding,...ref.raw,pcba_sn:binding.pcba_sn,
    source_id:ref.source_id,snapshot_id:ref.snapshot_id,snapshot_revision:ref.snapshot_revision,
    line_id:ref.line_id,period:ref.period,failures}));
  });
  return consolidateComponentHistory(bindings);
 }
 const repairCache=new Map(),operatorCache=new Map(),loaded=new WeakSet();
 const cached=(cache,read,board)=>{
  if(!cache.has(board))cache.set(board,typeof read==='function'
   ?Promise.resolve().then(()=>read({sn:board,limit:5000}))
    .then(rows=>({rows:Array.isArray(rows)?rows:[],status:Array.isArray(rows)?'loaded':'error'}))
    .catch(()=>({rows:[],status:'error'}))
   :Promise.resolve({rows:[],status:'not_loaded'}));
  return cache.get(board);
 };
 function wireReuseHistoryTimeline(host,rows,rowKind){
  [...host.querySelectorAll('details[data-cohort-row]')].forEach((detail,index)=>detail.addEventListener('toggle',async()=>{
   if(!detail.open||loaded.has(detail))return;
   loaded.add(detail);
   const row=rows[index],target=detail.querySelector('[data-reuse-history-timeline]');
   if(!row||!target)return;
   paginateReuseHistory(target);
   const groups=rowKind==='components'?timelineComponent(row):null;
   const boards=rowKind==='components'?[...new Set(groups.map(g=>g.pcba_sn))]:[row.sn];
   const results=await Promise.all(boards.map(async board=>{
    const [repairs,operators]=await Promise.all([
     cached(repairCache,cachedRepairHistory,board),cached(operatorCache,cached3022Operators,board)]);
    return {board,repairs,operators};
   }));
   if(!detail.isConnected)return;
   // Cache rows remain historical source observations. Never filter repairs by
   // fault code or attach them to 2114; even a different repair code is visible.
   const repairs=results.flatMap(r=>r.repairs.rows.filter(e=>boardOf(e)===r.board));
   const operators=[...(snapshot.process_timeline?.events||[]),
    ...results.flatMap(r=>r.operators.rows.filter(e=>boardOf(e)===r.board))];
   const status=Object.fromEntries(['3012','3022'].map(view=>{
    const source=view==='3012'?'repairs':'operators';
    return [view,results.some(r=>r[source].status==='error')?'error':
     results.every(r=>r[source].status==='loaded')?'loaded':'not_loaded'];
   }));
   target.outerHTML=rowKind==='components'?renderComponentComparisonTable(groups,{repairs,operators,status}):
    renderBoardComparisonTable(timelineBoard(row),{repairs,operators,status});
   paginateReuseHistory(detail.querySelector('[data-reuse-history-timeline]'));
  }));
 }

 render();
}
