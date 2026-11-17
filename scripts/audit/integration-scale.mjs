// Pure in-memory cohorts/history measurement; no runtime collection or builder.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {buildReuseCohorts,board2114Timeline} from '../../ames/data/reuse-cohorts.mjs';
import {execFileSync} from 'node:child_process';
const baseSha='3a088ddad41be9e31b144e4ac4b0b73725141624';
const baseSource=execFileSync('git',['show',baseSha+':ames/data/reuse-cohorts.mjs'],{encoding:'utf8'})
 .replace(/from '\.\/([^']+)'/g,(_,path)=>'from '+JSON.stringify(new URL('../../ames/data/'+path,import.meta.url).href));
const baseline=await import('data:text/javascript;base64,'+Buffer.from(baseSource).toString('base64'));
const samples=[];
for(const size of [250,500,1000]){
 const occurrences=Array.from({length:size},(_,i)=>({pcba_sn:'SYNTH-'+i,defect_code:'D',defect_desc:'Camera',
  defect_time:'2026-11-03 09:00:00',line_id:'TAN10101',product_model:'CPH-SYNTHETIC'}));
 const history=occurrences.flatMap(o=>[0,1].map(hist_seq=>({...o,hist_seq,source_view:'2114',defect_time:null})));
 const materials=occurrences.map((o,i)=>({...o,current_pcba_sn:o.pcba_sn,item_sn:'M'+i,item_type:'Camera',
  previous_pcbas_json:'[]',material_use_index:1}));
 const snapshot={line_id:'TAN10101',occurrences,pcba_history:{records:history},material_trace:{records:materials}};
 const start=performance.now(),out=buildReuseCohorts(snapshot),ms=performance.now()-start;
 assert.equal(out.pcbas.rows.length,size);assert.equal(out.components.rows.length,size);
 samples.push({pcbas:size,historical_rows:history.length,components:size,milliseconds:Math.round(ms),rss_mib:Math.round(process.memoryUsage().rss/1048576)});
}
const deep=[];
for(const size of [100,200,400]){
 const rows=Array.from({length:size},(_,hist_seq)=>({pcba_sn:'ONE',hist_seq,defect_code:'D',defect_desc:'Camera',source_view:'2114'}));
 const beforeStart=performance.now(),before=baseline.board2114Timeline('ONE',rows),beforeMs=performance.now()-beforeStart;
 const start=performance.now(),out=board2114Timeline('ONE',rows);
 assert.equal(out.length,size);assert.equal(out.at(-1).repeat_exact_prior_count,size-1);
 assert.equal(before.at(-1).repeat_exact_prior_count,out.at(-1).repeat_exact_prior_count);
 deep.push({historical_rows_one_pcba:size,base_milliseconds:Math.round(beforeMs),current_milliseconds:Math.round(performance.now()-start)});
}
console.log(JSON.stringify({schema:'ames-synthetic-scale-v1',baseline_sha:baseSha,factory_acceptance:'PENDING',cohorts:samples,deep_history:deep}));
