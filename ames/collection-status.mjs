import {escapeHtml as esc} from './evidence-view.mjs';

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
    <div class="ames-progress-list">${stages.map(stage=>{const p=progress[stage];return `<article><b>${stage}</b> · <span>${esc(p?.line||'Linha aguardando informação')}</span>${p?`<progress max="100" value="${Math.max(0,Math.min(100,Number(p.line_percent)||0))}"></progress><small>${esc(p.current??'—')}/${esc(p.total??'—')} · ${esc(p.detail||'')}</small>`:` · ${esc(job.stage===stage?'Em execução':job.result?.stages?.[stage]||'Aguardando')}`}</article>`;}).join('')}</div>
    ${job.status==='done'&&result?`<section data-trace-result><h4>Resultado da coleta</h4><p>Valores informados pelo job; cobertura disponível no snapshot.</p>${Object.entries(result).map(([line,r])=>`<article><b>${esc(line)}</b>${r.skipped?`<p>${esc(r.reason||'Linha sem ocorrências no escopo.')}</p>`:`<p>Escopo consultado: ${esc(r.scope?.records??'—')} ocorrências · ${esc(r.scope?.unique_pcbas??'—')} PCBAs</p><p>3074 · materiais no snapshot: ${esc(r.enrichment?.material_rows??'—')}<br>2114 · históricos no snapshot: ${esc(r.enrichment?.history_rows??'—')}<br>3022 · eventos coletados: ${esc(r['3022']?.events??'—')} · contextos: ${esc(r['3022']?.contexts??'—')}</p>${(r['3022']?.warnings||[]).map(w=>`<p class="notice warn">${esc(w)}</p>`).join('')}`}</article>`).join('')}</section>`:''}`;
}
