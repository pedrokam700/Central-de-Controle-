// Counts are exact for observed, distinct 3028 defect occurrences only. They
// are NOT production totals, Check FPY denominators or causal conclusions.
const txt=v=>String(v??'').trim();
export const REUSE_GROUPS=Object.freeze(['pcba_only','material_only','both','no_reuse_evidence']);

export function reuseGroup(row={}){
  const board=row.pcba_reused===true;
  const links=Array.isArray(row.component_links_exact)?row.component_links_exact:row.component_links;
  const material=Array.isArray(links)&&links.some(link=>txt(link.material));
  return board&&material?'both':board?'pcba_only':material?'material_only':'no_reuse_evidence';
}

export function observedReuseDashboard(rows=[],axis='day'){
  const dedup=new Map();
  for(const [i,row] of rows.entries()){
    // MES exact identity includes line, PCBA, defect code and defect instant.
    // A missing identity does not license merging distinct observations.
    const exact=txt(row.line)&&txt(row.pcba)&&txt(row.defect_code)&&txt(row.defect_time);
    const key=exact?JSON.stringify([row.line,row.pcba,row.defect_code,row.defect_time]):`missing:${i}`;
    if(!dedup.has(key))dedup.set(key,row);
  }
  const unique=[...dedup.values()];
  const groups=Object.fromEntries(REUSE_GROUPS.map(name=>[name,[]]));
  for(const row of unique)groups[reuseGroup(row)].push(row);
  const selectedAxis=axis==='line'?'line':'day';
  const bins=new Map();
  for(const row of unique){
    const value=selectedAxis==='line'?txt(row.line):txt(row.failure_record_date);
    const key=value||'UNKNOWN';
    if(!bins.has(key))bins.set(key,{key,total:0,pcba_only:0,material_only:0,both:0,no_reuse_evidence:0});
    const entry=bins.get(key);entry.total++;entry[reuseGroup(row)]++;
  }
  const binsSorted=[...bins.values()].sort((a,b)=>a.key.localeCompare(b.key));
  return {axis:selectedAxis,total:unique.length,rows:unique,
    pcba:[...groups.pcba_only,...groups.both],material:[...groups.material_only,...groups.both],
    union:[...groups.pcba_only,...groups.material_only,...groups.both],
    intersection:groups.both,groups,bins:binsSorted,
    basis:'observed_3028_occurrences',population_complete:false};
}

export function theoreticalReuseSensitivity(model,selected=[],{
  quantity=null,denominatorProven=false,operationalDate=''
}={}){
  const total=Number(model?.total)||0;
  const uniquePcbas=new Set(selected.map(row=>txt(row.pcba)).filter(Boolean));
  const shareOfObserved=total>0?selected.length/total*100:null;
  const eligible=denominatorProven===true&&quantity!==null&&quantity!==undefined&&
    Number.isFinite(Number(quantity))&&Number(quantity)>0&&
    /^\d{4}-\d{2}-\d{2}$/.test(operationalDate)&&selected.length>0&&
    uniquePcbas.size===selected.length&&selected.length<=Number(quantity)&&
    selected.every(row=>row.production_evidence_proven===true&&
      row.production_operational_date===operationalDate);
  return {share_of_observed_pct:shareOfObserved,
    distinct_pcbas:uniquePcbas.size,
    theoretical_scale_pp:eligible?selected.length/Number(quantity)*100:null,
    check_fpy_gain:null,root_cause_confirmed:false,
    reason:eligible?'theoretical_unique_units_with_proven_denominator':'insufficient_unique_unit_or_denominator_proof'};
}
