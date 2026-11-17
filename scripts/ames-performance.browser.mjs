// Large synthetic history through the actual nine-view Console. Local HTTP,
// disposable Chromium profile, no agent/MES/Firebase/network configuration.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const payload=canonicalAgentFixture(productFixture('TAN10101',3));
// The Console intentionally rejects an unrelated old reading period. Use an
// explicit synthetic current production-day window rather than bypass that gate.
const clock=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
const day=Date.parse(clock.year+'-'+clock.month+'-'+clock.day+'T12:00:00Z')-(Number(clock.hour)<7?86400000:0);
const today=new Date(day).toISOString().slice(0,10);
const tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
payload.collected_at=today+'T13:00:00Z';payload.summary.collected_at=payload.collected_at;
payload.summary.period={start_at:today+'T07:00:00-03:00',end_at:tomorrow+'T07:00:00-03:00',mode:'today'};
for(const row of payload.datasets.defects)row.defect_time=today+'T10:00:00-03:00';
const harness=`import {createAmesStore} from './ames/data/store.mjs';
import {createConsoleView} from './ames/console-view.mjs';
const store=createAmesStore();let view;
window.qa={show(size){view?.clear();const p=${JSON.stringify(payload)};
 p.snapshot_revision=size+14;p.content_hash='SYNTHETIC-'+size;
 for(const rows of Object.values(p.datasets))for(const row of rows)row.snapshot_revision=p.snapshot_revision;
 const board=p.datasets.defects[0].pcba_sn;
 p.datasets.pcba_history=Array.from({length:size},(_,i)=>({pcba_sn:board,source_view:'2114',hist_seq:i,defect_code:'D'+i%3,
  defect_desc:['Camera impurity','WiFi failed','Front camera failed'][i%3],defect_time:i%7?'2026-11-01 08:00:00':null,
  defect_user_name:'Autor '+i,repair_comment:'Comentário '+i,repair_status:i%2?'Y':'N',defect_type:'MainBoard',
  line_id:p.line_id,line:p.line_id,snapshot_id:p.snapshot_id,snapshot_revision:p.snapshot_revision,source_id:p.source_id,
  record_id:'H'+i,raw_ref:'synthetic:H'+i,product:'CPH2859V'}));
 p.coverage.pcba_history.stored_total=size;
 store.replaceSyncedSnapshots([p]);
 document.querySelectorAll('.page').forEach(el=>el.classList.add('hidden'));
 document.querySelector('#mesConsoleView')?.classList.remove('hidden');document.querySelector('#accountScreen').classList.add('hidden');
 view=createConsoleView(document.querySelector('#mesConsole'),store,{locale:()=> 'pt-BR',
  transport:{fetcher:async()=>{throw Error('SYNTHETIC: no local agent');}}});view.render();
},start(){this.gaps=[];this.last=performance.now();this.timer=setInterval(()=>{const now=performance.now();this.gaps.push(now-this.last);this.last=now;},10);},
 stop(){clearInterval(this.timer);return {max_timer_gap_ms:Math.max(0,...this.gaps),heap_bytes:performance.memory?.usedJSHeapSize??null};}};qa.show(100);`;
const root=path.resolve(process.env.AMES_BROWSER_ROOT||'.');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'<script type="module" src="/Central-de-Controle-/qa.mjs"></script>';
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://synthetic').pathname);
 if(pathname==='/Central-de-Controle-/'){res.setHeader('Content-Type','text/html');return res.end(html);}
 if(pathname.endsWith('/qa.mjs')){res.setHeader('Content-Type','text/javascript');return res.end(harness);}
 if(pathname==='/release-build.json'){res.setHeader('Content-Type','application/json');return res.end('{"sha":"synthetic","branch":"performance-test"}');}
 const file=path.resolve(root,pathname.replace(/^\/Central-de-Controle-\//,''));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'application/json');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const samples=[];
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/Central-de-Controle-/');await page.waitForFunction(()=>!!window.qa);
 for(const size of (process.env.AMES_PERF_SIZES||'100,200,400,800,1600').split(',').map(Number)){
  await page.evaluate(size=>qa.show(size),size);
  const shared=page.getByRole('button',{name:'Usar somente dados compartilhados',exact:true});
  if(await shared.count())await shared.click();
  await page.evaluate(()=>qa.start());
  const views=[];
  for(const id of ['monitor','top3','failures','sn','trace','reuse','process','base','knowledge']){
   const before=await page.evaluate(()=>performance.now());
   await page.locator('[data-console-view="'+id+'"]').click();
   assert.equal(await page.locator('[data-console-pane="'+id+'"]').isVisible(),true);
   views.push({id,milliseconds:Math.round(await page.evaluate(()=>performance.now())-before)});
  }
  await page.locator('[data-console-view="reuse"]').click();
  const before=await page.evaluate(()=>performance.now());
  await page.locator('[data-cohort-kind="pcbas"][data-cohort-metric="observed"]').click();
  const rows=page.locator('[data-console-pane="reuse"] [data-reuse-timeline-row][data-source-view="2114"]');
  assert.equal(await rows.count(),size,'every original history must remain rendered');
  assert.equal(await rows.filter({hasText:new RegExp('Autor '+(size-1)+'(?:\\D|$)')}).count(),1);
  const detail_ms=Math.round(await page.evaluate(()=>performance.now())-before);
  // Filtering reuses the immutable projection but must preserve evidence.
  const form=page.locator('[data-console-pane="reuse"] [data-cohort-filters]');
  await form.locator('[name="sn"]').fill('SYNTHETIC-PCBA-0');await form.getByRole('button',{name:'Filtrar',exact:true}).click();
  await page.locator('[data-cohort-kind="pcbas"][data-cohort-metric="observed"]').click();
  assert.equal(await rows.count(),size);
  samples.push({size,views,detail_ms,...await page.evaluate(()=>qa.stop())});
  console.log(JSON.stringify(samples.at(-1)));
 }
 assert.deepEqual(errors,[]);
 if(process.env.PERFORMANCE_OUTPUT)fs.writeFileSync(process.env.PERFORMANCE_OUTPUT,JSON.stringify({physical:'PENDING',samples},null,2));
 console.log('GREEN synthetic: nine views; sizes='+samples.map(s=>s.size).join(',')+'; complete historical rows and actors retained');
}catch(error){
 console.log('SYNTHETIC DEBUG',JSON.stringify({errors,metrics:await page.locator('[data-cohort-metric]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.cohortKind,n.dataset.cohortMetric])),pane:(await page.locator('[data-console-pane="reuse"]').innerHTML()).slice(0,2400)}));
 throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
