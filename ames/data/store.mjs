import { immutable, instant, normalizeLegacySnapshot, productKey, requireLine, LINE_IDS } from './contract.mjs';
import { normalizeAgentRead } from './agent-contract.mjs';
import {normalizeCanonical,CANONICAL_SCHEMA} from './canonical.mjs';
import {readingPeriod, matchesReadingPeriod} from './reading-period.mjs';
import {SOURCE_STATE} from './source-provenance.mjs';

const EMPTY_CONTEXT=Object.freeze({line_id:null,lines:[],period:null,product:null,shift:null,defect:null});
const clean=value=>value===null||value===undefined||value===''?null:String(value);
const cleanPeriod=value=>{
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='object'&&!Array.isArray(value)){
    const from=clean(value.from),to=clean(value.to);
    return from||to?{from,to}:null;
  }
  return clean(value);
};

// One store belongs to one Central session. Transport/auth stay in the shell.
export function createAmesStore({ now = Date.now, maxAgeMs = 120000 } = {}) {
  let local = new Map();
  let remote = new Map();
  let synced = new Map();
  let localConnected = false;
  let issues = [];
  let agent = immutable({status:'disconnected',config:null,job:null,error:''});
  let context = immutable({...EMPTY_CONTEXT});
  let contextRevision=0;
  let contextLineExplicit=false;
  let selectedPeriod=null, periodGeneration=0;
  let historical=new Map();

  function normalizeBatch(payloads, localRead = false) {
    const next = new Map();
    const seen = new Set();
    const errors = [];
    for (const payload of payloads) {
      try {
        const snapshot = localRead && payload?.schema===CANONICAL_SCHEMA ? normalizeCanonical(payload) : localRead && payload?.schema === 'central-agent-read-v1' ? normalizeAgentRead(payload) : normalizeLegacySnapshot(payload);
        if (seen.has(snapshot.line_id)) {
          next.delete(snapshot.line_id);
          errors.push({ line_id: snapshot.line_id, reason: 'ambiguous_snapshots_for_line' });
        } else {
          seen.add(snapshot.line_id);
          next.set(snapshot.line_id, snapshot);
        }
      } catch (error) {
        errors.push({ reason: error.message });
      }
    }
    return { next, errors };
  }

  function readLine(line){
    requireLine(line);
    const saved=selectedPeriod&&selectedPeriod.mode!=='today'?historical.get(JSON.stringify([selectedPeriod,line])):null;
    const eligible=s=>s&&matchesReadingPeriod(s.canonical||s,selectedPeriod)?s:null;
    const snapshot = saved?.snapshot || (localConnected && eligible(local.get(line))) || eligible(synced.get(line)) || eligible(remote.get(line)) || eligible(local.get(line)) || null;
    const source = !snapshot ? 'none' : saved? (saved.source==='local'&&!localConnected?'local_cache':saved.source) : snapshot === local.get(line) ? (localConnected ? 'local' : 'local_cache') : 'remote';
    const source_state=!snapshot?SOURCE_STATE.NOT_COLLECTED:source==='local_cache'?SOURCE_STATE.CACHED:SOURCE_STATE.OK;
    const collected = instant(snapshot?.collected_at);
    const age = collected === null ? null : now() - collected;
    return immutable({
      source, source_state, snapshot, reading_period:selectedPeriod, local_connected: localConnected,
      age_ms: age,
      freshness: age === null || age < 0 ? 'unknown' : age > maxAgeMs || source === 'local_cache' ? 'stale' : 'fresh'
    });
  }

  function loadedLines(){return LINE_IDS.filter(line=>readLine(line).snapshot);}
  function firstLoadedLine(){return loadedLines()[0]||LINE_IDS[0];}
  function setContext(next){
    const before=JSON.stringify(context),after=JSON.stringify(next);
    context=immutable(next);
    if(before!==after)contextRevision+=1;
    return context;
  }
  function ensureContextLine(){
    const loaded=loadedLines();
    if(context.line_id&&LINE_IDS.includes(context.line_id)){
      // A human/explicit selection is operational intent, not a cache hint. Keep it
      // even while that line has no current snapshot; the UI must show Not collected
      // instead of silently jumping to a different line when data refreshes.
      if(contextLineExplicit)return context.line_id;
      if(!loaded.length||loaded.includes(context.line_id))return context.line_id;
    }
    const line=loaded[0]||context.line_id||LINE_IDS[0];
    if(loaded.length&&(context.line_id!==line||context.lines.length!==1||context.lines[0]!==line))setContext({...context,line_id:line,lines:[line]});
    return line;
  }

  return Object.freeze({
    replaceRemoteDocuments(documents) {
      const payloads = [];
      const errors = [];
      for (const document of documents) {
        if (document?.kind !== 'ames_shared_snapshot') continue;
        if (!document.payload || document.line !== document.payload.line || document.schema !== document.payload.schema) {
          errors.push({ reason: 'remote_envelope_mismatch' });
          continue;
        }
        payloads.push(document.payload);
      }
      const result = normalizeBatch(payloads);
      remote = result.next; // Full replacement also removes revoked/deleted docs.
      issues = immutable([...errors, ...result.errors]);
      if(remote.size)ensureContextLine();
      return issues;
    },
    replaceLocalSnapshots(payloads) {
      const result = normalizeBatch(payloads, true);
      for(const [line,next] of result.next){const old=local.get(line);if(next.canonical&&old?.source_id===next.source_id&&old?.snapshot_id===next.snapshot_id&&old?.revision===next.revision&&old?.content_hash===next.content_hash)result.next.set(line,old);}
      local = result.next;
      if(local.size)ensureContextLine();
      return immutable(result.errors);
    },
    setLocalConnected(value) { localConnected = value === true; },
    replaceSyncedSnapshots(payloads){const result=normalizeBatch(payloads,true);synced=result.next;if(synced.size)ensureContextLine();return immutable(result.errors);},
    localCanonical(){return [...local.values()].map(s=>s.canonical).filter(Boolean);},
    agent() { return agent; },
    updateAgent(patch) { agent = immutable({...agent,...patch}); },
    readingPeriod(){return selectedPeriod;},
    periodGeneration(){return periodGeneration;},
    selectReadingPeriod(mode,options={}){
      const next=immutable(readingPeriod(mode,{...options,now:options.now||new Date(now()),config:agent.config||{}}));
      if(JSON.stringify(next)!==JSON.stringify(selectedPeriod)){
        selectedPeriod=next;periodGeneration++;contextRevision++;
        // Date filters from a different read period must not hide the selected revision.
        context=immutable({...context,period:null});
      }
      return periodGeneration;
    },
    installHistoricalSnapshot(payload,{source='remote',generation=periodGeneration}={}){
      if(generation!==periodGeneration||!selectedPeriod)return false;
      const snapshot=normalizeCanonical(payload);
      if(!matchesReadingPeriod(payload,selectedPeriod))throw Error('historical_period_mismatch');
      if(!['local','local_cache','remote'].includes(source))throw Error('invalid_history_source');
      historical.set(JSON.stringify([selectedPeriod,snapshot.line_id]),{snapshot,source});
      contextRevision++;
      return true;
    },
    context(){return context;},
    contextRevision(){return contextRevision;},
    preferredLine(){return ensureContextLine();},
    updateContext(patch={}){
      const next={...context};
      if(Object.prototype.hasOwnProperty.call(patch,'line_id')){
        const line=clean(patch.line_id);
        if(line!==null&&!LINE_IDS.includes(line))throw Error('invalid_operational_line');
        next.line_id=line;
        next.lines=line?[line]:[];
        contextLineExplicit=line!==null;
      }
      if(Object.prototype.hasOwnProperty.call(patch,'lines')){
        const lines=[...new Set((patch.lines||[]).map(clean).filter(Boolean))];
        if(lines.some(line=>!LINE_IDS.includes(line)))throw Error('invalid_operational_lines');
        next.lines=lines;
        if(lines.length===1){next.line_id=lines[0];contextLineExplicit=true;}
        else if(!lines.length){next.line_id=null;contextLineExplicit=false;}
      }
      if(Object.prototype.hasOwnProperty.call(patch,'period'))next.period=cleanPeriod(patch.period);
      for(const key of ['product','shift','defect'])if(Object.prototype.hasOwnProperty.call(patch,key))next[key]=clean(patch[key]);
      return setContext(next);
    },
    read(line) { return readLine(line); },
    occurrences({ line_id, product, defect_code, pcba_sn } = {}) {
      const { snapshot } = readLine(line_id);
      const key = product === undefined ? null : productKey(product);
      const rows = (snapshot?.occurrences || []).filter(row =>
        (key === null || (key !== '' && row.product_key === key)) &&
        (defect_code === undefined || row.defect_code === defect_code) &&
        (pcba_sn === undefined || row.pcba_sn === pcba_sn));
      return immutable({
        rows,
        coverage: snapshot?.coverage || { status: 'unavailable', exact_metric_drilldown: false },
        snapshot_id: snapshot?.snapshot_id || null
      });
    },
    diagnostics() { return issues; },
    clear() {
      local = new Map(); remote = new Map(); synced = new Map(); localConnected = false; issues = [];
      agent = immutable({status:'disconnected',config:null,job:null,error:''});
      context = immutable({...EMPTY_CONTEXT});contextLineExplicit=false;contextRevision+=1;
      selectedPeriod=null;historical=new Map();periodGeneration++;
    }
  });
}

export function clearSessionData(state) {
  state.ames.clear();
  for (const key of Object.keys(state)) if (Array.isArray(state[key])) state[key] = [];
}
