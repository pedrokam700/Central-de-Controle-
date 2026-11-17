const text=value=>String(value??'').trim();
const pcba=row=>text(row?.pcba_sn||row?.current_pcba_sn||row?.PCBA);
const code=row=>text(row?.defect_code||row?.['Defect Code']);
const defectTime=row=>text(row?.defect_time||row?.['Defect Time']);
function instant(value){
  const raw=text(value);if(!raw)return null;
  const parts=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw);
  if(!parts)return null;
  const [year,month,day,hour,minute]=parts.slice(1).map(Number),calendar=new Date(0);
  calendar.setUTCFullYear(year,month-1,day);
  if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day||hour>23||minute>59)return null;
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
  const eventAt=instant(eventTime),referenceAt=instant(row.reference_event_time);
  const defectAt=instant(defectTime(row)),defectUtc=instant(row.defect_time_utc);
  const trusted=source==='3022'&&basis==='reference_process'&&Boolean(referenceStation)&&
    !/^A69/i.test(referenceStation)&&eventAt!==null&&
    (!row.reference_event_time||referenceAt!==null&&referenceAt===eventAt)&&
    (!defectTime(row)||defectAt!==null&&eventAt<=defectAt)&&
    (!row.defect_time_utc||defectUtc!==null&&(defectAt===null||defectUtc===defectAt));
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

// Fail closed on contradictory *explicit* lineage. An older context can lack
// optional fields; absence alone does not authenticate or contradict evidence.
// Aliases are compared together to prevent line_id/revision wrapper bypasses.
const lineageFields=[
  ['source_id'],['line','line_id'],['snapshot_id'],
  ['snapshot_revision','revision'],['period']
];
function lineageValue(value){
  if(value===null||value===undefined)return '';
  if(typeof value==='object')return JSON.stringify(value);
  return text(value);
}
export function compatibleExplicitLineage(a={},b={}){
  for(const aliases of lineageFields){
    const values=row=>[...new Set(aliases.map(key=>lineageValue(row?.[key])).filter(Boolean))];
    const left=values(a),right=values(b);
    if(left.length>1||right.length>1)return false;
    if(left.length&&right.length&&left[0]!==right[0])return false;
  }
  return true;
}

export function sameFailureOccurrence(a={},b={}){
  // A defect_key can be local to a collector, line, or snapshot. Matching keys
  // alone must never borrow 3022 evidence from a different (or unknown) PCBA.
  const board=pcba(a);
  if(!board||board!==pcba(b))return false;
  if(!compatibleExplicitLineage(a,b))return false;
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
  const matched=Array.isArray(contexts)?contexts.filter(row=>row&&sameFailureOccurrence(occurrence,row)):[];
  const proven=[own,...matched.map(row=>provenReference(occurrence,row))].filter(Boolean);
  if(!proven.length)return trustedProductionEvidence({});
  // Distinct trusted 3022 contexts for the same occurrence must not be
  // resolved by array order. Identical repeated evidence is harmless.
  const identity=row=>JSON.stringify([row.station,instant(row.event_time),row.shift,row.operational_date]);
  return proven.every(row=>identity(row)===identity(proven[0]))?proven[0]:trustedProductionEvidence({});
}

/** Diagnose missing 3022 generation evidence without treating 3028 timestamps as a replacement.
 * Returns only observable source/matching states, never guesses the station. */
export function productionEvidenceGap(occurrence={},contexts=[],diagnostics=[]){
  if(productionEvidenceForOccurrence(occurrence,contexts).trusted)return null;
  const diagnostic=diagnostics.find?.(row=>sameFailureOccurrence(occurrence,row));
  const reasons={
    PCBA_NOT_QUERIED:'3022 sem consulta comprovada para esta PCBA no escopo selecionado',
    CONTEXT_NOT_LOADED:'3022 com resposta salva, mas contexto local ainda não projetado',
    PARTIAL_QUERY:'3022 com consulta parcial; referência produtiva permanece pendente',
    NO_EXACT_OCCURRENCE:'3022 carregada, mas sem correlação exata PCBA + falha + Defect Time',
    TIMEZONE_CONFLICT:'3022 com relógios explícitos divergentes; fuso não corrigido por suposição',
    INVALID_DEFECT_TIME:'3022 com horário da ocorrência inválido ou ausente',
    INVALID_REFERENCE_TIME:'3022 com horário de referência inválido ou não interpretável',
    FUTURE_REFERENCE:'3022 com referência posterior à ocorrência investigada',
    AT_REFERENCE:'3022 com referência de AT; horário produtivo não comprovado',
    CONFLICTING_REFERENCES:'3022 com referências conflitantes para esta ocorrência',
    REFERENCE_UNMAPPED:'3022 sem posto de referência mapeado para o CPH e família',
    NO_REFERENCE_PASSAGE:'3022 sem passagem válida concluída no posto de referência',
  };
  if(diagnostic&&reasons[diagnostic.code])return reasons[diagnostic.code];
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
