const text=value=>String(value??'').trim();

export function trustedProductionEvidence(row={}){
  const source=text(row.production_shift_source).toLowerCase();
  const basis=text(row.production_shift_basis).toLowerCase();
  const referenceStation=text(row.reference_station_code);
  const eventTime=row.production_event_time||row.reference_event_time||null;
  const trusted=source==='3022'&&basis==='reference_process'&&Boolean(referenceStation&&eventTime);
  return Object.freeze({
    trusted,
    source:trusted?'3022':null,
    basis:trusted?'reference_process':null,
    station:trusted?referenceStation:null,
    event_time:trusted?eventTime:null,
    shift:trusted?(row.production_shift||null):null,
    operational_date:trusted?(row.production_operational_date||null):null,
  });
}

export function genericReturnEvidence(row={}){
  const station=text(row.return_station_code)||null;
  const operation=text(row.return_operation_name)||null;
  const eventTime=row.return_event_time||null;
  const proven=Boolean(eventTime&&(station||operation));
  return Object.freeze({
    proven,
    station:proven?station:null,
    operation:proven?operation:null,
    event_time:proven?eventTime:null,
    label:proven?[station,operation].filter((value,index,list)=>value&&list.indexOf(value)===index).join(' · '):null,
  });
}
