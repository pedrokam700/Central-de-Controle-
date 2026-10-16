import {escapeHtml as esc} from './evidence-view.mjs';

const sourceState=value=>String(value||'').trim().toUpperCase();
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
  return `${error}<div class="ames-job-head"><b>Job ${esc(job.id)}</b><span>${esc(job.status)}</span></div><p>${esc(job.message||job.error||'Aguardando execução.')}</p>
    ${job.kind==='deep_trace'?`<p>${stages.join(' → ')}</p>`:''}
    <div class="ames-progress-list">${stages.map(stage=>{const p=progress[stage];return `<article><b>${stage}</b> · <span>${esc(p?.line||'Linha aguardando informação')}</span>${p?`<progress max="100" value="${Math.max(0,Math.min(100,Number(p.line_percent)||0))}"></progress><small>${esc(stageDetail(stage,p))}</small>`:` · ${esc(job.stage===stage?'Em execução':job.result?.stages?.[stage]||'Aguardando')}`}</article>`;}).join('')}</div>
    ${job.status==='done'&&result?`<section data-trace-result><h4>Resultado da coleta</h4><p>Valores informados pelo job; erro/indisponibilidade de uma fonte nunca é convertido em zero.</p>${Object.entries(result).map(([line,r])=>`<article><b>${esc(line)}</b>${r.skipped?`<p>${esc(r.reason||'Linha sem ocorrências no escopo.')}</p>`:`<p>Escopo consultado: ${esc(r.scope?.records??'—')} ocorrências · ${esc(r.scope?.unique_pcbas??'—')} PCBAs</p><p>3074 · materiais no snapshot: ${esc(r.enrichment?.material_rows??'—')}<br>${trace2114Summary(r)}<br>${trace3022Summary(r)}</p>${(r['3022']?.warnings||[]).map(w=>`<p class="notice warn">${esc(w)}</p>`).join('')}`}</article>`).join('')}</section>`:''}`;
}
