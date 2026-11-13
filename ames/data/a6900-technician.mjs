// A defect analyst is identified by the board's own A6900 transaction, not
// by the 3012 Repair User (which can represent a later repair/export action).
// This is read-only evidence: no BRM directory guesses and no MES mutation.
const text=value=>String(value??'').trim();
const value=(row,...keys)=>keys.map(key=>row?.[key]).find(item=>item!==undefined&&item!==null&&text(item)!=='')??null;
const boardOf=row=>text(value(row,'pcba_sn','PCBA','PCBA Consultada','Lot Id','current_pcba_sn'));
const stationOf=row=>text(value(row,'station','operation_code','Working Oper Code','Station Code','Station'));
const idOf=row=>text(value(row,'operator_id','Tran User Id','Tran User ID','Transaction User Id','Operator ID'));
const nameOf=row=>text(value(row,'operator_name','Tran User Name','Tran User','Transaction User Name','Operator Name'));

// Raw 3022 Tran Time and 3012 Defect/Repair Time are factory wall clocks.
// Do not compare a converted process-timeline UTC instant against an
// unconverted factory-local 3012 instant: the two adapters differ.
function factoryClock(raw){
 const match=/^(\d{4}-\d\d-\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/.exec(text(raw));
 if(!match)return null;
 const instant=Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]||'00'}Z`);
 return Number.isFinite(instant)?instant:null;
}
function expandedEvents(events=[]){
 return (events||[]).flatMap(item=>{
  const adapter=item?.provenance?.adapter||{};
  const candidates=[item,adapter.operator_evidence,...(adapter.operator_events||[])].filter(entry=>entry&&typeof entry==='object');
  return candidates.map(entry=>{
   const raw=entry.raw&&typeof entry.raw==='object'?entry.raw:item.raw&&typeof item.raw==='object'?item.raw:{};
   return {
    pcba_sn:boardOf(entry)||boardOf(raw)||boardOf(item),
    station:stationOf(raw)||stationOf(entry)||stationOf(item),
    operator_id:idOf(raw)||idOf(entry),operator_name:nameOf(raw)||nameOf(entry),
    event_time:value(raw,'Tran Time','Transaction Time','Event Time')||value(entry,'event_time','Tran Time')||value(item,'event_time'),
   };
  });
 });
}

function sn3022Events(result={},currentPcba=''){
 const trace=result.trace_3022||{},board=text(currentPcba||result.sn||result.query_sn);
 // Trace tables without a PCBA belong only to the directly queried board.
 // Local historical rows must already carry their own explicit PCBA identity.
 const live=[...(trace.operator_evidence||[]),...(trace.process_passages||[]),...(trace.rows||[]),
  ...(trace.pcbas||[]).flatMap(entry=>(entry?.result?.rows||[]).map(row=>({
   ...row,pcba_sn:boardOf(row)||entry.pcba_sn})))];
 const local=(result.local_snapshot?.process_events||[]).filter(row=>boardOf(row));
 return [...live.map(row=>boardOf(row)?row:{...row,pcba_sn:board}),...local];
}

/** Explicitly observed A6900 staff on this PCBA; no repair/2114 attribution. */
export function a6900ObservedForSn(result={},currentPcba=''){
 const board=text(currentPcba||result.sn||result.query_sn),seen=new Map();
 if(!board)return [];
 for(const e of expandedEvents(sn3022Events(result,board))){
  if(e.pcba_sn!==board||e.station.toUpperCase()!=='A6900'||
    !e.operator_id||!e.operator_name||!factoryClock(e.event_time)||
    e.operator_id.toUpperCase()===e.operator_name.toUpperCase())continue;
  const name=e.operator_name.normalize('NFKC').replace(/\s+/g,' ').trim();
  const key=JSON.stringify([factoryClock(e.event_time),e.operator_id.toUpperCase(),name.toLocaleUpperCase('pt-BR')]);
  if(!seen.has(key))seen.set(key,{id:e.operator_id,name,station:'A6900',event_time:e.event_time});
 }
 return [...seen.values()].sort((a,b)=>factoryClock(b.event_time)-factoryClock(a.event_time));
}

/** Return the one evidenced A6900 operator associated with a 3012 defect.
 * The date window makes attribution to an old/different repair fail closed.
 * Multiple distinct operators in the window are deliberately ambiguous.
 */
export function a6900TechnicianFor(repair={},events=[]){
 const board=boardOf(repair),start=factoryClock(value(repair,'defect_time','Defect Time')),
  finish=factoryClock(value(repair,'repair_time','Repair Time'));
 if(!board||start===null||finish!==null&&finish<start)return null;
 // A record with no repair clock is limited to roughly the defect day. It is
 // only useful if that period has a single unequivocal A6900 operator.
 const upper=finish??start+24*60*60*1000;
 const eligible=expandedEvents(events).filter(e=>{
  const at=factoryClock(e.event_time);
  return e.pcba_sn===board&&e.station.toUpperCase()==='A6900'&&at!==null&&
   e.operator_id&&e.operator_name&&
   e.operator_id.toUpperCase()!==e.operator_name.toUpperCase();
 });
 const matching=eligible.filter(e=>{
  const at=factoryClock(e.event_time);
  return at>=start-5*60*1000&&at<=upper+2*60*60*1000;
 });
 const identities=new Map();
 for(const e of matching){
  const name=e.operator_name.normalize('NFKC').replace(/\s+/g,' ').trim();
  identities.set(`${e.operator_id.toUpperCase()}|${name.toLocaleUpperCase('pt-BR')}`,{name,id:e.operator_id,station:'A6900'});
 }
 if(identities.size===1)return [...identities.values()][0];
 if(identities.size>1)return null;
 // Observed in factory screenshots: 3012 Repair Time can be ~1 hour ahead
 // of the same board's A6900 Tran Time. This is NOT an exact event-to-repair
 // link. Surface a qualified candidate only if the exact Repair User ID also
 // appears at A6900 and no other operator occupies that nearby window.
 const repairUser=text(value(repair,'repair_user','Repair User'));
 if(!finish||!repairUser)return null;
 const nearby=eligible.filter(e=>{
  const at=factoryClock(e.event_time);
  return at>=finish-90*60*1000&&at<=finish+5*60*1000;
 });
 const unique=new Map();
 for(const e of nearby){
  const name=e.operator_name.normalize('NFKC').replace(/\s+/g,' ').trim();
  unique.set(`${e.operator_id.toUpperCase()}|${name.toLocaleUpperCase('pt-BR')}`,e);
 }
 if(unique.size!==1)return null;
 const candidate=[...unique.values()][0];
 if(candidate.operator_id.toUpperCase()!==repairUser.toUpperCase())return null;
 return {name:candidate.operator_name.normalize('NFKC').replace(/\s+/g,' ').trim(),
  id:candidate.operator_id,station:'A6900',confidence:'nearby_repair_clock',event_time:candidate.event_time};
}

export function a6900ForSnRepair(repair={},result={},currentPcba=''){
 const current=text(currentPcba||result.sn||result.query_sn);
 return a6900TechnicianFor(repair,sn3022Events(result,current));
}
