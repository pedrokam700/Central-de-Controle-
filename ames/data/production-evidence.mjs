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
  // A defect_key can be local to a collector, line, or snapshot. Matching keys
  // alone must never borrow 3022 evidence from a different (or unknown) PCBA.
  const board=pcba(a);
  if(!board||board!==pcba(b))return false;
  if(a.defect_key&&b.defect_key){
    if(text(a.defect_key)!==text(b.defect_key))return false;
    // Even if the keys match, reject conflicting explicit occurrence fields.
    if(code(a)&&code(b)&&code(a)!==code(b))return false;
    if(defectTime(a)&&defectTime(b)&&!sameInstant(defectTime(a),defectTime(b)))return false;
    return true;
  }
  return Boolean(code(a)&&code(a)===code(b)&&sameInstant(defectTime(a),defectTime(b)));
}

// A source-labelled reference is usable as production timing evidence only
// when it has its own valid timestamp no later than this exact MES defect.
function provenReference(occurrence,reference){
  const candidate=trustedProductionEvidence(reference);
  if(!candidate.trusted)return null;
  const defectAt=instant(defectTime(occurrence)),processAt=instant(candidate.event_time);
  return defectAt!==null&&processAt!==null&&processAt<=defectAt?candidate:null;
}

export function productionEvidenceForOccurrence(occurrence={},contexts=[]){
  const own=provenReference(occurrence,occurrence);
  if(own)return own;
  const matched=Array.isArray(contexts)?contexts.filter(row=>row&&sameFailureOccurrence(occurrence,row)):[];
  const proven=matched.map(row=>provenReference(occurrence,row)).filter(Boolean);
  if(!proven.length)return trustedProductionEvidence({});
  // Distinct trusted 3022 contexts for the same occurrence must not be
  // resolved by array order. Identical repeated evidence is harmless.
  const identity=row=>JSON.stringify([row.station,instant(row.event_time),row.shift,row.operational_date]);
  return proven.every(row=>identity(row)===identity(proven[0]))?proven[0]:trustedProductionEvidence({});
}

/** Diagnose missing 3022 generation evidence without treating 3028 timestamps as a replacement.
 * Returns only observable source/matching states, never guesses the station. */
export function productionEvidenceGap(occurrence={},contexts=[]){
  if(productionEvidenceForOccurrence(occurrence,contexts).trusted)return null;
  if(!Array.isArray(contexts)||!contexts.length)return '3022 sem contextos carregados para a linha/revisão';
  const matched=contexts.filter(row=>row&&sameFailureOccurrence(occurrence,row));
  if(!matched.length)return '3022 carregada, mas sem correlação exata PCBA + falha + Defect Time';
  if(matched.length>1)return '3022 com contextos conflitantes/duplicados para esta ocorrência';
  const ctx=matched[0];
  const status=String(ctx.reference_status||ctx.status||'').toUpperCase();
  if(/RULE_NOT_MAPPED|UNMAPPED/.test(status)||!ctx.reference_rule_id&&!(ctx.reference_station_code||ctx.reference_event_time))
    return '3022 sem posto de referência mapeado para o CPH e família';
  if(!ctx.reference_event_time)return '3022 sem passagem válida concluída no posto de referência';
  const failure=instant(defectTime(occurrence)),event=instant(ctx.reference_event_time);
  if(failure===null||event===null)return '3022 com horário de referência inválido ou não interpretável';
  if(event>failure)return '3022 com referência posterior à ocorrência investigada';
  return '3022 com referência encontrada, porém sem vínculo de evidência confiável';
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
