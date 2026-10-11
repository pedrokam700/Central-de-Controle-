export const CORA_EGRESS_POLICY_SCHEMA='central-cora-egress-policy-v1';

const NEVER_EXTERNAL_FRAGMENTS=Object.freeze([
  'password','senha','passwd','pwd','cookie','authorization','credential','secret','token','session',
  'ames_password','ames_cookie','ames_session','local_agent_token','browser_storage','raw_json','raw_mes','raw_payload'
]);

const LOCAL_ONLY_FIELDS=new Set([
  'pcba_sn','current_pcba_sn','historical_pcba','current_pcba','previous_pcbas_json','active_now_pcbas_json','inactive_now_pcbas_json',
  'material_sn','item_sn','defect_oper','operator','operator_name','owner_email','email','assignees','evidence','image','images',
  'attachment','attachments','document','documents','comment','comments','notes','conversation','conversation_history','report_body','raw_ref'
]);

const SANITIZED_EXTERNAL_FIELDS=new Set([
  'line','line_id','product','product_model','cph','family','component','defect_code','defect_desc','defect_type','defect_type_class',
  'repair_status','repair_state_current','manual_or_auto','registration_mode','station','process','operation_code','operation_name',
  'failure_family','analysis_kind','reference_station_code','reference_reason','reference_status','usage_status','item_type','material_type',
  'fpy','check_fpy','quantity','defect_rows','total_defect_qty','previous_pcba_count','total_pcba_count_known_now',
  'snapshot_revision','source_view','coverage_status','reference_confidence','reference_pass_count_before_defect'
]);

const normalized=value=>String(value??'').trim().toLowerCase().replaceAll('-','_');

export function classifyCoraField(field){
  const key=normalized(field);
  if(!key)return Object.freeze({classification:'local_only',reason:'empty_or_unknown'});
  if(NEVER_EXTERNAL_FRAGMENTS.some(fragment=>key.includes(fragment))){
    return Object.freeze({classification:'never_external',reason:'secret_or_session_material'});
  }
  if(LOCAL_ONLY_FIELDS.has(key))return Object.freeze({classification:'local_only',reason:'industrial_or_personal_identifier'});
  if(SANITIZED_EXTERNAL_FIELDS.has(key))return Object.freeze({classification:'sanitized_external',reason:'explicit_technical_allowlist'});
  return Object.freeze({classification:'local_only',reason:'unknown_defaults_local'});
}

export function evaluateCoraExternalPayload(payload,{sanitized=false}={}){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new TypeError('CORA payload must be an object');
  const violations=[];
  const allowed=[];
  const walk=(value,path=[])=>{
    if(Array.isArray(value)){
      value.forEach((item,index)=>walk(item,[...path,String(index)]));
      return;
    }
    if(value&&typeof value==='object'){
      for(const [key,child] of Object.entries(value)){
        const verdict=classifyCoraField(key);
        const current=[...path,key].join('.');
        if(verdict.classification==='never_external')violations.push({path:current,...verdict});
        else if(verdict.classification==='local_only')violations.push({path:current,...verdict});
        else if(!sanitized)violations.push({path:current,classification:'requires_sanitization',reason:'explicit_sanitization_proof_required'});
        else allowed.push({path:current,...verdict});
        // Never inspect secret/local-only child content: classification of the container is enough.
        if(verdict.classification==='sanitized_external')walk(child,[...path,key]);
      }
    }
  };
  walk(payload);
  return Object.freeze({
    schema:CORA_EGRESS_POLICY_SCHEMA,
    permitted:violations.length===0,
    sanitized:Boolean(sanitized),
    allowed:Object.freeze(allowed),
    violations:Object.freeze(violations)
  });
}

export function assertCoraExternalPayload(payload,options={}){
  const result=evaluateCoraExternalPayload(payload,options);
  if(!result.permitted){
    const preview=result.violations.slice(0,5).map(item=>`${item.path}:${item.classification}`).join(', ');
    const error=new Error(`CORA external payload blocked by data policy: ${preview}`);
    error.code='cora/egress-policy-blocked';
    error.policy=result;
    throw error;
  }
  return result;
}

export const CORA_EGRESS_FIELDS=Object.freeze({
  never_external_fragments:NEVER_EXTERNAL_FRAGMENTS,
  local_only:Object.freeze([...LOCAL_ONLY_FIELDS]),
  sanitized_external:Object.freeze([...SANITIZED_EXTERNAL_FIELDS])
});
