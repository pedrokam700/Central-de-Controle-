import {immutable,requireLine,productKey} from './contract.mjs';
import {normalizeAgentRead} from './agent-contract.mjs';
export const CANONICAL_SCHEMA='central-ames-v2';
export const DATASETS=Object.freeze(['defects','pcba_history','material_reuse','history_contexts','process_timeline']);
export function normalizeCanonical(payload){
  if(payload?.schema!==CANONICAL_SCHEMA||payload.schema_version!==2||!Number.isSafeInteger(payload.snapshot_revision)||payload.snapshot_revision<1||!payload.source_id||!payload.content_hash)throw Error('Invalid canonical snapshot');
  const line=requireLine(payload.line_id),sid=String(payload.snapshot_id),revision=payload.snapshot_revision;
  const datasets={};
  for(const name of DATASETS){
    if(!Array.isArray(payload.datasets?.[name]))throw Error('Missing dataset '+name);
    datasets[name]=payload.datasets[name];
    const ids=new Set();
    for(const row of datasets[name]){
      if(row.line_id!==line||String(row.snapshot_id)!==sid||row.snapshot_revision!==revision||!row.record_id||ids.has(row.record_id))throw Error('Mixed revision/line or duplicate record');
      ids.add(row.record_id);
      if(name==='defects'&&(row.line!==line||!String(row.pcba_sn||'').trim()||!row.occurrence_id||productKey(row.product_model)!==(row.product||'')))throw Error('Invalid canonical occurrence');
    }
    if(payload.coverage?.[name]?.transport_complete!==true||payload.coverage[name].stored_total!==datasets[name].length)throw Error('Incomplete canonical transport');
  }
  const legacy={schema:'central-v2-ames-line-v1',line,summary:{...payload.summary,line,snapshot_id:sid},defects:datasets.defects};
  const base=normalizeAgentRead({legacy,datasets,insights:payload.insights});
  const occurrences=base.occurrences.map((row,i)=>({...row,occurrence_id:datasets.defects[i].occurrence_id,identity_kind:'durable_local_observation',evidence_ref:JSON.stringify([payload.source_id,sid,revision,datasets.defects[i].record_id]),snapshot_revision:revision,raw_ref:datasets.defects[i].raw_ref,provenance:datasets.defects[i].provenance}));
  const processEvents=payload.capabilities?.process_timeline?datasets.process_timeline:[];
  const contextMap=new Map();
  for(const event of processEvents){
    const contexts=event?.provenance?.adapter?.defect_contexts;
    if(!Array.isArray(contexts))continue;
    for(const raw of contexts){
      if(!raw||typeof raw!=='object')continue;
      const ctx={...raw,line:raw.line||line,snapshot_id:sid,pcba_sn:raw.pcba_sn||event.pcba_sn,source:'3022'};
      if(ctx.line!==line||!ctx.pcba_sn)continue;
      const key=String(ctx.defect_key||JSON.stringify([ctx.pcba_sn,ctx.defect_time,ctx.defect_code]));
      if(!contextMap.has(key))contextMap.set(key,ctx);
    }
  }
  const processContexts=[...contextMap.values()];
  return immutable({...base,source_schema:CANONICAL_SCHEMA,revision,snapshot_revision:revision,source_id:payload.source_id,content_hash:payload.content_hash,
    occurrences,pcba_history:{status:'partial',records:datasets.pcba_history},material_trace:{status:'partial',records:datasets.material_reuse},history_contexts:datasets.history_contexts,
    process_timeline:{status:payload.capabilities?.process_timeline?'partial':'not_collected',events:processEvents,contexts:processContexts},
    coverage:{...base.coverage,datasets:payload.coverage,reasons:['Source coverage remains partial; transport covers the stored revision']},canonical:payload});
}
export function sourceRecords(snapshot,{product,pcba_sn,material_sn}={}){
  const key=product===undefined?null:productKey(product);
  const matches=row=>row.line_id===snapshot?.line_id&&(key===null||row.product===key||row.provenance?.contexts?.some(c=>c.product===key&&(!pcba_sn||c.pcba_sn===pcba_sn)))&&(!pcba_sn||row.pcba_sn===pcba_sn||row.current_pcba_sn===pcba_sn||row.provenance?.contexts?.some(c=>c.pcba_sn===pcba_sn))&&(!material_sn||row.material_sn===material_sn||row.item_sn===material_sn||row.provenance?.contexts?.some(c=>c.material_sn===material_sn));
  return {pcba_history:(snapshot?.pcba_history.records||[]).filter(matches),materials:(snapshot?.material_trace.records||[]).filter(matches),process_events:(snapshot?.process_timeline.events||[]).filter(matches)};
}
