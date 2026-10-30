import {LINE_IDS} from './data/contract.mjs';
import {factoryWallMinute} from './data/history.mjs';
import {matchesReadingPeriod,matchesSavedTodayCapture} from './data/reading-period.mjs';
import {resolveHistorySource} from './data/history-source-choice.mjs';

// History is read-only. Selection is per line and source, never a global MES job.
// Unscoped v1 keys are intentionally neither read nor migrated: they cannot
// prove that the currently authenticated person made that source choice.
const PREF_PREFIX='ames-history-source-preference-v2:';
const safeRead=(line,scope)=>{
  if(!scope)return null;
  try{return globalThis.localStorage?.getItem(PREF_PREFIX+JSON.stringify([scope,line]))||null;}catch{return null;}
};
const safeWrite=(line,value,scope)=>{
  if(!scope)return;
  try{globalThis.localStorage?.setItem(PREF_PREFIX+JSON.stringify([scope,line]),value);}catch{}
};
const orderEntries=(a,b)=>{
  const clock=x=>Number.isFinite(Date.parse(x?.collected_at))?Date.parse(x.collected_at):0;
  const later=clock(b)-clock(a);
  if(later)return later;
  // A pending local row is a newer SQLite source epoch, not revision zero.
  // Make this a total ordering (not a pair-specific comparator) so sorting
  // stays deterministic even when other workstations share the same clock.
  const pending=e=>e.history_source==='local'&&e.revision_pending===true?1:0;
  return pending(b)-pending(a)||Number(b.snapshot_revision||0)-Number(a.snapshot_revision||0)||
    String(b.snapshot_id||'').localeCompare(String(a.snapshot_id||''));
};

