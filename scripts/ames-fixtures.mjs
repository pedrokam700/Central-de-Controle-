import { LINE_IDS, LEGACY_SCHEMA } from '../ames/data/contract.mjs';

// Synthetic fixtures: these counts are not factory evidence.
export function fixture(line = LINE_IDS[0], count = 60) {
  const at = '2026-10-08T14:00:00-03:00';
  const payload = { schema: LEGACY_SCHEMA, line, generated_at: at,
    summary: { line, snapshot_id: `TEST-${line}`, collected_at: at, fpy: 98, check_fpy: 0, quantity: 1000, defect_rows: 200 },
    defects: Array.from({ length: count }, (_, i) => ({ line, pcba_sn: `SYNTHETIC-PCBA-${i}`, product_model: i % 2 ? 'CPH3028V' : 'CPH3028',
      defect_code: i % 3 ? 'D1' : 'D2', defect_desc: 'Synthetic defect', defect_time: at })) };
  return { kind: 'ames_shared_snapshot', line, schema: LEGACY_SCHEMA, payload };
}

export function productFixture(line = LINE_IDS[0], count = 60) {
  const doc = fixture(line, count);
  doc.payload.defects.forEach((row, index) => { row.product_model = index % 2 ? 'CPH2859' : 'CPH2859V'; });
  return doc;
}

export function canonicalAgentFixture(f){
  const p=f.legacy||f.payload,line=p.line,sid=String(p.summary.snapshot_id),revision=f.revision||1;
  const datasets=Object.fromEntries(['defects','pcba_history','material_reuse','history_contexts','process_timeline'].map(name=>[name,(name==='defects'?p.defects:f.datasets?.[name]||[]).map((row,i)=>({...row,line,line_id:line,snapshot_id:sid,snapshot_revision:revision,record_id:name+i,occurrence_id:name==='defects'?'O'+i:undefined,product:row.product_model||'CPH2859V',raw_ref:'synthetic:'+i}))]));
  return {schema:'central-ames-v2',schema_version:2,source_id:'test-source',snapshot_id:sid,snapshot_revision:revision,content_hash:'test-hash-'+revision,line_id:line,collected_at:p.summary.collected_at,summary:p.summary,datasets,coverage:Object.fromEntries(Object.entries(datasets).map(([k,v])=>[k,{stored_total:v.length,transport_complete:true,source_complete:false,status:'partial'}])),capabilities:{process_timeline:false},insights:f.insights||null};
}

export function canonicalResponse(payload,url){
  const dataset=url.searchParams.get('dataset');
  return {schema:payload.schema,source_id:payload.source_id,snapshot_id:payload.snapshot_id,line_id:payload.line_id,snapshot_revision:payload.snapshot_revision,dataset,rows:dataset==='insights'?(payload.insights?[payload.insights]:[]):payload.datasets[dataset],next_cursor:null,total:dataset==='insights'?(payload.insights?1:0):payload.datasets[dataset].length,complete:true};
}
