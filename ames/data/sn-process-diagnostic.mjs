// An observed process passage is not a mapped origin of a defect.
// Surface its date and shift separately, never in the generation KPI fields.
const ZONE='America/Sao_Paulo';
const awareTimestamp=value=>{
  const raw=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:(?:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(raw))return null;
  const instant=Date.parse(raw);
  return Number.isFinite(instant)?instant:null;
};
const factoryParts=instant=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
}).formatToParts(new Date(instant)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));

export function processPassageDiagnostic(context={}){
  const mapped=Boolean(context.reference_rule_id||context.reference_station_code&&context.reference_confidence!=='UNMAPPED');
  const code=String(context.previous_operation_code||context.previous_station||'').trim();
  const previous=awareTimestamp(context.previous_event_time);
  const defect=awareTimestamp(context.defect_time_utc);
  const valid=String(context.source||'')==='3022'&&Boolean(code)&&previous!==null&&defect!==null&&previous<=defect;
  let shift=null,operationalDate=null;
  if(valid){
    const p=factoryParts(previous),minute=Number(p.hour)*60+Number(p.minute);
    shift=minute>=450&&minute<1050?'1st Shift':'2nd Shift';
    const day=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))-(minute<420?86400000:0);
    operationalDate=new Date(day).toISOString().slice(0,10);
  }
  return {
    status:mapped?'mapped':context.reference_confidence==='UNMAPPED'||String(context.status||'').includes('RULE_NOT_MAPPED')?'unmapped':'unproven',
    family:String(context.failure_family||'').trim()||null,
    model:String(context.product_model||'').trim()||null,
    code:valid?code:null,
    passage_time:valid?context.previous_event_time:null,
    passage_shift:valid?shift:null,
    passage_operational_date:valid?operationalDate:null,
    reason:String(context.reference_reason||'').trim()||null,
    evidence:valid?'3022_COMPLETED_PRE_DEFECT':'NOT_PROVEN',
  };
}
