import {factoryWallMinute} from './history.mjs';

const VIEWS=Object.freeze(['3028','3074','2114','3022']);
const DAILY_MODES=new Set(['today','live','monitor_today','previous_day','historical_refresh']);
const sourceRows=payload=>payload?.source_coverage||payload?.canonical?.source_coverage||null;

export function fullDayClosureEvidence(payload={}){
  const identity={line_id:payload.line_id||null,source_id:payload.source_id||null,
    snapshot_id:payload.snapshot_id??null,snapshot_revision:payload.snapshot_revision??null,
    content_hash:payload.content_hash||null};
  const period=payload.summary?.period||{},start=factoryWallMinute(period.start_at),
    end=factoryWallMinute(period.end_at);
  const at=Date.parse((start||'').slice(0,10)+'T12:00:00Z');
  const next=Number.isFinite(at)?new Date(at+86400000).toISOString().slice(0,10):'';
  const fullDay=Boolean(DAILY_MODES.has(String(period.mode||'').toLowerCase())&&
    start&&end&&start.endsWith('T07:00')&&end===next+'T07:00');
  const snapshotId=String(identity.snapshot_id??'').trim();
  const snapshotIdVerified=Boolean(snapshotId&&snapshotId!=='0'&&
    (!/^\d+$/.test(snapshotId)||(Number.isSafeInteger(Number(snapshotId))&&Number(snapshotId)>0)));
  const identityVerified=Boolean(identity.line_id&&identity.source_id&&snapshotIdVerified&&
    Number.isSafeInteger(identity.snapshot_revision)&&identity.snapshot_revision>0&&
    /^[a-f0-9]{64}$/.test(identity.content_hash||''));
  const evidence=sourceRows(payload);
  const sources=Object.fromEntries(VIEWS.map(view=>{
    const row=evidence?.[view]||{};
    const coverage=view==='3028'?payload.coverage?.defects||{}:row;
    const exactScope=Boolean(row.scope&&
      row.scope.source_id===identity.source_id&&
      row.scope.line_id===identity.line_id&&
      String(row.scope.snapshot_id)===String(identity.snapshot_id)&&
      Number(row.scope.snapshot_revision)===identity.snapshot_revision);
    // The direct 3028 defect coverage is authoritative when no separate
    // certificate exists. If one is advertised, it must agree on collector,
    // line and revision: a different post can reuse the same snapshot number.
    const certificateRequired=view!=='3028'||Boolean(evidence&&Object.hasOwn(evidence,'3028'));
    const certificateVerified=!certificateRequired||
      (['complete','observed_complete'].includes(row.status)&&
        row.source_complete===true&&row.transport_complete===true&&exactScope);
    const complete=coverage.source_complete===true&&coverage.transport_complete===true&&certificateVerified;
    return [view,{complete,source_complete:coverage.source_complete===true,
      transport_complete:coverage.transport_complete===true,
      scope_verified:!certificateRequired||exactScope}];
  }));
  const missing=VIEWS.filter(view=>!sources[view].complete);
  const full=identityVerified&&fullDay&&missing.length===0;
  return {status:full?'FULL':'UNPROVEN',identity,period:{start,end},collected_at:payload.collected_at||null,full_day_window:fullDay,
    identity_verified:identityVerified,missing_sources:missing,sources,
    immutable_id:full?JSON.stringify([identity.line_id,identity.source_id,start,end,
      identity.snapshot_id,identity.snapshot_revision,identity.content_hash]):null};
}

export function latestProvenFullDayClosure(payloads=[],{line='',source=''}={}){
  const seen=new Set();
  const proven=[];
  for(const payload of payloads){
    const c=fullDayClosureEvidence(payload);
    if(c.status!=='FULL'||seen.has(c.immutable_id)||
      line&&c.identity.line_id!==line||source&&c.identity.source_id!==source)continue;
    seen.add(c.immutable_id);proven.push(c);
  }
  // Two publishers or lines are not one authoritative closing population.
  // Without explicit scope, refuse to silently select one as team-wide FULL.
  if(new Set(proven.map(c=>c.identity.line_id)).size>1||
    new Set(proven.map(c=>c.identity.source_id)).size>1)return null;
  return proven.sort((a,b)=>String(b.period.end).localeCompare(String(a.period.end))||
    (Date.parse(b.collected_at)||0)-(Date.parse(a.collected_at)||0)||
    b.identity.snapshot_revision-a.identity.snapshot_revision||
    String(b.identity.snapshot_id).localeCompare(String(a.identity.snapshot_id)))[0]||null;
}
