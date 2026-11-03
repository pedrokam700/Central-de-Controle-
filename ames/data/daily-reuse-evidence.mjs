// Counts are exact for observed, distinct 3028 defect occurrences only. They
// are NOT production totals, Check FPY denominators or causal conclusions.
import {matchComponentToCurrentFailure} from './component-failure-compatibility.mjs';
import {compareFailures} from './failure-taxonomy.mjs';
const txt=v=>String(v??'').trim();
export const REUSE_GROUPS=Object.freeze(['pcba_only','material_only','both','no_reuse_evidence']);
export const REUSE_CRITERIA=Object.freeze(['pcba_reused','pcba_prior_history',
  'pcba_prior_same','pcba_prior_family','material_reused',
  'material_prior_candidate','material_prior_same_candidate',
  'material_prior_family_candidate','material_type_candidate']);

function previousFailureMatches(evidence=[],code,desc,kind){
  return evidence.some(old=>{
    const oldCode=txt(old.defect_code),oldDesc=txt(old.defect_desc);
    // Aggregate strings ('F1, F2') do not identify one previous 2114 failure.
    if(!oldCode||oldCode.includes(',')||oldCode.includes('|'))return false;
    return compareFailures(code,desc,oldCode,oldDesc).classification===kind;
  });
}

export function reuseCriteriaEvidence(row={}){
  const exact=Array.isArray(row.component_links_exact)?row.component_links_exact:[];
  const links=exact.filter(link=>txt(link.material));
  const pcbaPrior=Array.isArray(row.pcba_prior_events)?row.pcba_prior_events:[];
  const materialPrior=links.flatMap(link=>Array.isArray(link.historical_evidence)?link.historical_evidence:[]);
  const compatible=links.some(link=>['EXACT_COMPATIBLE','FAMILY_COMPATIBLE'].includes(
    matchComponentToCurrentFailure(link.item_type,row.defect_code,row.defect_desc).classification));
  return {pcba_reused:row.pcba_reused===true,
    pcba_prior_history:row.pcba_reused===true&&row.pcba_prior_failure===true,
    pcba_prior_same:row.pcba_reused===true&&previousFailureMatches(pcbaPrior,row.defect_code,row.defect_desc,'EXACT'),
    pcba_prior_family:row.pcba_reused===true&&previousFailureMatches(pcbaPrior,row.defect_code,row.defect_desc,'SIMILAR'),
    material_reused:links.length>0,
    material_prior_candidate:materialPrior.some(e=>e.defect_code),
    material_prior_same_candidate:previousFailureMatches(materialPrior,row.defect_code,row.defect_desc,'EXACT'),
    material_prior_family_candidate:previousFailureMatches(materialPrior,row.defect_code,row.defect_desc,'SIMILAR'),
    material_type_candidate:compatible};
}

export function filterReuseCriteria(rows=[],criteria=[],mode='or'){
  const selected=[...new Set(criteria)].filter(key=>REUSE_CRITERIA.includes(key));
  if(!selected.length)return [];
  return rows.filter(row=>{
    const flags=reuseCriteriaEvidence(row);
    return mode==='and'?selected.every(key=>flags[key]):selected.some(key=>flags[key]);
  });
}

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
