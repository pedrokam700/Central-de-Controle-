// Presentation of source observations only: no physical reuse classification,
// occurrence/repair join, clock inference, or MES access.
import {parseFailureInstant} from './production-evidence.mjs';
import {projectRepairTechnicianNames} from '../console-sn-repair-evidence.mjs';
const text=v=>String(v??'').trim();
const field=(r,...keys)=>keys.map(k=>r?.[k]).find(v=>v!==undefined&&v!==null&&text(v)!=='')??null;
const rawOf=r=>r?.raw?.raw||r?.raw||{};
const read=(r,...keys)=>field(r,...keys)??field(rawOf(r),...keys);
const operatorIds=['operator_id','Tran User Id','Tran User ID','Transaction User Id','Operator ID','Employee ID','User Id'];
const operatorNames=['operator_name','tran_user_name','Tran User','Tran User Name','Transaction User Name','Operator Name','Employee Name','User Name','Tran User Desc','User Full Name'];
const pcba=r=>text(read(r,'pcba_sn','PCBA','Lot Id','current_pcba_sn'));
const meta=r=>({source_id:field(r,'source_id')??r.provenance?.source_id??null,
 line_id:field(r,'line_id','line')??field(r.provenance,'line_id','line'),
 snapshot_id:r.snapshot_id??null,snapshot_revision:r.snapshot_revision??r.revision??null,
 period:r.period??r.provenance?.period??null,raw_ref:r.raw_ref??null});