export function createReadingPeriodController(store,history,{changed=()=>{},preferenceScope=null}={}){
  let request=0,disposed=false;
  const sourceOverrides=new Map(),preferredByLine=new Map();
  const scopeKey=(period,line)=>JSON.stringify([period.mode,period.start,period.end,line]);
  const authenticatedScope=()=>{
    try{const value=typeof preferenceScope==='function'?preferenceScope():preferenceScope;
      return typeof value==='string'&&value.trim()?value:null;}catch{return null;}
  };
  const sessionKey=()=>JSON.stringify([store.sessionGeneration?.()??0,authenticatedScope()]);
  let activeSession=sessionKey();
  function reconcileSession(){
    const next=sessionKey();
    if(next!==activeSession){request++;sourceOverrides.clear();preferredByLine.clear();activeSession=next;}
  }
  const preferredSource=line=>{reconcileSession();return preferredByLine.get(line)||safeRead(line,authenticatedScope());};
  function rememberSource(line,source_id,allowed){
    if(disposed)throw Error('reading_controller_disposed');
    reconcileSession();
    if(!LINE_IDS.includes(line)||!source_id||!Array.isArray(allowed)||!allowed.includes(source_id))
      throw Error('invalid_history_source_choice');
    preferredByLine.set(line,source_id);
    safeWrite(line,source_id,authenticatedScope());
  }
  async function select(mode,options={}){
    if(disposed)throw Error('reading_controller_disposed');
    reconcileSession();const selectedSession=activeSession;
    const collectionReceipt=options.collectionReceipt||null;
    const traceReceipt=options.traceReceipt||null;
    const generation=store.selectReadingPeriod(mode,options),serial=++request;
    const selected=store.readingPeriod();
    const alive=()=>!disposed&&request===serial&&store.periodGeneration()===generation&&sessionKey()===selectedSession;
    store.updateAgent({period_read:{status:'loading',errors:[]}});changed();
    const errors=[],source_choices=[],unresolved=[],recovered=[];
    const results=await Promise.allSettled(LINE_IDS.map(async line=>{
      if(!history)return;
      let entries=(await history.list(line)).filter(e=>{
        const start=factoryWallMinute(e.period_start),end=factoryWallMinute(e.period_end);
        return start===selected.start&&end&&end>start&&(mode==='custom'?end===selected.end:end<=selected.end);
      }).sort(orderEntries);
      if(!alive())return;
      const collectedId=collectionReceipt?.snapshot_ids?.[line];
      const expectCollectedLocal=collectedId&&
        factoryWallMinute(collectionReceipt.period_start)===selected.start&&
        factoryWallMinute(collectionReceipt.period_end)===selected.end;
      if(!entries.length){
        store.clearHistoricalSnapshot?.(line,{generation});
        if(expectCollectedLocal)throw Error('Coleta local concluída, mas a nova revisão '+collectedId+' não aparece no histórico deste período; a tela não foi atualizada');
        return;
      }
      // After a completed, operator-triggered 3028 run, use the exact new
      // LOCAL snapshot for this same line/period. A previous browser choice
      // for another workstation must not pin an old shared revision after
      // this workstation has just collected fresh evidence. Never infer a
      // source solely from a remote index or a job completion flag.
      const agent=store.agent(),agentSource=agent.status==='connected'?agent.capabilities?.source_id:null;
      // A completed MES job can leave the latest SQLite source epoch pending
      // canonical materialization. History also lists older numbered exports
      // (for example r22), which sort ahead of a pending/null revision. Only
      // for the exact authenticated job snapshot, read the pending local row
      // first so history.open can export r23. If it fails, the usual degraded
      // recovery path still preserves the old immutable revision as history.
      const matchingJobLocal=id=>entries.filter(e=>e.history_source==='local'&&
        e.source_id===agentSource&&String(e.snapshot_id)===String(id))
        .sort((a,b)=>Number(b.revision_pending===true)-Number(a.revision_pending===true)||
          Number(b.snapshot_revision||0)-Number(a.snapshot_revision||0))[0]||null;
      const verifiedCollection=expectCollectedLocal&&agentSource
        ?matchingJobLocal(collectedId):null;
      // Unlike a new 3028 run, deep trace adds 3074/2114/3022 evidence to
      // an existing exact local snapshot. Its ID is valid only when the
      // period-filtered local index and connected agent agree; a trace from
      // another day/line/source must never retarget this reading.
      const tracedId=traceReceipt?.snapshot_ids?.[line];
      const verifiedTrace=tracedId&&agentSource
        ?matchingJobLocal(tracedId):null;
      const verifiedRefresh=verifiedCollection||verifiedTrace;
      if(expectCollectedLocal&&!verifiedCollection){
        store.clearHistoricalSnapshot?.(line,{generation});
        throw Error('Coleta local concluída, mas a revisão '+collectedId+' não foi comprovada no agente deste PC; exibida como pendência, não como atualização');
      }
      const sources=[...new Set(entries.map(e=>e.source_id).filter(Boolean))];
      if(sources.length>1){
        const scope=scopeKey(selected,line);
        const remembered=sourceOverrides.get(scope)||preferredSource(line);
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
        const resolved=verifiedRefresh?.source_id||resolution.source_id;
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
          store.clearHistoricalSnapshot?.(line,{generation});
          return;
        }
        entries=entries.filter(e=>e.source_id===resolved);
      }
      if(verifiedRefresh){
        // If the source is also on Firebase, the remote row can have the same
        // timestamp. Read the proven on-machine snapshot requested by this
        // job first, without deleting or rewriting any historical revision.
        entries=[verifiedRefresh,...entries.filter(e=>e!==verifiedRefresh)];
      }
      let unreadable=0,lastFailure=null;
      for(const entry of entries){
        try{
          const payload=await history.open(entry);if(!alive())return;
          const materialized=entry.history_source==='local'&&entry.revision_pending===true&&
            entry.snapshot_revision==null&&Number.isSafeInteger(payload.snapshot_revision)&&payload.snapshot_revision>0;
          if(payload.line_id!==line||payload.source_id!==entry.source_id||
            String(payload.snapshot_id)!==String(entry.snapshot_id)||
            (!materialized&&payload.snapshot_revision!==entry.snapshot_revision))
            throw Error('historical_identity_mismatch:'+line);
          const exact=matchesReadingPeriod(payload,selected);
          const savedSameDay=mode==='today'&&matchesSavedTodayCapture(payload,selected);
          // The immutable payload must match the period advertised by its
          // index. Never silently skip a mismatched newest record and label
          // an older one as the latest verified historical reading.
          if(!exact&&!savedSameDay)throw Error('historical_period_mismatch:'+line);
          // A live snapshot takes precedence over any saved read. Saved same-day
          // partial observations remain read-only with their exact scope.
          if(mode==='today'&&store.read(line).snapshot&&!store.read(line).saved_today)return;
          store.installHistoricalSnapshot(payload,{generation,source:entry.history_source==='local'?'local':'remote'});
          if(verifiedRefresh===entry){
            // Keep this deliberate collection visible across Refresh reading
            // and page reload. A human can still choose the other source.
            rememberSource(line,entry.source_id,sources);
            sourceOverrides.set(scopeKey(selected,line),entry.source_id);
          }
          // A missing/corrupt newer revision cannot make an older immutable
          // revision disappear. Never claim it is the latest FULL or current
          // MES state: surface the degraded read with its exact identity.
          if(unreadable)recovered.push({line_id:line,unreadable_revisions:unreadable,
            source_id:entry.source_id,snapshot_id:payload.snapshot_id,
            snapshot_revision:payload.snapshot_revision});
          return;
        }catch(error){
          if(!alive())return;
          unreadable++;lastFailure=error;
        }
      }
      if(unreadable)throw lastFailure||Error('history_unavailable:'+line);
      store.clearHistoricalSnapshot?.(line,{generation});
    }));
    if(!alive())return;
    results.forEach((r,i)=>{if(r.status==='rejected')errors.push({line_id:LINE_IDS[i],error:r.reason?.message||'history_unavailable'});});
    const loaded_lines=LINE_IDS.filter(line=>!!store.read(line).snapshot);
    source_choices.sort((a,b)=>LINE_IDS.indexOf(a.line_id)-LINE_IDS.indexOf(b.line_id));
    store.updateAgent({period_read:{status:errors.length||unresolved.length||recovered.length?'partial':'ready',
      errors,source_choices,loaded_lines,unresolved_lines:unresolved,recovered_lines:recovered}});
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
