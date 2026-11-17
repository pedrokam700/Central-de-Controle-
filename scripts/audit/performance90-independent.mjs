// Independent current faults sharing one complete history. Synthetic only.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=')??fallback;
const root=path.resolve(arg('root','.')),sizes=arg('sizes','100,200,400,800,1600').split(',').map(Number);
const {buildReuseCohorts}=await import(pathToFileURL(path.join(root,'ames/data/reuse-cohorts.mjs')));
for(const size of sizes){
 const history=Array.from({length:size},(_,i)=>({pcba_sn:'P',hist_seq:i,record_id:'H'+i,
  defect_code:'D',defect_desc:'Camera impurity',defect_user_name:'Pessoa '+i,repair_status:i%2?'Y':'N'}));
 const occurrences=Array.from({length:size},(_,i)=>({pcba_sn:'P',line_id:'TAN10101',defect_key:'K'+i,
  defect_code:'D',defect_desc:'Camera impurity',defect_time:new Date(Date.UTC(2026,10,3,12,i)).toISOString()}));
 const cpu=process.cpuUsage(),start=performance.now();
 const value=buildReuseCohorts({line_id:'TAN10101',source_id:'SOURCE',snapshot_id:'S',revision:14,occurrences,pcba_history:{records:history}});
 const wall=performance.now()-start,used=process.cpuUsage(cpu),row=value.pcbas.rows[0];
 console.log(JSON.stringify({kind:'independent-faults-one-pcba',size,wall_ms:+wall.toFixed(3),cpu_ms:(used.user+used.system)/1000,
  rss_after:process.memoryUsage().rss,heap_after:process.memoryUsage().heapUsed,max_rss_kib:process.resourceUsage().maxRSS,
  count:{events:row.events.length,history:row.history_2114.length,prior:row.prior_events.length},
  sha256:createHash('sha256').update(JSON.stringify(value)).digest('hex')}));
}
