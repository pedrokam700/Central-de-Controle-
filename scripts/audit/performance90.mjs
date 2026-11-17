// Synthetic repeatable baseline/target measurements. No builder or MES.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=')??fallback;
const root=path.resolve(arg('root','.')),sizes=arg('sizes','100,200,400,800,1600').split(',').map(Number);
const {board2114Timeline,buildReuseCohorts}=await import(pathToFileURL(path.join(root,'ames/data/reuse-cohorts.mjs')));
const {renderBoardComparisonTable}=await import(pathToFileURL(path.join(root,'ames/console-reuse-cohorts.mjs')));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function history(size,boards=1){return Array.from({length:size},(_,i)=>({
 pcba_sn:'SYNTH-'+i%boards,source_view:'2114',hist_seq:Math.floor(i/boards),defect_code:'D'+(i%3),
 defect_desc:['Camera impurity','WiFi failed','Front camera failed'][i%3],
 defect_time:i%7?'2026-11-01 08:00:00':null,defect_user:'SYNTH-A'+i%5,
 defect_user_name:'Pessoa sintética '+i%5,repair_status:i%2?'Y':'N',defect_type:'MainBoard',
 source_id:'SOURCE',line_id:'TAN10101',snapshot_id:'1',snapshot_revision:14,
 period:{start_at:'2026-11-01',end_at:'2026-11-17'},record_id:'H'+i,repair_comment:'Comentário '+i}));}
export function multi(size){
 const boards=Math.max(1,Math.floor(size/8)),h=history(size,boards);
 const occurrences=Array.from({length:boards},(_,i)=>({pcba_sn:'SYNTH-'+i,defect_code:'D0',defect_desc:'Camera impurity',
  defect_time:'2026-11-16 10:00:00',line_id:'TAN10101',product_model:'CPH-SYNTHETIC',defect_key:'K'+i}));
 const materials=occurrences.flatMap((o,i)=>[0,1].map(k=>({...o,current_pcba_sn:o.pcba_sn,item_sn:'M'+i+'-'+k,item_type:k?'Camera':'Screen',
  previous_pcbas_json:JSON.stringify(['SYNTH-'+((i+1)%boards)]),usage_status:k?'Y':'N',material_use_index:2})));
 return {source_id:'SOURCE',line_id:'TAN10101',snapshot_id:'1',revision:14,occurrences,
  pcba_history:{records:h},material_trace:{records:materials}};
}
function measure(kind,size,run){
 const cpu=process.cpuUsage(),rss=process.memoryUsage(),start=performance.now(),value=run(),ms=performance.now()-start;
 const used=process.cpuUsage(cpu);
 const result={kind,size,wall_ms:+ms.toFixed(3),cpu_ms:(used.user+used.system)/1000,
  rss_before:rss.rss,rss_after:process.memoryUsage().rss,heap_after:process.memoryUsage().heapUsed,max_rss_kib:process.resourceUsage().maxRSS,
  sha256:digest(value),count:Array.isArray(value)?value.length:typeof value==='string'?(value.match(/data-reuse-timeline-row/g)||[]).length:
   {pcbas:value.pcbas.rows.length,components:value.components.rows.length,history:value.pcbas.rows.reduce((n,r)=>n+r.history_2114.length,0)}};
 console.log(JSON.stringify(result));return value;
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 for(const size of sizes){
  const rows=history(size),projected=measure('history',size,()=>board2114Timeline('SYNTH-0',rows));
  measure('render-history',size,()=>renderBoardComparisonTable({sn:'SYNTH-0',history_2114:projected,events:[]}));
  measure('multi-pcba-components',size,()=>buildReuseCohorts(multi(size)));
 }
}
