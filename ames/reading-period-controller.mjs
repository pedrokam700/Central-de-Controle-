import {LINE_IDS} from './data/contract.mjs';
import {factoryWallMinute} from './data/history.mjs';
import {matchesReadingPeriod} from './data/reading-period.mjs';

// One loader for the existing session/store. Reads stored revisions only.
export function createReadingPeriodController(store,history,{changed=()=>{}}={}){
  let request=0,disposed=false;
  async function select(mode,options={}){
    const generation=store.selectReadingPeriod(mode,options),serial=++request;
    const selected=store.readingPeriod();
    const alive=()=>!disposed&&request===serial&&store.periodGeneration()===generation;
    store.updateAgent({period_read:{status:'loading',errors:[]}});changed();
    const errors=[];
    const results=await Promise.allSettled(LINE_IDS.map(async line=>{
      if(!history)return;
      const entries=(await history.list(line)).filter(e=>{
        const start=factoryWallMinute(e.period_start),end=factoryWallMinute(e.period_end);
        return start===selected.start&&end&&end>start&&(mode==='custom'?end===selected.end:end<=selected.end);
      }).sort((a,b)=>Date.parse(b.collected_at)-Date.parse(a.collected_at)||Number(b.snapshot_id)-Number(a.snapshot_id)||Number(b.revision_pending===true)-Number(a.revision_pending===true)||Number(b.snapshot_revision)-Number(a.snapshot_revision));
      if(!alive())return;
      // Multiple workstations are not interchangeable evidence. Explicit revision choice is required.
      if(new Set(entries.map(e=>e.source_id)).size>1)throw Error('ambiguous_history_source:'+line);
      for(const entry of entries){
        const payload=await history.open(entry);if(!alive())return;
        const materialized=entry.history_source==='local'&&entry.revision_pending===true&&entry.snapshot_revision==null&&Number.isSafeInteger(payload.snapshot_revision)&&payload.snapshot_revision>0;
        if(payload.line_id!==line||payload.source_id!==entry.source_id||String(payload.snapshot_id)!==String(entry.snapshot_id)||(!materialized&&payload.snapshot_revision!==entry.snapshot_revision))throw Error('historical_identity_mismatch:'+line);
        if(!matchesReadingPeriod(payload,selected))continue;
        // Today keeps following its live head. Never pin it to an index fetched earlier.
        if(mode==='today'&&store.read(line).snapshot)return;
        store.installHistoricalSnapshot(payload,{generation,source:entry.history_source==='local'?'local':'remote'});
        return;
      }
    }));
    if(!alive())return;
    results.forEach((r,i)=>{if(r.status==='rejected')errors.push({line_id:LINE_IDS[i],error:r.reason?.message||'history_unavailable'});});
    const loaded_lines=LINE_IDS.filter(line=>!!store.read(line).snapshot);
    store.updateAgent({period_read:{status:errors.length?'partial':'ready',errors,loaded_lines}});changed();
  }
  return {select,clear(){disposed=true;request++;}};
}
