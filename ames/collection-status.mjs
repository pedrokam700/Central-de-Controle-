import {escapeHtml as esc} from './evidence-view.mjs';

const sourceState=value=>String(value||'').trim().toUpperCase();
const t=(pt,en)=>typeof document!=='undefined'&&document.documentElement?.lang?.startsWith('en')?en:pt;
const SOURCE_PROOF=Object.freeze({
  done:['Completa','Complete'],partial:['Parcial','Partial'],
  error:['Falhou','Failed'],not_run:['Não coletada','Not collected'],
});
const sourceProofLabel=value=>{
  const pair=SOURCE_PROOF[String(value||'').toLowerCase()];
  return pair?t(...pair):t('Não comprovada','Unverified');
};

const stageLabel=x=>({'3074':'3074 · Vínculos físicos','2114':'2114 · Histórico PCBA','3022':'3022 · Processo'})[x]||x;
const friendlyLine=id=>({'TAN10101':'Linha 1','TAN10102':'Linha 2','TAN10103':'Linha 3'})[id]||id||'Linha não informada';
const pair=(a,b)=>a!=null&&b!=null&&b>0?`${a}/${b}`:'';
export function liveTraceFeed(job={}){
  if(!['deep_trace','trace','deep'].includes(String(job.kind||'')))return '';
  const rows=Array.isArray(job.live_events)?job.live_events.slice(-12).reverse():[];
  const status=String(job.status||'').toLowerCase();
  const busy=['queued','running','starting','in_progress'].includes(status);
  const heading=busy?'Rastreando ao vivo':status==='done'?'Últimas etapas da execução':status==='error'?'Execução interrompida':'Últimas evidências da execução';
  return `<section class="ames-live-feed" data-trace-live-feed aria-label="Evolução da rastreabilidade">
    <div class="section-head"><div><h4>${heading}</h4><p>As leituras aparecem conforme o próprio job informa. Dados parciais não comprovam conclusão.</p></div><span class="status ${status==='error'?'bad':busy?'warn':status==='done'?'ok':'unknown'}">${esc(status||'aguardando')}</span></div>
    ${rows.length?`<div class="ames-live-feed-list" role="log" aria-label="Últimos eventos da coleta">${rows.map(e=>{
      const ref=e.stage==='3074'?e.sn||e.pcba:e.pcba||e.sn;
      const item=e.kind==='component'?[e.item_type,e.item_sn].filter(Boolean).join(' · '):'';
      const failure=pair(e.defect_index,e.defect_total),component=pair(e.component_index,e.component_total),progress=pair(e.current,e.total);
      return `<div class="ames-live-feed-row"><b>${esc(stageLabel(e.stage))}</b><span>${esc(friendlyLine(e.line))}</span>
        <span class="ames-live-feed-target">${esc(ref||'PCBA não informada')}${item?` · ${esc(item)}`:''}</span>
        <small>${failure?`Falha ${esc(failure)}`:''}${component?` · Componente ${esc(component)}`:''}${progress?` · ${esc(progress)}`:''}${e.status?` · ${esc(e.status)}`:''}</small>
      </div>`;
    }).join('')}</div>`:`<p class="mes-context" role="status">${busy?'Aguardando eventos detalhados do agente local.':'Nenhum evento detalhado disponível neste job.'}</p>`}
    <small>Exibição local limitada aos 12 eventos mais recentes. Não adiciona coleta nem envia SNs ao Firebase.</small>
  </section>`;
}

