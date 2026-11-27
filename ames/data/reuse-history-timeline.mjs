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
 const observations=rows.flatMap(wrapper=>{
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
   hist_seq:read(wrapper,'hist_seq','Hist Seq')??adapter.hist_seq??read(entry,'hist_seq','Hist Seq'),
   event_time:wrapper.event_time??read(entry,'event_time','Tran Time','Transaction Time','Event Time'),
   operator_id:read(entry,...operatorIds),operator_name:read(entry,...operatorNames),
   station:read(entry,'operation_code','Working Oper Code','station')??wrapper.station,
   station_id:read(entry,'station')??wrapper.station,
  }));
 });
 // /local/sn can return the SAME durable event_id without the canonical
 // transport's record_id/revision. Coalesce only that explicit event identity
 // and compatible facts; never use a PCBA/code/time heuristic for this.
 const result=[],byId=new Map();
 const compatible=(a,b)=>{
  const left=meta(a),right=meta(b);
  const identityValue=(key,value)=>['snapshot_id','snapshot_revision'].includes(key)?String(value):JSON.stringify(value);
  if(Object.keys(left).some(k=>left[k]!==null&&right[k]!==null&&identityValue(k,left[k])!==identityValue(k,right[k])))return false;
  const [short,long]=[text(a.station),text(b.station)].sort((x,y)=>x.length-y.length);
  const line=left.line_id||right.line_id;
  if(short&&short!==long&&!(line&&/^A[0-9]{4}$/.test(short)&&long.startsWith(line+short)&&/^\d+$/.test(long.slice((line+short).length))))return false;
  return ['record_id','hist_seq','operator_id','operator_name','operator_role','event_time'].every(k=>
   !text(a[k])||!text(b[k])||text(a[k])===text(b[k]));
 };
 for(const row of observations){
  const durable=row.event_id||row.raw_ref;
  const key=durable?JSON.stringify([pcba(row),durable]):null;
  const previous=key?(byId.get(key)||[]).find(old=>compatible(old,row)):null;
  if(previous){
   for(const [k,v] of Object.entries(row))if(previous[k]===undefined||previous[k]===null||previous[k]==='')previous[k]=v;
   continue;
  }
  result.push(row);
  if(key){if(!byId.has(key))byId.set(key,[]);byId.get(key).push(row);}
 }
 return result;
}
// Snapshot and local cache project different subsets of the same durable 3012 row.
function mergeRepairCopies(rows){
 const buckets=new Map(),unkeyed=[];
 const fields=['record_id','repair_technician_id','repair_user_name','defect_user_name','reason_code','repair_status','defect_code','defect_desc','defect_time','repair_time','repair_code','repair_desc',
  'repair_user','repair_technician_name','repair_comment','defect_user','hist_seq','repaired_location','reason_desc'];
 for(const row of rows){
  if(!row.row_key){unkeyed.push(row);continue;}
  const key=JSON.stringify([pcba(row),row.row_key]);
  if(!buckets.has(key))buckets.set(key,[]);
  buckets.get(key).push(row);
 }
 const result=[...unkeyed];
 for(const copies of buckets.values()){
  const merged=[];
  // Start with the best identified revisions. An unscoped copy that could
  // belong to two contradictory revisions must not bridge them.
  const rank=r=>Object.values(meta(r)).filter(v=>v!=null).length;
  for(const row of copies.sort((a,b)=>rank(b)-rank(a))){
   const values=r=>({...meta(r),...Object.fromEntries(fields.map(k=>[k,r[k]]))});
   const current=values(row);
   const matches=merged.filter(old=>Object.entries(values(old)).every(([k,v])=>
    v==null||v===''||current[k]==null||current[k]===''||
    (typeof v==='object'?JSON.stringify(v)===JSON.stringify(current[k]):text(v)===text(current[k]))));
   if(matches.length!==1){merged.push({...row,...meta(row)});continue;}
   const target=matches[0];
   for(const [k,v] of Object.entries({...row,...meta(row)}))if(target[k]==null||target[k]==='')target[k]=v;
  }
  result.push(...merged);
 }
 return result;
}
export function buildReuseHistoryTimeline({failures=[],repairs=[],operators=[],bindings=[],pcbas=[]}={}){
 const boards=new Set((pcbas.length?pcbas:[...failures,...bindings,...repairs].map(pcba)).filter(Boolean));
 const process=processObservations(operators).filter(r=>boards.has(pcba(r)));
 const named=mergeRepairCopies(projectRepairTechnicianNames(repairs.filter(r=>boards.has(pcba(r))),operators));
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
