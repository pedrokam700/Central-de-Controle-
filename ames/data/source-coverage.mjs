// A missing dataset is not proof that an MES source was fully queried.
// B3.4 keeps collection completeness separate from transport completeness.
const SOURCES=Object.freeze(['3028','3074','2114','3022','3012']);
export function fiveSourceEvidence(payload){
  const mapped=payload?.source_coverage||payload?.canonical?.source_coverage||
    payload?.coverage?.sources||null;
  return SOURCES.map(view=>{
    const row=mapped?.[view];
    const status=row?.status;
    const observed=status==='observed_partial'||status==='candidate_partial';
    const count=observed&&Number.isSafeInteger(row?.stored_rows)&&row.stored_rows>0?row.stored_rows:null;
    return Object.freeze({
      view,status:observed?status:'unknown',count,
      sourceComplete:row?.source_complete===true,
      transportComplete:row?.transport_complete===true,
      scope:row?.scope||null,
      // 3012 links are same-PCBA candidates only, never confirmed repairs.
      candidateOnly:view==='3012',
    });
  });
}
