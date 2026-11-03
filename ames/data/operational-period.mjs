// Production-day identity is independent of fetch time, workstation timezone and SQL id.
// Only explicitly live 3028 windows may promote a shared current head.
import {factoryWallMinute} from './history.mjs';
const LIVE_MODES=new Set(['today','live','monitor_today']);
const pad=n=>String(n).padStart(2,'0');
const ymdUTC=ms=>new Date(ms).toISOString().slice(0,10);

export function factoryWindow(now=new Date(),{timezone='America/Sao_Paulo',dayStart='07:00'}={}){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(dayStart))throw Error('Invalid production start');
  const fields=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  let day=Date.UTC(Number(fields.year),Number(fields.month)-1,Number(fields.day));
  if(fields.hour+':'+fields.minute<dayStart)day-=86400000;
  const date=ymdUTC(day);
  return {operational_date:date,start_at:date+'T'+dayStart,end_at:ymdUTC(day+86400000)+'T'+dayStart};
}

export function periodIdentity(payload){
  const period=payload?.summary?.period||{};
  // 07:00-03:00 and 10:00Z are the same factory instant. Preserve nonzero
  // seconds so a near-boundary or malformed query cannot become a live head.
  const start=factoryWallMinute(period.start_at),end=factoryWallMinute(period.end_at);
  return {line_id:payload?.line_id||null,source_id:payload?.source_id||null,operational_date:start?.slice(0,10)||null,period_start:start||null,period_end:end||null,query_intent:String(period.mode||'').toLowerCase()};
}

// "Live" is an explicit query intent AND the exact current production window.
// A historical refresh at 14:00 today cannot promote Friday to Today.
export function isTodaySnapshot(payload,now=new Date(),config){
  const x=periodIdentity(payload),w=factoryWindow(now,config);
  if(!LIVE_MODES.has(x.query_intent)||x.period_start!==w.start_at)return false;
  if(!x.period_end||x.period_end<x.period_start||x.period_end>w.end_at)return false;
  const collected=Date.parse(payload?.collected_at||'');
  return Number.isFinite(collected);
}

export function publicationIntent(payload,now=new Date(),config){
  return isTodaySnapshot(payload,now,config)?'today':'history';
}
