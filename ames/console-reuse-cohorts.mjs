import {buildReuseCohorts} from './data/reuse-cohorts.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const labels=()=>({observed:t('SNs observados','Observed SNs'),first_use:t('1º uso','1st use'),reused:t('2º uso ou mais','2nd use or more'),second_use:t('2º uso','2nd use'),third_plus_use:t('3º+ uso','3rd+ use'),unknown_use:t('Uso não determinado','Undetermined use'),failed:t('Reutilizados com falha observada','Reused with observed failure'),associated:t('Reutilizados associados a PCBA defeituosa','Reused associated with defective PCBA'),prior_failure:t('Reutilizados com falha histórica associada','Reused with associated historical failure'),same_failure:t('Mesma falha anterior','Same previous failure'),same_family:t('Mesma família anterior','Same previous family'),verified_no_failure:t('Sem falha registrada · somente com cobertura integral','No recorded failure · complete coverage required'),unknown_outcome:t('Histórico insuficiente para concluir','Insufficient history to conclude')});
export const reuseOverviewMetrics={pcbas:['observed','first_use','reused','prior_failure','same_failure','unknown_use'],components:['observed','reused','associated','prior_failure','same_failure','unknown_use']};
export function mountReuseCohorts(root,snapshot){
 let selection=null,filters={};
 const all=buildReuseCohorts(snapshot),options=(key,values)=>`<select name="${key}"><option value="">${t('Todos','All')}</option>${[...new Set(values.filter(Boolean))].sort().map(v=>`<option${filters[key]===v?' selected':''} value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`;
 function render(){
  const model=buildReuseCohorts(snapshot,filters),names=labels();
  // Uncollected/partial evidence must not be rendered as a verified zero-failure cohort.
  const verifiedEvidence=model.pcbas.counts.verified_no_failure!==null||model.components.counts.verified_no_failure!==null;
  const health=snapshot.insights?.local_reconstruction||null;
  const failure=snapshot.insights?.ready===false||!snapshot.insights?.drilldowns;
  const evidenceWarning=failure
    ? `<p role="status" class="mes-context" data-reuse-proof-warning>${esc(snapshot.insights?.message||t('A classificação 3074/2114 não está disponível. Uso indeterminado não significa primeiro uso.','3074/2114 classification unavailable. Unknown use is not first use.'))}</p>`
    : health&&health.source_complete===false
      ? `<p role="status" class="mes-context" data-reuse-proof-warning>${t('Recuperação local parcial, sem nova consulta MES:','Partial local recovery, without MES query:')} ${Number(health.recovered_pcbas||0)}/${Number(health.expected_pcbas||0)} PCBAs · ${Number(health.pcbas_with_3074_self_binding||0)} ${t('vínculos próprios de PCBA comprovados na 3074. Ausência de dados não comprova primeiro uso nem ausência de reuso.','own-PCBA bindings verified in 3074. Missing data do not prove first use or no reuse.')}</p>`
      : '';
  root.innerHTML=`<h3>${t('Populações observadas de reuso','Observed reuse populations')}</h3>${evidenceWarning}<p>${t('Denominador não comprovado. Contagens da amostra investigada; taxa de falha indisponível. Zero observado não prova ausência.','Unproven denominator. Counts from the investigated sample; failure rate unavailable. An observed zero does not prove absence.')}</p>
  <p>${t('SN/CPH filtram ambas as populações; tipo e part number filtram os componentes.','SN/CPH filter both populations; type and part number filter components.')}</p><form data-cohort-filters class="ames-toolbar" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end"><label>SN <input name="sn" value="${esc(filters.sn||'')}"></label><label>CPH ${options('product',[...all.pcbas.rows,...all.components.rows].flatMap(r=>r.products))}</label><label>${t('Tipo','Type')} ${options('item_type',all.components.rows.map(r=>r.item_type))}</label><label>Part number ${options('part_number',all.components.rows.flatMap(r=>r.part_numbers))}</label><button type="submit" class="button secondary">${t('Filtrar','Filter')}</button></form>
  ${['pcbas','components'].map(kind=>`<section data-cohort="${kind}"><h4>${kind==='pcbas'?t('Placas / PCBAs','Boards / PCBAs'):t('Componentes físicos · SN + tipo','Physical components · SN + type')}</h4><div class="ames-reuse-kpis">${Object.entries(names).filter(([key])=>reuseOverviewMetrics[kind].includes(key)).map(([key,label])=>`<button type="button" class="stat ames-kpi-button" data-cohort-kind="${kind}" data-cohort-metric="${key}"><span class="stat-label">${label}</span><strong class="stat-value">${model[kind].counts[key]??'—'}</strong></button>`).join('')}</div></section>`).join('')}
  <details class="ames-reuse-coverage" data-cohort-limits><summary>${t('Limites da cobertura e casos inconclusivos','Coverage limits and unresolved outcomes')}</summary>
  <p>${t('Sem registro de falha não comprova ausência de falha. A categoria sem falha só é calculada quando a população e os desfechos têm comprovação integral. Mesma falha = código exato; mesma família = classificação similar, podendo a mesma peça ter históricos dos dois tipos.','No failure record does not prove no failure. No-failure counts require complete population and outcome proof. Exact failure and similar family are different historical comparisons.')}</p>
  ${verifiedEvidence?`<p>${t('Categorias sem falha só podem ser examinadas com comprovante integral de cobertura.','No-failure categories can be examined only with complete coverage proof.')}</p>`:''}
  ${['pcbas','components'].map(kind=>`<button type="button" class="button secondary" data-cohort-kind="${kind}" data-cohort-metric="unknown_outcome">${kind==='pcbas'?t('PCBAs com histórico inconclusivo','Boards with unresolved history'):t('Componentes com histórico inconclusivo','Components with unresolved history')} · ${model[kind].counts.unknown_outcome}</button>`).join('')}
  </details><div data-cohort-detail></div>`;
  root.querySelector('form').addEventListener('submit',e=>{e.preventDefault();filters=Object.fromEntries(new FormData(e.currentTarget));selection=null;render();});
  for(const button of root.querySelectorAll('[data-cohort-metric]'))button.addEventListener('click',()=>{
    selection=[button.dataset.cohortKind,button.dataset.cohortMetric];
    for(const metricButton of root.querySelectorAll('[data-cohort-metric]')){
      const active=metricButton.dataset.cohortKind===selection[0]&&metricButton.dataset.cohortMetric===selection[1];
      metricButton.classList.toggle('active',active);
      metricButton.setAttribute('aria-pressed',String(active));
    }
    detail(model);
    // Previously this detail was appended below two full KPI matrices:
    // clicking the first PCBAs card appeared to do nothing.
    root.querySelector('[data-cohort-detail]')?.scrollIntoView?.({behavior:'smooth',block:'start'});
  });
  if(selection)detail(model);
 }
 function detail(model){
  const [kind,metric]=selection,rows=model[kind].metrics[metric],host=root.querySelector('[data-cohort-detail]');
  if(metric==='verified_no_failure'&&model[kind].counts.verified_no_failure===null){
   host.innerHTML=`<h4>${labels()[metric]} · —</h4><p role="status">${t('Indisponível: não existe prova do universo completo dos reutilizados e do desfecho de cada item. Isso não equivale a zero materiais sem falha.','Unavailable: the full reused population and each item outcome have not been verified. This is not zero components without failures.')}</p>`;
   return;
  }
  host.innerHTML=`<h4>${labels()[metric]} · ${rows.length} ${t('itens observados','observed items')}</h4><p>${t('Associação e recorrência não confirmam causa. Horários abaixo são registros MES, não horários de produção comprovados.','Association and recurrence do not confirm cause. Times below are MES records, not proven production times.')}</p>${rows.map(r=>`<details data-cohort-row><summary>${esc(r.sn)} · ${esc(r.item_type||'PCBA')} · ${r.use_index?`${r.use_index}º ${t('uso','use')}`:t('uso não determinado','use unknown')}</summary><p>CPH: ${esc(r.products.join(', ')||'—')} · PN: ${esc(r.part_numbers.join(', ')||'—')} · ${t('PCBAs anteriores','Previous PCBAs')}: ${esc(r.previous_pcbas.join(', ')||'—')}</p><p>${t('Falhas atuais','Current failures')}: ${r.events.length} · ${t('Falhas históricas','Historical failures')}: ${r.prior_events.length} · ${t('Mesma falha','Same failure')}: ${r.same_failure?t('sim','yes'):t('não comprovada','not proven')}${r.use_conflict?' · '+t('Usos divergentes: consultar evidências','Conflicting uses: inspect evidence'):''}</p>
  <div class="table-wrap"><table><thead><tr><th>PCBA</th><th>${t('Falha','Failure')}</th><th>${t('Registro MES','MES record')}</th><th>${t('Contexto','Context')}</th></tr></thead><tbody>${[...r.events.map(e=>[e,false]),...r.prior_events.map(e=>[e,true])].map(([e,prior])=>`<tr><td>${esc(e.pcba_sn||'—')}</td><td>${esc(e.defect_desc||e.defect_code||'—')} <small>${esc(e.defect_code||'')}</small></td><td>${esc(formatFactoryDateTime(e.defect_time))}</td><td>${prior?t('Anterior','Previous'):t('Atual','Current')}</td></tr>`).join('')}</tbody></table></div>
  ${kind==='pcbas'&&r.history_2114?.length?`<details data-board-2114-timeline><summary>${t('Histórico completo 2114','Full 2114 history')} · ${r.history_2114.length} ${t('registros','records')} · ${r.history_2114_repeats} ${t('repetições internas da mesma falha','internal exact-failure repeats')}</summary>
  <p>${t('Sequências da própria PCBA, inclusive Hist Seq 0. Repetição dentro da 2114 não comprova novo uso físico nem associação à falha atual da 3028. Status e análise pertencem a cada linha histórica.','The board’s own history, including Hist Seq 0. Repetition inside 2114 does not prove another physical use or association with the current 3028 failure. Status and analysis belong to each historical row.')}</p>
  <div class="table-wrap"><table><thead><tr><th>Hist Seq</th><th>${t('Falha 2114','2114 failure')}</th><th>${t('Análise','Analysis')}</th><th>Repair</th><th>${t('Reincidência dentro da 2114','2114 internal recurrence')}</th></tr></thead>
  <tbody>${r.history_2114.map(h=>`<tr><td>${h.hist_seq===null?'—':esc(String(h.hist_seq))}</td><td>${esc(h.defect_desc||h.defect_code||'—')} <small>${esc(h.defect_code||'')}</small></td><td>${esc(h.defect_type||'—')}</td><td>${esc(h.repair_status||'—')}</td><td>${!h.history_order_proven?t('Ordem não comprovada','Unproven order'):h.repeat_exact_prior_count?t('Mesma falha anterior','Same earlier failure')+' ('+h.repeat_exact_prior_count+')':h.repeat_family_prior_count?t('Mesma família anterior','Same earlier family'):'—'}</td></tr>`).join('')}</tbody></table></div></details>`:''}
  <p>${kind==='components'?t('Para estado Y/N e horários de vínculo consulte as evidências 3074; vínculo antigo não prova montagem atual.','For Y/N status and binding times inspect 3074 evidence; prior binding does not prove current mounting.'):''}</p>${r.evidence.map(e=>`<details><summary>${esc(e.source_view)} · ${esc(e.source_id||'—')} / ${esc(e.snapshot_id)} / r${esc(e.snapshot_revision||'—')} · ${esc(e.record_id||'—')}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(e.raw,null,2))}</pre></details>`).join('')}</details>`).join('')}`;
 }
 render();
}
