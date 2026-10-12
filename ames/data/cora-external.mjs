import {assertCoraExternalRequest} from '../../core/cora-egress-transport.mjs';

export const CORA_MES_EXTERNAL_SCHEMA='central-cora-mes-external-v1';

const clip=(value,max=300)=>String(value??'').slice(0,max);
const freeze=value=>{
  if(Array.isArray(value)){value.forEach(freeze);return Object.freeze(value);}
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);return Object.freeze(value);}
  return value;
};
const nullable=value=>value===undefined||value===null||String(value)===''?null:clip(value);
const finiteNumber=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

export function projectCoraMesExternalContext(context={}){
  const facts=Array.isArray(context?.facts)?context.facts:[];
  const defectRows=facts.slice(0,25).map(row=>({
    line_id:nullable(row?.line_id??context?.line_id),
    product:nullable(row?.product??context?.product),
    source_view:nullable(row?.source_view)||'MES',
    defect_code:nullable(row?.defect_code),
    defect_desc:nullable(row?.defect_desc),
    repair_status:nullable(row?.repair_status)
  }));
  const coverageStatus=nullable(context?.coverage?.status??context?.coverage_status??context?.status)||'unavailable';
  const payload={
    analysis_kind:'mes_context',
    line_id:nullable(context?.line_id),
    product:nullable(context?.product),
    defect_code:nullable(context?.defect_code),
    snapshot_revision:context?.snapshot_revision==null?null:finiteNumber(context.snapshot_revision,0),
    source_view:'MES',
    coverage_status:coverageStatus,
    quantity:finiteNumber(context?.matched_rows,defectRows.length),
    defect_rows:defectRows
  };
  // This assertion is part of construction, not an optional caller check. If a
  // future field is added without review, the projection fails before network use.
  assertCoraExternalRequest({path:'/api/failure-analysis',method:'POST',payload,sanitized:true});
  return freeze(payload);
}

export function projectCoraMesExternalSummary(context={}){
  const payload=projectCoraMesExternalContext(context);
  return Object.freeze({
    schema:CORA_MES_EXTERNAL_SCHEMA,
    coverage_status:payload.coverage_status,
    quantity:payload.quantity,
    defect_rows:payload.defect_rows.length
  });
}
