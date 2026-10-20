// View-only quality ranking policy. Keep raw MES observations, FPY,
// Quantity, defect counts, repair/reuse investigations and exports unchanged.
// These are usually diagnostic/route/setup events rather than target-impacting
// manufacturing defects. The exclusion is deliberately conservative and exact.
const normalize=value=>String(value??'').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');

export const TARGET_RANKING_POLICY='target-impact-top3-v1';

export function targetRankingExclusion(row={}){
  const code=normalize(row.defect_code??row.code??row['Defect Code']);
  const description=normalize(row.defect_desc??row.description??row['Defect Description']);
  if(code==='f1 9999'||description==='f1 9999')
    return 'F1_9999';
  if(description==='standard error'||description==='standard error 9999')
    return 'STANDARD_ERROR';
  if(/^(?:process )?skip station$/.test(description))
    return 'PROCESS_SKIP_STATION';
  if(/^(?:process )?inconsistent scheme work order version$/.test(description))
    return 'PROCESS_SETUP_INCONSISTENT';
  return null;
}

export function targetRankingRows(rows=[]){
  return (rows||[]).filter(row=>!targetRankingExclusion(row));
}

export function targetRankingCoverage(rows=[]){
  const excluded={};
  for(const row of rows||[]){
    const reason=targetRankingExclusion(row);
    if(reason)excluded[reason]=(excluded[reason]||0)+1;
  }
  const excludedCount=Object.values(excluded).reduce((a,b)=>a+b,0);
  return Object.freeze({policy:TARGET_RANKING_POLICY,total:(rows||[]).length,
    eligible:(rows||[]).length-excludedCount,excluded:excludedCount,
    excluded_by_reason:Object.freeze(excluded)});
}