function stageDetail(stage,p){
  if(!p)return '';
  const bits=[`${p.current??'—'}/${p.total??'—'}`];
  if(p.status)bits.push(String(p.status));
  if(p.phase)bits.push(p.phase==='mes'?'leitura A-MES':p.phase==='local'?'processamento local':String(p.phase));
  if(p.detail)bits.push(String(p.detail));
  return bits.join(' · ');
}
function trace2114Summary(row){
  const src=row?.['2114']||{};
  const state=sourceState(src.source_status||src.status);
  const requested=Number(src.requested_pcba_count||0),processed=Number(src.processed_pcba_count||0),errors=Number(src.pcba_error_count||0),noData=Number(src.pcba_no_data_count||0);
  if(state==='ERROR'){
    return `<span class="notice warn"><b>2114 indisponível</b> · ${esc(processed)}/${esc(requested)} consultadas · ${esc(errors)} erro(s)${src.source_error?`<br>${esc(src.source_error)}`:''}</span>`;
  }
  if(state==='PARTIAL'){
    return `<span class="notice warn"><b>2114 parcial</b> · ${esc(processed)}/${esc(requested)} consultadas · ${esc(errors)} erro(s) · ${esc(noData)} sem dados confirmados${src.source_error?`<br>${esc(src.source_error)}`:''}</span>`;
  }
  if(state==='COMPLETE'){
    return `2114 · históricos no snapshot: ${esc(row.enrichment?.history_rows??'—')} · PCBAs consultadas: ${esc(processed)}/${esc(requested)} · sem dados confirmados: ${esc(noData)}`;
  }
  // Backward-compatible display for older/synthetic jobs that predate the
  // explicit source_status contract. A real current source error always carries
  // source_status and is handled above, so UNKNOWN is never converted to zero.
  if(row?.enrichment && Object.hasOwn(row.enrichment,'history_rows'))return `2114 · históricos no snapshot: ${esc(row.enrichment.history_rows)}`;
  return '2114 · fonte não executada / estado desconhecido';
}
function trace3022Summary(row){
  const src=row?.['3022']||{};
  if(!Object.keys(src).length)return '3022 · fonte não executada';
  const state=String(src.status||'unknown').toLowerCase();
  const timing=src.timing||{};
  return `3022 · eventos coletados: ${esc(src.events??'—')} · contextos: ${esc(src.contexts??'—')} · ${esc(state)} · ${esc(src.processed??'—')}/${esc(src.requested??'—')} PCBAs processadas · ${esc(src.errors??0)} erro(s)${timing.query_avg_ms!=null?` · média MES ${esc(timing.query_avg_ms)} ms`:''}`;
}

export function collectionStatus(state){
  const job=state.job;
  const error=state.error?`<div role="alert" class="notice warn">${esc(state.error)}</div>`:'';
  if(state.submitting)return error+'<p role="status">Iniciando rastreabilidade...</p>';
  if(!job)return error||'<p>Nenhuma coleta iniciada nesta sessão.</p>';
  const mode=job.scope?.trace_mode||job.result?.scope?.trace_mode||'full';
  const stages=job.kind!=='deep_trace'?Object.keys(job.stage_progress||{}):mode==='process_only'?['3022']:mode==='reuse_only'?['3074','2114']:['3074','2114','3022'];
  const progress=job.stage_progress||{};
  const result=job.result?.deep_trace;
  const completedTrace=job.kind==='deep_trace'&&job.status==='done';
  const sourceStages=job.result?.stages||{};
  const unverified=completedTrace?stages.filter(stage=>sourceStages[stage]!=='done'):[];
  const sourceWarning=unverified.length?`<div class="notice warn" data-trace-source-coverage role="status"><b>${t('Cobertura não comprovada','Coverage not verified')}</b> · ${unverified.map(stage=>`${esc(stage)}: ${esc(sourceProofLabel(sourceStages[stage]))}`).join(' · ')}. ${t('Job finalizado não significa fontes completas.','Finished job does not mean complete sources.')}</div>`:'';
  return `${error}<div class="ames-job-head"><b>Job ${esc(job.id)}</b><span>${esc(job.status)}</span></div><p>${esc(job.message||job.error||'Aguardando execução.')}</p>
    ${sourceWarning}
    ${job.kind==='deep_trace'?`<p>${stages.join(' → ')}</p>`:''}
    <div class="ames-progress-list">${stages.map(stage=>{const p=progress[stage];return `<article><b>${stage}</b> · <span>${esc(p?.line||'Linha aguardando informação')}</span>${p?`<progress max="100" value="${Math.max(0,Math.min(100,Number(p.line_percent)||0))}"></progress><small>${esc(stageDetail(stage,p))}</small>`:` · ${esc(job.stage===stage?'Em execução':'Aguardando')}`}${completedTrace?`<small data-trace-source-stage="${esc(stage)}"> · ${t('Cobertura','Coverage')}: ${esc(sourceProofLabel(sourceStages[stage]))}</small>`:''}</article>`;}).join('')}</div>
    ${liveTraceFeed(job)}
    ${job.status==='done'&&result?`<section data-trace-result><h4>Resultado da coleta</h4><p>Valores informados pelo job; erro/indisponibilidade de uma fonte nunca é convertido em zero.</p>${Object.entries(result).map(([line,r])=>`<article><b>${esc(line)}</b>${r.skipped?`<p>${esc(r.reason||'Linha sem ocorrências no escopo.')}</p>`:`<p>Escopo consultado: ${esc(r.scope?.records??'—')} ocorrências · ${esc(r.scope?.unique_pcbas??'—')} PCBAs</p><p>3074 · materiais no snapshot: ${esc(r.enrichment?.material_rows??'—')}<br>${trace2114Summary(r)}<br>${trace3022Summary(r)}</p>${(r['3022']?.warnings||[]).map(w=>`<p class="notice warn">${esc(w)}</p>`).join('')}`}</article>`).join('')}</section>`:''}`;
}
