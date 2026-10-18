const text=value=>String(value??'').trim();
const pcba=row=>text(row?.pcba_sn||row?.current_pcba_sn||row?.PCBA);
const code=row=>text(row?.defect_code||row?.['Defect Code']);
const defectTime=row=>text(row?.defect_time||row?.['Defect Time']);
function instant(value){
  const raw=text(value);if(!raw)return null;
  const prepared=/[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw)?raw:/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)?raw.replace(' ','T')+'-03:00':'';
  if(!prepared)return null;const n=Date.parse(prepared);return Number.isFinite(n)?n:null;
}
// Shared proof parser for factory-local MES Defect Time and offset-aware data.
export {instant as parseFailureInstant};
function sameInstant(a,b){const x=instant(a),y=instant(b);return x!==null&&x===y;}

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

export function sameFailureOccurrence(a={},b={}){
  if(a.defect_key&&b.defect_key)return text(a.defect_key)===text(b.defect_key);
  return Boolean(pcba(a)&&pcba(a)===pcba(b)&&code(a)&&code(a)===code(b)&&sameInstant(defectTime(a),defectTime(b)));
}

export function productionEvidenceForOccurrence(occurrence={},contexts=[]){
  const own=trustedProductionEvidence(occurrence);if(own.trusted)return own;
  const context=(contexts||[]).find(row=>sameFailureOccurrence(occurrence,row));
  return context?trustedProductionEvidence({...occurrence,...context}):trustedProductionEvidence({});
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