const person=(r,role,idKeys,nameKeys)=>{
 const id=text(read(r,...idKeys)),name=text(read(r,...nameKeys));
 return id||name?{role,id:id||null,name:name&&name!==id?name:null}:null;
};
export function reuseHistoryIdentity(row={}){
 const source=row.source_view||row.source||'';
 // Content accompanies IDs: contradictory same-ID observations are retained,
 // rather than choosing a person's name or silently dropping a revision.
 return JSON.stringify([source,pcba(row),meta(row),
  row.record_id??null,row.event_id??null,row.row_key??null,row.defect_key??null,
  read(row,'hist_seq','Hist Seq','Defect Hist Seq'),
  read(row,'defect_code','Defect Code'),read(row,'defect_desc','Defect Description'),
  read(row,'defect_time','Defect Time'),read(row,'event_time','Tran Time'),read(row,'repair_time','Repair Time'),
  read(row,'defect_type','Defect Type'),read(row,'repair_status','Repair Status'),
  read(row,'defect_user','Defect User'),read(row,'defect_user_name','Defect User Name'),
  read(row,'repair_user','Repair User'),read(row,'repair_user_name','repair_technician_name','Repair User Name','repairUserName'),
  read(row,...operatorIds),read(row,...operatorNames),
  read(row,'station','operation_code','Working Oper Code'),row.operator_role??null,
  read(row,'repair_comment','Repair Comment'),row.actors??null,
  row.usage_status??null,row.bind_time_utc??null,row.unbind_time_utc??null,row.role??null]);
}
function processObservations(rows){
 return rows.flatMap(wrapper=>{
  const adapter=wrapper.provenance?.adapter||{};
  const entries=[wrapper,adapter.operator_evidence,...(adapter.operator_events||[])].filter(Boolean);
  const staff=entries.filter(e=>read(e,...operatorIds)||read(e,...operatorNames));
  return (staff.length?staff:[wrapper]).filter(entry=>{
   const a=meta(wrapper),b=meta(entry);
   return (!pcba(wrapper)||!pcba(entry)||pcba(wrapper)===pcba(entry))&&
    ['source_id','line_id'].every(k=>!a[k]||!b[k]||a[k]===b[k]);
  }).map(entry=>({
   ...wrapper,...entry,pcba_sn:pcba(entry)||pcba(wrapper),source_view:'3022',
   // A nested actor cannot erase explicit observation lineage or its event ID.
   ...Object.fromEntries(Object.entries(meta(wrapper)).map(([key,value])=>[key,value??meta(entry)[key]])),record_id:wrapper.record_id??entry.record_id,
   event_id:wrapper.event_id??entry.event_id,
   event_time:wrapper.event_time??read(entry,'event_time','Tran Time','Transaction Time','Event Time'),
   operator_id:read(entry,...operatorIds),operator_name:read(entry,...operatorNames),
   station:read(entry,'station','operation_code','Working Oper Code')??wrapper.station,
  }));
 });
}
export function buildReuseHistoryTimeline({failures=[],repairs=[],operators=[],bindings=[],pcbas=[]}={}){
 const boards=new Set((pcbas.length?pcbas:[...failures,...bindings,...repairs].map(pcba)).filter(Boolean));
 const process=processObservations(operators).filter(r=>boards.has(pcba(r)));
 const named=projectRepairTechnicianNames(repairs,operators);
 const input=[...failures,...named.map(r=>({...r,source_view:'3012'})),...process];
 // A physically linked board with no available history still needs an explicit
 // context row. It must not disappear or acquire a fabricated zero history.
 const represented=new Set(input.map(pcba));
 input.push(...bindings.filter(b=>!represented.has(pcba(b))).map(b=>({...b,source_view:'3074'})));
 const seen=new Set(),result=[];
 for(const row of input){
  const source_view=row.source_view||row.source;
  if(!['2114','3028','3012','3022','3074'].includes(source_view)||!boards.has(pcba(row)))continue;
  const actors=source_view==='3012'
   ?[person(row,'repair_user',['repair_user','Repair User'],['repair_technician_name','repair_user_name','Repair User Name'])]
   :source_view==='3022'
    ?[person(row,'process_operator',operatorIds,operatorNames)]
    :[person(row,'defect_author',['defect_user','Defect User'],['defect_user_name','Defect User Name'])];
  const event={...row,...meta(row),source_view,pcba_sn:pcba(row),actors:actors.filter(Boolean),
   hist_seq:read(row,'hist_seq','Hist Seq','Defect Hist Seq'),
   defect_code:read(row,'defect_code','Defect Code'),defect_desc:read(row,'defect_desc','Defect Description'),
   defect_type:read(row,'defect_type','Defect Type'),repair_status:read(row,'repair_status','Repair Status'),
   defect_time:read(row,'defect_time','Defect Time'),repair_time:read(row,'repair_time','Repair Time'),
   event_time:source_view==='3022'?read(row,'event_time','Tran Time'):null,
   repair_comment:read(row,'repair_comment','Repair Comment'),
   bindings:bindings.filter(b=>pcba(b)===pcba(row))};
  const key=reuseHistoryIdentity(event);if(seen.has(key))continue;seen.add(key);
  event.identity=key;
  // Keep all three clocks intact. Only choose a sort key, never fill a field.
  const clock=source_view==='3022'?event.event_time:source_view==='3074'?row.bind_time_utc||row.unbind_time_utc:event.defect_time;
  event.sort_at=parseFailureInstant(clock)??(source_view==='3012'?parseFailureInstant(event.repair_time):null);
  result.push(event);
 }
 const identities=new Map();
 for(const e of result)for(const a of e.actors){
  const key=JSON.stringify([e.source_view,e.pcba_sn,meta(e),e.record_id||e.event_id||e.row_key||e.hist_seq,
   e.defect_time,e.event_time,e.repair_time,a.role,a.id]);
  if(!identities.has(key))identities.set(key,[]);
  identities.get(key).push(a);
 }
 for(const actors of identities.values())if(new Set(actors.map(a=>a.name).filter(Boolean)).size>1)
  actors.forEach(a=>a.name_conflict=true);
 return result.sort((a,b)=>{
  if(a.sort_at!==null||b.sort_at!==null)return a.sort_at===null?1:b.sort_at===null?-1:a.sort_at-b.sort_at||secondary(a,b);
  return secondary(a,b);
 });
}
function secondary(a,b){
 // Hist Seq has meaning only inside the same source/board/observation scope.
 const scope=e=>{const {raw_ref,...rest}=meta(e);return JSON.stringify(rest);};
 if(a.source_view===b.source_view&&a.pcba_sn===b.pcba_sn&&scope(a)===scope(b)&&
    a.hist_seq!==null&&b.hist_seq!==null)return Number(a.hist_seq)-Number(b.hist_seq);
 return 0;
}
