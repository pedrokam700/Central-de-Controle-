import {LINE_IDS} from './data/contract.mjs';
import {factoryWallMinute} from './data/history.mjs';
import {matchesReadingPeriod} from './data/reading-period.mjs';

// One loader for the existing session/store. Reads stored revisions only.
export function createReadingPeriodController(store,history,{changed=()=>{}}={}){
  let request=0,disposed=false;
  // Workstation choices apply only to the given line and period, never other scopes.
  const sourceOverrides=new Map();
  const scopeKey=(period,line)=>JSON.stringify([period.mode,period.start,period.end,line]);
  async function select(mode,options={}){
    const generation=store.selectReadingPeriod(mode,options),serial=++request;
    const selected=store.readingPeriod();
    const alive=()=>!disposed&&request===serial&&store.periodGeneration()===generation;
    store.updateAgent({period_read:{status:'loading',errors:[]}});changed();
    const errors=[],source_choices=[];
    const results=await Promise.allSettled(LINE_IDS.map(async line=>{
      if(!history)return;
      let entries=(await history.list(line)).filter(e=>{
        const start=factoryWallMinute(e.period_start),end=factoryWallMinute(e.period_end);
        return start===selected.start&&end&&end>start&&(mode==='custom'?end===selected.end:end<=selected.end);
      }).sort((a,b)=>Date.parse(b.collected_at)-Date.parse(a.collected_at)||Number(b.snapshot_id)-Number(a.snapshot_id)||Number(b.revision_pending===true)-Number(a.revision_pending===true)||Number(b.snapshot_revision)-Number(a.snapshot_revision));
      if(!alive())return;
      // Never silently use the latest revision from a different workstation.
      // A connected agent can identify its own local revisions; otherwise ask.
      const sources=[...new Set(entries.map(e=>e.source_id))];
      if(sources.length>1){
        const agent=store.agent(),scope=scopeKey(selected,line);
        const selectedSource=sourceOverrides.get(scope);
        const agentSource=agent.status==='connected'?agent.capabilities?.source_id:null;
        const isLocal=id=>entries.some(e=>e.source_id===id&&e.history_source==='local');
        // "Local" does not guarantee identity after a CLEAN install.
        const headSources=agent.status==='connected'
          ? [...new Set(store.localCanonical().map(p=>p.source_id).filter(Boolean))]:[];
        const provenSource=agentSource||(headSources.length===1?headSources[0]:null);
        const provenLocal=provenSource&&sources.includes(provenSource)&&isLocal(provenSource)?provenSource:null;
        const resolved=selectedSource&&sources.includes(selectedSource)?selectedSource:provenLocal;
        if(!resolved){
          source_choices.push({line_id:line,options:sources.filter(Boolean).map(source_id=>{
            const rows=entries.filter(e=>e.source_id===source_id);
            return {source_id,history_source:rows.some(e=>e.history_source==='local')?'local':'shared',collected_at:rows[0]?.collected_at||null};
          })});
          return;
        }
        entries=entries.filter(e=>e.source_id===resolved);
      }
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
    source_choices.sort((a,b)=>LINE_IDS.indexOf(a.line_id)-LINE_IDS.indexOf(b.line_id));
    store.updateAgent({period_read:{status:errors.length||source_choices.length?'partial':'ready',errors,source_choices,loaded_lines}});changed();
  }
  async function chooseSource(line,source_id){
    const period=store.readingPeriod();
    const choices=store.agent().period_read?.source_choices||[];
    if(!period||!LINE_IDS.includes(line)||!choices.some(c=>c.line_id===line&&c.options.some(o=>o.source_id===source_id)))
      throw Error('invalid_history_source_choice');
    sourceOverrides.set(scopeKey(period,line),source_id);
    return select(period.mode,period.mode==='custom'?{start:period.start,end:period.end}:{});
  }
  return {select,chooseSource,clear(){disposed=true;request++;sourceOverrides.clear();}};
}
