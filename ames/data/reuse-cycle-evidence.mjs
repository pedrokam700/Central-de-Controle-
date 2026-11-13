import {parseFailureInstant} from './production-evidence.mjs';

const boardId=row=>String(row?.pcba_sn||row?.PCBA||row?.current_pcba_sn||'').trim();
const analysisType=row=>String(row?.defect_type||row?.['Defect Type']||'').toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ');
const dismantled=row=>/main\s*board|phone\s*disassembly/.test(analysisType(row));
const at=row=>parseFailureInstant(row?.defect_time||row?.['Defect Time']);
const processAt=row=>parseFailureInstant(row?.event_time||row?.event_time_utc||row?.production_event_time);
const productionStation=row=>{
 const station=String(row?.station||row?.operation_code||row?.station_code||'').trim().toUpperCase();
 const match=/^A(\d{4})$/.exec(station);
 return Boolean(match&&Number(match[1])>=5100&&Number(match[1])<=5162);
};
const eventCode=row=>String(row?.defect_code||row?.['Defect Code']||'').trim().toUpperCase();
const completedDisassembly=row=>dismantled(row)&&
 ['Y','YES','TRUE','1'].includes(String(row?.repair_status||row?.['Repair Status']||'').trim().toUpperCase());

/** A bounded, source-auditable lower bound on board reassembly cycles.
 * One 2114 dismantling followed by one later real 3022 production passage
 * proves a return, not merely a second defect or a repeated Hist Seq.
 * Many 3022 stations after one dismantling count as ONE reassembly.
 * Incomplete history can undercount cycles, so this is a conservative bound,
 * not a population-completeness statement or a substitute for 3074.
 */
export function processBackedBoardReuses(board,occurrence,history=[],events=[]){
 const id=String(board||'').trim(),end=at(occurrence);
 if(!id||end===null)return {minimum_uses:null,returns:[],basis:'UNAVAILABLE'};
 const dismantlings=history.filter(row=>boardId(row)===id&&dismantled(row))
  .map(row=>({row,time:at(row)})).filter(x=>x.time!==null&&x.time<end)
  .sort((a,b)=>a.time-b.time);
 const production=events.filter(row=>boardId(row)===id&&row?.valid!==false&&productionStation(row))
  .map(row=>({row,time:processAt(row)})).filter(x=>x.time!==null&&x.time<end)
  .sort((a,b)=>a.time-b.time);
 const returns=[];let lastReturn=-Infinity;
 for(const pass of production){
  const preceding=dismantlings.filter(x=>x.time>lastReturn&&x.time<pass.time).at(-1);
  if(!preceding)continue;
  returns.push({dismantle_time:preceding.row.defect_time||preceding.row['Defect Time'],
   dismantle_type:preceding.row.defect_type||preceding.row['Defect Type'],
   production_time:pass.row.event_time||pass.row.event_time_utc||pass.row.production_event_time,
   production_station:pass.row.station||pass.row.operation_code||pass.row.station_code});
  lastReturn=pass.time;
 }
 return {minimum_uses:returns.length?returns.length+1:null,returns,
  basis:returns.length?'2114_DISASSEMBLY_THEN_3022_PRODUCTION':'UNAVAILABLE'};
}

/** Recover an earlier, fully time-ordered repair/production RETURN recorded by
 * R11's 3022 correlation, even when the 2114 grid does not expose a clock.
 * The prior 3028 fault must have its OWN 3022 repair + subsequent assembly;
 * a 2114 completed board/phone dismantling with that fault is also required.
 * Never use the current fault's repair (which happens after its detection).
 * Every independent repair-return cycle raises only a minimum use bound.
 */
export function contextBackedBoardReuses(board,occurrence,history=[],contexts=[]){
 const id=String(board||'').trim(),end=at(occurrence);
 if(!id||end===null)return {minimum_uses:null,returns:[],basis:'UNAVAILABLE'};
 const candidates=[];
 for(const ctx of contexts){
  if(boardId(ctx)!==id||String(ctx?.source||'3022')!=='3022')continue;
  const oldFault=at(ctx),repair=parseFailureInstant(ctx?.repair_event_time);
  const production=parseFailureInstant(ctx?.return_event_time);
  if(oldFault===null||repair===null||production===null||!(oldFault<repair&&repair<production&&production<end))continue;
  if(!productionStation({station:ctx?.return_station_code}))continue;
  if(String(ctx?.repair_class||'').toUpperCase()==='PHONE_BAT_COVER')continue;
  const matchingHistory=history.filter(row=>boardId(row)===id&&eventCode(row)&&eventCode(row)===eventCode(ctx)&&completedDisassembly(row)&&
   (at(row)===null||at(row)<production));
  if(!matchingHistory.length)continue;
  candidates.push({dismantle_type:matchingHistory[0].defect_type||matchingHistory[0]['Defect Type'],
   prior_defect_code:eventCode(ctx),prior_defect_time:ctx.defect_time,
   repair_time:ctx.repair_event_time,production_time:ctx.return_event_time,
   production_station:ctx.return_station_code,source_view:'3022',defect_key:ctx.defect_key||null});
 }
 candidates.sort((a,b)=>parseFailureInstant(a.production_time)-parseFailureInstant(b.production_time));
 const returns=[];let lastReturn=-Infinity;
 for(const candidate of candidates){
  // Several 3022 contexts can describe the very same real repair cycle.
  // Distinct reassemblies must start after the preceding proven return.
  const start=parseFailureInstant(candidate.prior_defect_time);
  if(start<=lastReturn)continue;
  returns.push(candidate);lastReturn=parseFailureInstant(candidate.production_time);
 }
 return {minimum_uses:returns.length?returns.length+1:null,returns,
  basis:returns.length?'2114_AND_3022_REPAIR_RETURN':'UNAVAILABLE'};
}
