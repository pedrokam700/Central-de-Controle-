// Read-only, bounded progress projection for the LOCAL job response.
// No polling and no MES commands here. Never share these identifiers through Firebase.
const short=(value,limit=160)=>value==null?'':String(value).slice(0,limit);
const count=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Math.min(Number(value),1_000_000):null;
const stages=new Set(['3074','2114','3022']);
const kinds=new Set(['component','pcba','progress','failure','started','completed','error','status']);
export function projectLiveJobEvents(events,max=40){
  if(!Array.isArray(events))return [];
  return events.slice(-Math.min(Math.max(1,Number(max)||40),40)).filter(e=>e&&typeof e==='object'&&stages.has(String(e.stage||''))).map(e=>({
    stage:short(e.stage,4),kind:kinds.has(String(e.kind||''))?short(e.kind,20):'status',
    line:short(e.line,32),sn:short(e.sn,72),pcba:short(e.pcba,72),
    item_type:short(e.item_type,72),item_sn:short(e.item_sn,100),
    status:short(e.status,80),at:short(e.at,40),
    defect_index:count(e.defect_index),defect_total:count(e.defect_total),
    component_index:count(e.component_index),component_total:count(e.component_total),
    current:count(e.current),total:count(e.total),
  }));
}
