import {eventBeforeFailure,immutable,productKey,requireLine,instant} from './contract.mjs';
export const PROCESS_CAPABILITY='process_timeline_3022';
export function processEvent(event){
  requireLine(event.line_id);
  if(event.source_view!=='3022'||!event.event_id||!event.pcba_sn||!event.product||event.product!==productKey(event.product)||instant(event.event_time)===null||!event.snapshot_id||!Number.isInteger(event.snapshot_revision)||!event.provenance||!event.raw_ref||!event.coverage)throw Error('Invalid ProcessTimeline event');
  return immutable({...event});
}
export function selectProcess(snapshot,occurrence){
  if(snapshot?.process_timeline.status==='not_collected'||!snapshot)return immutable({status:'not_collected',event:null});
  const events=snapshot.process_timeline.events.filter(e=>e.product===productKey(occurrence.product||occurrence.product_key)&&String(e.snapshot_id)===snapshot.snapshot_id&&e.snapshot_revision===snapshot.revision);
  return eventBeforeFailure(events.map(e=>({...e,process_name:e.process})),occurrence);
}
