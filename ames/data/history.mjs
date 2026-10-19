import { productKey } from './contract.mjs';
export function periodOf(payload) {
  const p=payload?.summary?.period;
  return {start:p?.start_at||null,end:p?.end_at||null};
}
export function coverageState(read) {
  if(!read?.snapshot)return 'not_collected';
  if(read.freshness!=='fresh')return 'stale';
  const coverage=read.snapshot.canonical?.coverage?.defects;
  return coverage?.transport_complete===true&&coverage?.source_complete===true?'fresh':'partial';
}
export function historyMetadata(payload) {
  const period=periodOf(payload);
  const products=[...new Set((payload.datasets?.defects||[]).map(r=>productKey(r.product_model)).filter(Boolean))].sort();
  return {period_start:period.start||'',period_end:period.end||'',products:products.join(',').slice(0,2000)};
}
// The HTML datetime-local input is a factory wall clock without an offset.
// A-MES can persist the equivalent instant with -03:00 or Z; compare both
// as minutes in America/Sao_Paulo, never by collection timestamp.
export function factoryWallMinute(value){
  const raw=String(value||'').trim().replace(' ','T');
  const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(raw);
  if(!m)return null;
  if(!m[4])return m[1]+'T'+m[2]+':'+m[3];
  const date=new Date(raw);
  if(!Number.isFinite(date.getTime()))return null;
  const fields=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',
    day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return fields.year+'-'+fields.month+'-'+fields.day+'T'+fields.hour+':'+fields.minute;
}
export function matchesPeriod(entry,{start='',end='',product=''}={}) {
  // A collection timestamp is never used as a substitute for the requested MES period.
  const startMinute=factoryWallMinute(start),endMinute=factoryWallMinute(end);
  if(start&&(!startMinute||factoryWallMinute(entry.period_start)!==startMinute))return false;
  if(end&&(!endMinute||factoryWallMinute(entry.period_end)!==endMinute))return false;
  return !product||String(entry.products||'').split(',').includes(productKey(product));
}
