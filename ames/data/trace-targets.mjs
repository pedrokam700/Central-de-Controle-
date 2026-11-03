import {LINE_IDS} from './contract.mjs';
import {matchesReadingPeriod} from './reading-period.mjs';

// A deep trace enriches one immutable 3028 revision, never the latest snapshot.
// The same check drives the line picker and the actual HTTP request. A missing
// local revision is actionable, but must not prevent tracing a different line.
export function traceTargetForLine(store,line){
  if(!LINE_IDS.includes(line))return {available:false,reason:'Linha inválida'};
  const read=store.read(line),shown=read.snapshot?.canonical,selected=store.readingPeriod?.();
  const agentSource=store.agent()?.capabilities?.source_id;
  if(!shown)return {available:false,reason:'Sem revisão 3028 neste período'};
  // A read-only shared presentation may be the SAME underlying local source
  // and 3028 snapshot. Prefer its live, verified local head ONLY with exact
  // source + snapshot + line + period identity; never borrow a similarly
  // numbered snapshot from another workstation.
  const provenLocal=(store.localCanonical?.()||[]).find(p=>
    read.source!=='local'&&
    p?.line_id===line&&p.source_id===agentSource&&
    p.source_id===shown.source_id&&
    String(p.snapshot_id)===String(shown.snapshot_id)&&
    matchesReadingPeriod(p,selected));
  const p=provenLocal||shown,period=p?.summary?.period;
  // A previous revision opened as read-only recovery is not proof that the
  // agent still considers it the latest revision for this snapshot.
  if(selected?.mode!=='today'&&store.agent()?.period_read?.recovered_lines?.some(x=>x.line_id===line))
    return {available:false,reason:'Revisão mais recente indisponível; atualize a leitura antes de coletar'};
  if((read.source!=='local'&&!provenLocal)||p.source_id!==agentSource)
    return {available:false,reason:'Revisão não pertence ao agente local conectado'};
  if(!period?.start_at||!period?.end_at)
    return {available:false,reason:'Período operacional não comprovado'};
  if(!Number.isSafeInteger(Number(p.snapshot_id))||Number(p.snapshot_id)<1||
    !Number.isSafeInteger(p.snapshot_revision)||p.snapshot_revision<1||
    typeof p.content_hash!=='string'||!p.content_hash)
    return {available:false,reason:'Identidade da revisão incompleta'};
  return {available:true,target:{source_id:p.source_id,snapshot_id:p.snapshot_id,
    snapshot_revision:p.snapshot_revision,content_hash:p.content_hash,period},
    proof:read.source==='local'||Boolean(provenLocal)?'local_current':'requires_local_history_verification',
    period,revision:p.snapshot_revision,snapshot_id:p.snapshot_id};
}

export function exactTraceTargets(store,lines){
  if(!Array.isArray(lines)||!lines.length||new Set(lines).size!==lines.length)
    throw Error('Selecione linhas distintas para a rastreabilidade.');
  const targets={},missing=[];
  for(const line of lines){
    const state=traceTargetForLine(store,line);
    if(state.available)targets[line]=state.target;
    else missing.push(`${line}: ${state.reason}`);
  }
  if(missing.length)throw Error('Coleta não iniciada: '+missing.join(' · ')+'. Selecione apenas linhas com revisão local do período ou atualize a leitura.');
  return targets;
}


// A prior deep trace can enrich the SAME 3028 snapshot while the operator is
// still viewing its older immutable revision. The agent requires the current
// revision. Validate the latest LOCAL canonical export without silently
// switching to another 3028 snapshot, another PC, line or operational day.
export function refreshedTraceTarget(original, current){
  const expected=original?.period,actual=current?.summary?.period;
  if(!expected||!actual||current?.source_id!==original.source_id||
     current?.line_id!==original.line_id||
     String(current?.snapshot_id)!==String(original.snapshot_id)||
     actual.start_at!==expected.start_at||actual.end_at!==expected.end_at||
     actual.mode!==expected.mode)
    throw Error('Revisão local mudou de origem, linha, snapshot ou período; coleta não iniciada.');
  if(!Number.isSafeInteger(current.snapshot_revision)||
     current.snapshot_revision<original.snapshot_revision||
     (current.snapshot_revision===original.snapshot_revision&&current.content_hash!==original.content_hash)||
     typeof current.content_hash!=='string'||!current.content_hash)
    throw Error('Revisão local inválida ou anterior à selecionada; coleta não iniciada.');
  return {...original,snapshot_revision:current.snapshot_revision,content_hash:current.content_hash};
}
