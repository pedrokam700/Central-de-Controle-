// One provenance decision for the reading-period and latest-capture views.
// An origin seen in Firebase is not evidence that the active local agent owns it.
// Never resolve multiple sources by newest timestamp or browser cache alone.
export function resolveHistorySource(entries=[], {
  preferredSource=null, agentSource=null, retainedSource=null
}={}) {
  const rows=Array.isArray(entries)?entries.filter(e=>e&&typeof e.source_id==='string'&&e.source_id.trim()):[];
  const sources=[...new Set(rows.map(e=>e.source_id))];
  if(!sources.length)return {status:'none',source_id:null,sources:[],reason:'no_source'};
  if(sources.length===1)return {status:'available',source_id:sources[0],sources,reason:'unique_source'};
  if(preferredSource&&sources.includes(preferredSource))
    return {status:'conflict_resolved',source_id:preferredSource,sources,reason:'operator_preference'};
  // The agent's asserted source_id must be backed by an actual local historical
  // entry for this exact line and period, not merely a cloud snapshot or cached ID.
  if(agentSource&&rows.some(e=>e.source_id===agentSource&&e.history_source==='local'))
    return {status:'conflict_resolved',source_id:agentSource,sources,reason:'proven_local_origin'};
  if(retainedSource&&sources.includes(retainedSource))
    return {status:'conflict_resolved',source_id:retainedSource,sources,reason:'validated_current_scope'};
  return {status:'conflict_unresolved',source_id:null,sources,reason:'multiple_unproven_origins'};
}
