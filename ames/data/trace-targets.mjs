import {LINE_IDS} from './contract.mjs';

// A deep trace enriches one immutable 3028 revision, never the latest snapshot.
// The same check drives the line picker and the actual HTTP request. A missing
// local revision is actionable, but must not prevent tracing a different line.
export function traceTargetForLine(store,line){
  if(!LINE_IDS.includes(line))return {available:false,reason:'Linha inválida'};
  const read=store.read(line),p=read.snapshot?.canonical,period=p?.summary?.period;
  if(!p)return {available:false,reason:'Sem revisão 3028 neste período'};
  if(read.source!=='local'||p.source_id!==store.agent().capabilities?.source_id)
    return {available:false,reason:'Revisão não pertence ao agente local conectado'};
  if(!period?.start_at||!period?.end_at)
    return {available:false,reason:'Período operacional não comprovado'};
  if(!Number.isSafeInteger(Number(p.snapshot_id))||Number(p.snapshot_id)<1||
    !Number.isSafeInteger(p.snapshot_revision)||p.snapshot_revision<1||
    typeof p.content_hash!=='string'||!p.content_hash)
    return {available:false,reason:'Identidade da revisão incompleta'};
  return {available:true,target:{source_id:p.source_id,snapshot_id:p.snapshot_id,
    snapshot_revision:p.snapshot_revision,content_hash:p.content_hash,period},
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
