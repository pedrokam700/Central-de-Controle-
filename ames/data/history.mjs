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
export function matchesPeriod(entry,{start='',end='',product=''}={}) {
  // A collection timestamp is never used as a substitute for the requested MES period.
  const wallTime=value=>String(value||'').trim().replace(' ','T').replace(/^(.*T\d{2}:\d{2}):00(?:\.0+)?$/, '$1');
  return (!start||wallTime(entry.period_start)===wallTime(start))&&(!end||wallTime(entry.period_end)===wallTime(end))&&(!product||String(entry.products||'').split(',').includes(productKey(product)));
}
