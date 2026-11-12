import {buildReuseCohorts} from './data/reuse-cohorts.mjs';
import {a6900TechnicianFor} from './data/a6900-technician.mjs';
import {projectRepairTechnicianNames} from './console-sn-repair-evidence.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';
import {compareFailures} from './data/failure-taxonomy.mjs';
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const scopeLabel=scope=>({board_disassembly:t('Desmontagem da placa registrada','Board disassembly recorded'),phone_disassembly:t('Desmontagem do telefone registrada','Phone disassembly recorded'),battery_cover_only:t('Somente tampa da bateria','Battery cover only'),not_recorded:t('Análise não informada','Analysis not recorded'),other:t('Outra análise','Other analysis')})[scope]||'—';
const labels=()=>({observed:t('PCBAs investigadas','Investigated boards'),scope_pcbas:t('PCBAs investigadas na coleta','Boards investigated in collection'),first_use:t('1º uso','1st use'),reused:t('2º uso ou mais','2nd use or more'),second_use:t('2º uso','2nd use'),third_plus_use:t('3º+ uso','3rd+ use'),unknown_use:t('Uso não determinado','Undetermined use'),failed:t('Reutilizados com falha observada','Reused with observed failure'),associated:t('Reutilizados associados a PCBA defeituosa','Reused associated with defective PCBA'),prior_failure:t('Reutilizados com falha histórica associada','Reused with associated historical failure'),same_failure:t('Mesma falha anterior','Same previous failure'),same_family:t('Mesma família anterior','Same previous family'),verified_no_failure:t('Sem falha registrada · somente com cobertura integral','No recorded failure · complete coverage required'),unknown_outcome:t('Histórico insuficiente para concluir','Insufficient history to conclude')});
// Physical 3074 reuse and 2114 defect recurrence are independent measures.
const metricLabel=(kind,key)=>kind==='pcbas'?({
 prior_failure:t('PCBAs com falha anterior na 2114','Boards with prior 2114 failures'),
 same_failure:t('PCBAs com a mesma falha anterior','Boards with the same earlier failure'),
 same_family:t('PCBAs com falha anterior da mesma família','Boards with a similar earlier failure')
}[key]||labels()[key]):({
 observed:t('Componentes físicos identificados','Identified physical components'),
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
 :t('Falhas anteriores foram registradas, mas falta comprovação de nova montagem pela 3074 própria ou retorno 2114/3022','Earlier failures were registered, but own 3074 mounting or 2114/3022 return has not been proven');
// Keep exactly one first/second+/unknown partition for BOTH physical populations.
// A component's association with a defective board remains in its detail; it
// must not replace the missing first-use population in the overview.
export const reuseOverviewMetrics={pcbas:['observed','first_use','reused','prior_failure','same_failure','unknown_use'],components:['observed','first_use','reused','prior_failure','same_failure','unknown_use']};
// Display one fault per PCBA and exact MES failure identity, but retain every
// underlying 2114 Hist Seq / 3028 occurrence in the expandable evidence.
// Each 2114 Hist Seq or 3028 occurrence gets its own historical row.
export function consolidateComponentHistory(bindings=[]){
 const rows=[];
 for(const binding of bindings){
  const seen=new Set(),failures=[];
  for(const f of binding.failures||[]){
   const key=JSON.stringify([f.source_view,f.record_id||null,f.hist_seq??null,f.defect_code,f.defect_time,f.defect_type]);
   if(seen.has(key))continue;
   seen.add(key);failures.push(f);
  }
  if(!failures.length)rows.push({pcba_sn:binding.pcba_sn,role:binding.role,observations:[]});
  for(const f of failures)rows.push({pcba_sn:binding.pcba_sn,role:binding.role,
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
  // Prefer the *repair* technician identified from 3012 Repair User + the
  // same PCBA/BRM in 3022, at ANY station. An A6900 analyst is another role.
  const technician=repairName&&repairName!==repairId
    ?`<span class="ames-reuse-visible-value">${esc(repairName)}</span><small>${t('Reparo 3012','3012 repair')}${repairId?' · '+esc(repairId):''}</small>`
    :atName&&atName!==atId
     ?`<span class="ames-reuse-visible-value">${esc(atName)}</span><small>${t('Operador observado na 3022 · A6900; responsável pelo reparo não comprovado','Observed 3022 A6900 operator; repair user unproven')}${atId?' · '+esc(atId):''}</small>`
     :repairId
      ?`<span class="ames-reuse-visible-value">${esc(repairId)}</span><small>${t('ID do usuário do reparo 3012 · nome não comprovado','3012 repair user ID · name unverified')}</small>`
      :'<span class="ames-reuse-unproven">—</span>';
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
// A source row is a separate historical passage. Never replicate a 3012
// repair just because multiple 2114 records share the same board/fault code.
const sourceTime=e=>e?.defect_time?esc(formatFactoryDateTime(e.defect_time)):'—';
const sourceName=e=>`${esc(e.source_view||'MES')}${e.hist_seq!==null&&e.hist_seq!==undefined?`<small>Hist Seq ${esc(String(e.hist_seq))}</small>`:''}`;
const sourceIdentity=e=>JSON.stringify([e.source_view,e.record_id||null,e.hist_seq??null,e.defect_code,e.defect_time,e.defect_type]);
export function renderComponentComparisonTable(groups=[]){
 // External callers may still pass a grouped legacy record; render its source
 // observations separately instead of compressing different dates/analyses.
 const rows=groups.flatMap(group=>group.observations?.length>1
  ?group.observations.map(e=>({...group,defect_code:e.defect_code,defect_desc:e.defect_desc,observations:[e]}))
  :[group]);
 return `<div class="table-wrap ames-component-comparison"><table><thead><tr>
 <th>PCBA (3074)</th><th>${t('Vínculo','Binding')}</th><th>${t('Fonte / passagem','Source / visit')}</th>
 <th>${t('Horário da falha','Defect time')}</th><th>${t('Falha','Failure')}</th>
 <th>${t('Análise 2114','2114 analysis')}</th><th>${t('Recorrência entre PCBAs','Cross-board recurrence')}</th><th>${t('Origem','Source')}</th>
 </tr></thead><tbody>${rows.map(group=>{
  const e=group.observations?.[0],board=group.pcba_sn||'';
  const recurrence=group.recurrence_pcba_count>=2?`${t('Mesmo defeito em','Same fault on')} ${group.recurrence_pcba_count} ${t('PCBAs distintas','different boards')}`:'—';
  return `<tr data-reuse-source-row data-pcba="${esc(board)}" data-defect-code="${esc(e?.defect_code||'')}">
   <td class="ames-component-compare-pcba">${esc(board||'—')}</td>
   <td>${group.role==='previous'?t('Anterior','Previous'):t('PCBA investigada','Investigated board')}</td>
   <td>${e?sourceName(e):'—'}</td><td>${sourceTime(e)}</td>
   <td>${e?`<strong>${esc(e.defect_desc||e.defect_code||'—')}</strong><small>${esc(e.defect_code||'')}</small>`:t('Falha não disponível nesta revisão','Failure unavailable in this reading')}</td>
   <td>${compact2114Analysis(e?.source_view==='2114'?[e]:[])}</td>
   <td>${esc(recurrence)}</td>
   <td>${e?`<details class="ames-component-raw"><summary>${t('Registro original','Original record')}</summary><div>${esc(e.source_view||'—')} · ${esc(e.defect_time||'—')} · Hist Seq ${e.hist_seq==null?'—':esc(String(e.hist_seq))} · ${esc(e.record_id||'—')}</div></details>`:'—'}</td>
   </tr>`;
 }).join('')}</tbody></table></div>
 <div data-reuse-3012-history><p class="mes-context">${t('Histórico 3012 separado por atendimento: carregado ao abrir a PCBA.','3012 repair history per visit: loaded on opening the board.')}</p></div>`;
}
export function renderBoardComparisonTable(board={}){
 // Use the FULL 2114 history, not only the subset selected as prior to 3028.
 const history=Array.isArray(board.history_2114)&&board.history_2114.length?board.history_2114:(board.prior_events||[]);
 const all=[...history.map(e=>({...e,source_view:'2114'})),...(board.events||[]).map(e=>({...e,source_view:'3028'}))];
 const seen=new Set(),rows=all.filter(e=>{const id=sourceIdentity(e);if(seen.has(id))return false;seen.add(id);return true;})
 .sort((a,b)=>String(a.defect_time||'').localeCompare(String(b.defect_time||''))||Number(a.hist_seq??0)-Number(b.hist_seq??0));
 return `<p class="mes-context" data-board-at-candidate-note>${t('Cada linha identifica uma passagem 2114 ou 3028 com seu próprio horário. Os reparos 3012 são exibidos separadamente por período; o mesmo código de falha não comprova que se trata do mesmo atendimento.','Each row is an original 2114 or 3028 passage with its own time. 3012 repairs appear separately by period; the same fault code does not prove the same visit.')}</p>
 <div class="table-wrap ames-component-comparison ames-board-comparison"><table><thead><tr>
  <th>PCBA</th><th>${t('Fonte / passagem','Source / visit')}</th><th>${t('Horário da falha','Defect time')}</th>
  <th>${t('Falha','Failure')}</th><th>${t('Análise 2114','2114 analysis')}</th><th>${t('Contexto','Context')}</th>
 </tr></thead><tbody>${rows.map(e=>`<tr data-board-failure-row data-reuse-source-row data-pcba="${esc(e.pcba_sn||board.sn||'')}" data-defect-code="${esc(e.defect_code||'')}">
  <td class="ames-component-compare-pcba">${esc(e.pcba_sn||board.sn||'—')}</td>
  <td>${sourceName(e)}</td><td>${sourceTime(e)}</td>
  <td><strong>${esc(e.defect_desc||e.defect_code||'—')}</strong><small>${esc(e.defect_code||'')}</small></td>
  <td>${compact2114Analysis(e.source_view==='2114'?[e]:[])}</td>
  <td>${e.source_view==='3028'?t('Atual · 3028','Current · 3028'):t('Histórico · 2114','History · 2114')}</td>
  </tr>`).join('')}</tbody></table></div>
 <div data-reuse-3012-history><p class="mes-context">${t('Reparos 3012 por atendimento: carregados ao abrir esta PCBA.','3012 repairs per visit: loaded on opening this board.')}</p></div>`;
}
export function mountReuseCohorts(root,snapshot,{cachedRepairHistory,cached3022Operators}={}){
 let selection=null,filters={};
 const all=buildReuseCohorts(snapshot),options=(key,values)=>`<select name="${key}"><option value="">${t('Todos','All')}</option>${[...new Set(values.filter(Boolean))].sort().map(v=>`<option${filters[key]===v?' selected':''} value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`;
 function render(){
  const model=buildReuseCohorts(snapshot,filters),names=labels();
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
  host.innerHTML=`<h4>${metricLabel(kind,metric)} · ${rows.length} ${t('itens observados','observed items')}</h4><p>${scope?t('Placas distintas da 3028 nesta revisão. A consulta ou cobertura integral dos históricos 3074/2114 precisa de comprovação independente.','Distinct boards in this revision’s 3028. Actual historical query/coverage of 3074/2114 requires separate evidence.'):t('Associação e recorrência não confirmam causa. Horários abaixo são registros MES, não horários de produção comprovados.','Association and recurrence do not confirm cause. Times below are MES records, not proven production times.')}</p>${rows.map(r=>`<details data-cohort-row><summary>${esc(r.sn)} · ${esc(r.item_type||'PCBA')} · ${r.use_index?`${r.use_lower_bound?t('pelo menos ','at least '):''}${r.use_index}º ${t('uso','use')}`:t('uso não determinado','use unknown')}</summary><p>CPH: ${esc(r.products.join(', ')||'—')} · PN: ${esc(r.part_numbers.join(', ')||'—')} · ${t('PCBAs anteriores','Previous PCBAs')}: ${esc(r.previous_pcbas.join(', ')||'—')}</p><p>${t('Falhas atuais','Current failures')}: ${r.events.length} · ${rowKind==='components'?t('Registros de falha nas PCBAs vinculadas','Failure records on linked boards')+': '+r.binding_history.reduce((sum,b)=>sum+b.failures.length,0):t('Falhas históricas','Historical failures')+': '+r.prior_events.length} · ${t('Mesma falha','Same failure')}: ${r.same_failure?t('sim','yes'):t('não comprovada','not proven')}${r.use_conflict?' · '+t('Usos divergentes: consultar evidências','Conflicting uses: inspect evidence'):''}</p>
  ${rowKind==='pcbas'&&r.use_basis?`<p data-pcba-reuse-proof><strong>${t('Classificação física','Physical classification')}:</strong> ${esc(boardBasisLabel(r))}${r.process_reuse_evidence?.returns.length?' · '+r.process_reuse_evidence.returns.map(x=>esc((x.dismantle_type||'2114')+' → '+(x.production_station||'3022')+' ('+formatFactoryDateTime(x.production_time)+')')).join('; '):''}</p>`:''}
  ${rowKind==='pcbas'&&r.unproven_use_context?`<p class="mes-context" data-pcba-use-limits>${t('Evidências encontradas para esta PCBA','Evidence found for this board')}: 2114 · ${r.unproven_use_context['2114_records']} ${t('registros','records')} (${r.unproven_use_context['2114_dismantlings']} ${t('desmontagens registradas','dismantling scopes')}); 3022 · ${r.unproven_use_context['3022_process_passages']} ${t('passagens','passages')} / ${r.unproven_use_context['3022_correlations']} ${t('correlações','correlations')}. ${t('Isso não permite afirmar primeiro uso nem segundo uso sem uma montagem comprovada.','These facts alone cannot establish first or second physical use.')}</p>`:''}
  ${rowKind==='pcbas'?renderBoardComparisonTable(r):''}
  ${rowKind==='pcbas'&&r.history_2114?.length?`<details data-board-2114-timeline><summary>${t('Histórico completo 2114','Full 2114 history')} · ${r.history_2114.length} ${t('registros','records')} · ${r.history_2114_repeats} ${t('repetições internas da mesma falha','internal exact-failure repeats')}</summary>
  <p>${t('MainBoard e Phone Disassembly indicam escopos de desmontagem diferentes; Phone Battery Cover indica somente retirada da tampa. Análise vazia não comprova execução. Nenhum deles, isoladamente, comprova um novo ciclo de montagem: para 2º uso é preciso vínculo físico na 3074 ou retorno correlacionado na 3022. Repetição 2114 não atribui falha atual 3028 automaticamente.','MainBoard and Phone Disassembly record different disassembly scopes; Phone Battery Cover is cover-only. Blank analysis does not prove a completed operation. None alone proves reassembly: second use requires a physical 3074 binding or correlated 3022 return. A repeated 2114 entry does not automatically attribute the current 3028 failure.')}</p>
  <div class="table-wrap ames-component-comparison"><table><thead><tr><th>Hist Seq</th><th>${t('Falha 2114','2114 failure')}</th><th>${t('Horário 2114','2114 time')}</th><th>${t('Análise','Analysis')}</th><th>${t('Interpretação do processo','Process interpretation')}</th><th>Repair</th><th>${t('Reincidência dentro da 2114','2114 internal recurrence')}</th></tr></thead>
  <tbody>${r.history_2114.map(h=>`<tr><td>${h.hist_seq===null?'—':esc(String(h.hist_seq))}</td><td>${esc(h.defect_desc||h.defect_code||'—')} <small>${esc(h.defect_code||'')}</small></td><td>${h.defect_time?esc(formatFactoryDateTime(h.defect_time)):`<span class="ames-reuse-unproven">${t('Não informado','Not reported')}</span>`}</td><td>${esc(h.defect_type||'—')}</td><td>${esc(scopeLabel(h.analysis_scope))}</td><td>${esc(h.repair_status||'—')}</td><td>${!h.history_order_proven?t('Ordem não comprovada','Unproven order'):h.repeat_exact_prior_count?t('Mesma falha anterior','Same earlier failure')+' ('+h.repeat_exact_prior_count+')':h.repeat_family_prior_count?t('Mesma família anterior','Same earlier family'):'—'}</td></tr>`).join('')}</tbody></table></div></details>`:''}
  ${rowKind==='components'&&r.binding_history?.length?`<section data-component-binding-history><h5>${t('Todos os vínculos 3074 e históricos 2114 disponíveis','All 3074 bindings and available 2114 histories')} · ${r.binding_history.length} ${t('PCBAs vinculadas/investigadas','linked/investigated boards')}</h5><p class="mes-context" data-component-at-candidate-note>${t('* Dados 3012 são associados por PCBA + falha exata (candidato), não por Hist Seq; horário da falha e horário de reparo ficam separados. Cada reparo 3012 aparece abaixo em linha própria, sem atribuição automática à Hist Seq.','* 3012 data are candidate matches by board + exact fault, not Hist Seq; fault and repair time remain separate. Each 3012 repair appears separately below; no automatic Hist Seq link.')}</p>
  <p>${t('Recorrência neste indicador = mesmo código de falha em pelo menos duas PCBAs distintas que tiveram vínculo 3074 com este SN. Repetições na mesma placa contam uma placa; associação não prova causa nem o instante de montagem.','Here recurrence means the same defect code on at least two different boards linked to this physical SN in 3074. Repetitions on one board count once; association does not prove cause or mounting time.')}</p>
  ${r.cross_board_recurrences?.length?`<p data-component-cross-board-recurrence><strong>${t('Mesma falha em PCBAs distintas','Same failure across different boards')}:</strong> ${r.cross_board_recurrences.map(group=>esc((group.defect_desc||group.defect_code)+' · '+group.pcba_count+' '+t('PCBAs','boards')+' ('+group.pcbas.join(', ')+')')).join(' · ')}</p>`:''}
  ${renderComponentComparisonTable(consolidateComponentHistory(r.binding_history))}</section>`:''}
  <p>${kind==='components'?t('Para estado Y/N e horários de vínculo consulte as evidências 3074; vínculo antigo não prova montagem atual.','For Y/N status and binding times inspect 3074 evidence; prior binding does not prove current mounting.'):''}</p>${sourceAudit(r,rowKind)}</details>`).join('')}`;
  wireReuse3012Columns(host);
 }
 const repairCache=new Map(),operatorCache=new Map();
 function wireReuse3012Columns(host){
  for(const detail of host.querySelectorAll('details[data-cohort-row]'))detail.addEventListener('toggle',async()=>{
   if(!detail.open)return;
   const timelines=[...detail.querySelectorAll('[data-reuse-3012-history]')];
   if(!timelines.length)return;
   if(typeof cachedRepairHistory!=='function'){
    timelines.forEach(target=>target.innerHTML=`<p class="ames-reuse-unproven">${t('Consulta 3012 local indisponível; isso não comprova ausência de reparos.','Local 3012 history unavailable; absence of repairs not proven.')}</p>`);
    return;
   }
   const sourceGroups=timelines.map(target=>({target,
    rows:[...(target.previousElementSibling?.querySelectorAll('[data-reuse-source-row]')||[])]}));
   const boards=[...new Set(sourceGroups.flatMap(group=>group.rows.map(row=>row.dataset.pcba)).filter(Boolean))];
   for(const board of boards){
    if(!repairCache.has(board))repairCache.set(board,Promise.resolve().then(()=>cachedRepairHistory({sn:board,limit:5000}))
     .then(rows=>({rows:Array.isArray(rows)?rows:[],failed:false})).catch(()=>({rows:[],failed:true})));
    if(typeof cached3022Operators==='function'&&!operatorCache.has(board))operatorCache.set(board,
     Promise.resolve().then(()=>cached3022Operators({sn:board,limit:5000}))
      .then(rows=>Array.isArray(rows)?rows:[]).catch(()=>[]));
   }
   const results=await Promise.all(boards.map(board=>repairCache.get(board)));
   const operators=(await Promise.all(boards.map(board=>operatorCache.get(board)||Promise.resolve([])))).flat();
   if(!detail.isConnected)return;
   const byBoard=new Map(boards.map((board,i)=>[board,results[i]]));
   for(const {target,rows} of sourceGroups){
    const codesByBoard=new Map();
    for(const row of rows){
     const board=row.dataset.pcba,code=row.dataset.defectCode;
     if(!board||!code)continue;
     if(!codesByBoard.has(board))codesByBoard.set(board,new Set());
     codesByBoard.get(board).add(code);
    }
    let failed=false,repairs=[];
    for(const [board,codes] of codesByBoard){
     const result=byBoard.get(board);
     if(result?.failed){failed=true;continue;}
     // This lookup is solely to discover relevant 3012 records. Each record is
     // displayed ONCE below; it is NOT copied to any 2114/3028 occurrence row.
     const observed=[...codes].map(code=>({pcba_sn:board,defect_code:code,defect_desc:code}));
     repairs.push(...matchCached3012Repairs(observed,result?.rows||[]));
    }
    const unique=new Map();
    for(const r of repairs){
     const key=r.row_key||JSON.stringify([r.pcba_sn,r.defect_code,r.defect_time,r.repair_time,r.repair_user,r.repair_comment]);
     if(!unique.has(key))unique.set(key,r);
    }
    repairs=enrichReuseRepairTechnicians(projectRepairTechnicianNames([...unique.values()],[...(snapshot.process_timeline?.events||[]),...operators]),[...(snapshot.process_timeline?.events||[]),...operators])
     .sort((a,b)=>String(a.defect_time||'').localeCompare(String(b.defect_time||''))||
      String(a.repair_time||'').localeCompare(String(b.repair_time||'')));
    const tableRows=repairs.map(r=>{
     const cells=compact3012CandidateCells([r]);
     return `<tr data-reuse-3012-occurrence data-pcba="${esc(r.pcba_sn||'')}" data-defect-code="${esc(r.defect_code||'')}" data-defect-time="${esc(r.defect_time||'')}">
      <td class="ames-component-compare-pcba">${esc(r.pcba_sn||'—')}</td>
      <td><strong>${esc(r.defect_desc||r.defect_code||'—')}</strong><small>${esc(r.defect_code||'')}</small></td>
      <td>${cells.fault}</td><td class="ames-reuse-at-cell" data-reuse-at-field="technician">${cells.technician}</td>
      <td>${cells.repair}</td><td class="ames-reuse-at-cell">${cells.comment}</td>
      <td>3012<small>${t('Registro próprio','Own record')}</small></td></tr>`;
    }).join('');
    const note=t('Cada linha é um atendimento registrado na 3012. Não atribuímos esse reparo a uma Hist Seq 2114 apenas porque a PCBA e o código coincidem. O responsável pelo reparo 3012 e o operador A6900 da 3022 podem ser pessoas diferentes.',
     'Every row is one 3012 repair record. It is not attached to 2114 Hist Seq by board and code alone. The 3012 repair user and 3022 A6900 operator can be different people.');
    target.innerHTML=`<section data-reuse-3012-timeline>
     <h5>${t('Histórico de reparos 3012 · por atendimento','3012 repair history · per visit')} · ${repairs.length}</h5>
     <p class="mes-context">${note}</p>
     ${tableRows?`<div class="table-wrap ames-component-comparison"><table><thead><tr>
      <th>PCBA</th><th>${t('Falha','Failure')}</th><th>${t('Falha 3012','3012 defect time')}</th>
      <th>${t('Técnico','Technician')}</th><th>${t('Reparo 3012','3012 repair time')}</th>
      <th>${t('Comentário AT','AT comment')}</th><th>${t('Origem','Source')}</th>
      </tr></thead><tbody>${tableRows}</tbody></table></div>`
      :`<p class="ames-reuse-unproven">${failed?t('Leitura parcial ou indisponível do cache 3012; não concluir ausência de reparo.','3012 cache partially unavailable; do not infer absence of repairs.'):t('Nenhum reparo 3012 desta PCBA/falha foi localizado no cache consultado; ausência não comprovada.','No matching 3012 repair found in local cache; absence unproven.')}</p>`}
    </section>`;
   }
  });
 }
 render();
}
