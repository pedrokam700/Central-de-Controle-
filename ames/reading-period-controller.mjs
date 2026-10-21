import {LINE_IDS} from './data/contract.mjs';
import {factoryWallMinute} from './data/history.mjs';
import {matchesReadingPeriod} from './data/reading-period.mjs';
import {resolveHistorySource} from './data/history-source-choice.mjs';

// History is read-only. Selection is per line and source, never a global MES job.
const PREF_PREFIX='ames-history-source-preference-v1:';
const safeRead=line=>{
  try{return globalThis.localStorage?.getItem(PREF_PREFIX+line)||null;}catch{return null;}
};
const safeWrite=(line,value)=>{
  try{globalThis.localStorage?.setItem(PREF_PREFIX+line,value);}catch{}
};
const orderEntries=(a,b)=>{
  const clock=x=>Number.isFinite(Date.parse(x?.collected_at))?Date.parse(x.collected_at):0;
  return clock(b)-clock(a)||Number(b.snapshot_revision||0)-Number(a.snapshot_revision||0)||
    String(b.snapshot_id||'').localeCompare(String(a.snapshot_id||''));
};

export function createReadingPeriodController(store,history,{changed=()=>{}}={}){
  let request=0,disposed=false;
  const sourceOverrides=new Map(),preferredByLine=new Map();
  const scopeKey=(period,line)=>JSON.stringify([period.mode,period.start,period.end,line]);
  const preferredSource=line=>preferredByLine.get(line)||safeRead(line);
  function rememberSource(line,source_id,allowed){
    if(!LINE_IDS.includes(line)||!source_id||!Array.isArray(allowed)||!allowed.includes(source_id))
      throw Error('invalid_history_source_choice');
    preferredByLine.set(line,source_id);
    safeWrite(line,source_id);
  }
  async function select(mode,options={}){
    const generation=store.selectReadingPeriod(mode,options),serial=++request;
    const selected=store.readingPeriod();
    const alive=()=>!disposed&&request===serial&&store.periodGeneration()===generation;
    store.updateAgent({period_read:{status:'loading',errors:[]}});changed();
    const errors=[],source_choices=[],unresolved=[];
    const results=await Promise.allSettled(LINE_IDS.map(async line=>{
      if(!history)return;
      let entries=(await history.list(line)).filter(e=>{
        const start=factoryWallMinute(e.period_start),end=factoryWallMinute(e.period_end);
        return start===selected.start&&end&&end>start&&(mode==='custom'?end===selected.end:end<=selected.end);
      }).sort(orderEntries);
      if(!alive())return;
      if(!entries.length){
        if(mode!=='today')store.clearHistoricalSnapshot?.(line,{generation});
        return;
      }
      const sources=[...new Set(entries.map(e=>e.source_id).filter(Boolean))];
      if(sources.length>1){
        const agent=store.agent(),scope=scopeKey(selected,line);
        const remembered=sourceOverrides.get(scope)||preferredSource(line);
        const agentSource=agent.status==='connected'?agent.capabilities?.source_id:null;
        const localHeads=agent.status==='connected'
          ? [...new Set(store.localCanonical().map(p=>p.source_id).filter(Boolean))]:[];
        const provenSource=agentSource||(localHeads.length===1?localHeads[0]:null);
         const previouslyOpened=store.read(line).snapshot?.canonical;
        // Same immutable period + line: keep an already validated source during
        // a read refresh even if browser preference storage is disabled. Never
        // infer a source from a different period or workstation.
        const retained=previouslyOpened&&matchesReadingPeriod(previouslyOpened,selected)&&
          sources.includes(previouslyOpened.source_id)?previouslyOpened.source_id:null;
        const resolution=resolveHistorySource(entries,{
          preferredSource:remembered,agentSource:provenSource,retainedSource:retained
        });
        const resolved=resolution.source_id;
        // Keep the picker available AFTER resolving. Never trap an operator in a source.
        const options=sources.map(source_id=>{
          const rows=entries.filter(e=>e.source_id===source_id);
          return {source_id,history_source:rows.some(e=>e.history_source==='local')?'local':'shared',
            collected_at:rows[0]?.collected_at||null,snapshot_id:rows[0]?.snapshot_id,
            snapshot_revision:rows[0]?.snapshot_revision};
        });
        source_choices.push({line_id:line,options,selected_source_id:resolved||null});
        if(!resolved){
          unresolved.push(line);
          if(mode!=='today')store.clearHistoricalSnapshot?.(line,{generation});
          return;
        }
        entries=entries.filter(e=>e.source_id===resolved);
      }
      for(const entry of entries){
        const payload=await history.open(entry);if(!alive())return;
        const materialized=entry.history_source==='local'&&entry.revision_pending===true&&
          entry.snapshot_revision==null&&Number.isSafeInteger(payload.snapshot_revision)&&payload.snapshot_revision>0;
        if(payload.line_id!==line||payload.source_id!==entry.source_id||
          String(payload.snapshot_id)!==String(entry.snapshot_id)||
          (!materialized&&payload.snapshot_revision!==entry.snapshot_revision))
          throw Error('historical_identity_mismatch:'+line);
        if(!matchesReadingPeriod(payload,selected))continue;
        if(mode==='today'&&store.read(line).snapshot)return;
        store.installHistoricalSnapshot(payload,{generation,source:entry.history_source==='local'?'local':'remote'});
        return;
      }
      if(mode!=='today')store.clearHistoricalSnapshot?.(line,{generation});
    }));
    if(!alive())return;
    results.forEach((r,i)=>{if(r.status==='rejected')errors.push({line_id:LINE_IDS[i],error:r.reason?.message||'history_unavailable'});});
    const loaded_lines=LINE_IDS.filter(line=>!!store.read(line).snapshot);
    source_choices.sort((a,b)=>LINE_IDS.indexOf(a.line_id)-LINE_IDS.indexOf(b.line_id));
    store.updateAgent({period_read:{status:errors.length||unresolved.length?'partial':'ready',
      errors,source_choices,loaded_lines,unresolved_lines:unresolved}});
    changed();
  }
  async function chooseSource(line,source_id){
    const period=store.readingPeriod();
    const choices=store.agent().period_read?.source_choices||[];
    const options=choices.find(c=>c.line_id===line)?.options||[];
    if(!period||!LINE_IDS.includes(line)||!options.some(o=>o.source_id===source_id))
      throw Error('invalid_history_source_choice');
    rememberSource(line,source_id,options.map(o=>o.source_id));
    sourceOverrides.set(scopeKey(period,line),source_id);
    return select(period.mode,period.mode==='custom'?{start:period.start,end:period.end}:{});
  }
  return {select,chooseSource,preferredSource,rememberSource,
    clear(){disposed=true;request++;sourceOverrides.clear();preferredByLine.clear();}};
}
