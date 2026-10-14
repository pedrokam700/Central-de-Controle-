// Real browser controls -> real client -> HTTP POST /deep-trace -> job polling.
// Only the MES HTTP service is synthetic; no collector or production data runs.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const payloads=['TAN10101','TAN10102'].map((line,i)=>{const f=productFixture(line,i?1:3);f.payload.defects.forEach((r,n)=>{r.defect_code=n===2?'GN02':'GN01-TX01';r.defect_desc=n===2?'Undefined error':'Earpiece: receiver noise/intermittent';});return canonicalAgentFixture(f);});
const harness=`
import {createAmesStore} from './ames/data/store.mjs';
import {createAgentClient} from './ames/agent-client.mjs';
import {createTraceConsoleView} from './ames/console-specialized-views.mjs';
import {withTraceSelectionHelper} from './ames/console-trace-scope.mjs';
import {createAutomationView} from './ames/automation-view.mjs';
const store=createAmesStore();store.replaceSyncedSnapshots(${JSON.stringify(payloads)});
store.updateAgent({status:'connected',capabilities:{schema:'central-ames-v2',process_timeline:true},config:{configured_lines:['TAN10101'],performance:'balanced'},job:{id:'old-job',status:'done',kind:'deep_trace',message:'Job anterior'}});
let trace,monitor;const render=()=>{trace?.render();monitor?.render();};
const client=createAgentClient(store,{agentToken:'synthetic-current-folder-token',changed:render,fetcher:(url,options)=>fetch(new URL(url).pathname,options)});
trace=withTraceSelectionHelper(createTraceConsoleView(document.querySelector('#trace'),store,client),document.querySelector('#trace'),store);
monitor=createAutomationView(document.querySelector('#monitor'),store,client);render();window.qa={store,render,client};
`;
let release,fail=false;const requests=[],polls=[];let jobs=[];
const result={scope:{trace_mode:'full'},stages:{'3074':'done','2114':'done','3022':'done'},deep_trace:{TAN10101:{scope:{records:3,unique_pcbas:2},enrichment:{material_rows:7,history_rows:4},'3022':{events:5,contexts:3,warnings:[]}},TAN10102:{skipped:true,reason:'Nenhuma falha no escopo selecionado'}}};
const base=process.cwd();
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://local');const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 if(u.pathname==='/api/v1/deep-trace'){
  let data='';for await(const chunk of req)data+=chunk;requests.push({body:JSON.parse(data),token:req.headers['x-central-agent-token']});
  if(fail)return json({error:'synthetic service error'},500);
  release=()=>json({id:'new-job',kind:'deep_trace',status:'queued',stage:'queued',message:'Na fila'});return;
 }
 if(u.pathname.startsWith('/api/v1/jobs/')){polls.push(u.pathname);return json(jobs.shift()||{id:'new-job',kind:'deep_trace',status:'done',stage:'done',result});}
 if(u.pathname==='/api/v1/v2/snapshots')return json({snapshots:[]});
 if(u.pathname==='/qa.mjs'){res.setHeader('content-type','text/javascript');return res.end(harness);}
 if(u.pathname==='/'){res.setHeader('content-type','text/html');return res.end('<html lang="pt-BR"><link rel="stylesheet" href="/ames/console-legacy.css"><body><main id="trace"></main><hr><main id="monitor"></main><script type="module" src="/qa.mjs"></script></body></html>');}
 const file=path.resolve(base,'.'+u.pathname);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':'text/css');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const out=process.env.BROWSER_OUTPUT||'../browser-evidence';fs.mkdirSync(out,{recursive:true});
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.qa);
 const trace=page.locator('#trace');
 assert.match(await trace.locator('[data-trace-code-helper]').innerText(),/GN01-TX01 — Earpiece: receiver noise\/intermittent — 3/);
 assert.match(await trace.locator('[data-trace-code-helper]').innerText(),/GN02 — Descrição não informada — 1/);
 await trace.locator('[name=lines][value=TAN10102]').uncheck();
 assert.match(await trace.locator('[data-trace-code-helper]').innerText(),/intermittent — 2/);
 await trace.locator('[name=lines][value=TAN10102]').check();
 assert.equal(await trace.locator('[name=max_failures]').isVisible(),false);
 assert.equal(await trace.locator('[name=max_failures]').inputValue(),'');
 assert.equal(await trace.locator('[name=codes]').isVisible(),false);
 await trace.locator('[data-trace-scope-mode=selected]').check();await trace.locator('[data-trace-run]').click();
 assert.match(await trace.locator('[data-trace-status]').innerText(),/Nenhuma coleta foi enviada/);assert.equal(requests.length,0);
 await trace.locator('[data-trace-code][value="GN01-TX01"]').check();
 jobs=['3074','2114','3022'].map(stage=>({id:'new-job',kind:'deep_trace',status:'running',stage,message:'TAN10101: '+stage,stage_progress:{[stage]:{line:'TAN10101',current:1,total:2,line_percent:50}}}));
 await trace.locator('[data-trace-run]').click();
 await page.waitForFunction(()=>document.querySelector('[data-trace-status]').textContent.includes('Iniciando rastreabilidade...'));
 await new Promise(r=>{const timer=setInterval(()=>{if(release){clearInterval(timer);r();}},10);});
 assert.equal(requests.length,1);assert.deepEqual(requests[0].body.defect_codes,['GN01-TX01']);assert.equal(requests[0].body.max_failures,0);assert.equal(requests[0].body.max_pcbas,0);assert.equal(requests[0].body.trace_mode,'full');assert.equal(requests[0].token,'synthetic-current-folder-token');release();
 await page.waitForFunction(()=>document.querySelector('[data-trace-status]').textContent.includes('Job new-job'));
 assert.doesNotMatch(await trace.locator('[data-trace-status]').innerText(),/old-job/);
 for(const stage of ['3074','2114','3022'])await page.waitForFunction(s=>window.qa.store.agent().job.stage===s,stage);
 await trace.locator('[data-trace-result]').waitFor();
 assert.match(await trace.locator('[data-trace-status]').innerText(),/3074 → 2114 → 3022/);
 assert.match(await trace.locator('[data-trace-result]').innerText(),/materiais no snapshot: 7/);
 assert.match(await trace.locator('[data-trace-result]').innerText(),/eventos coletados: 5/);
 assert(polls.length>=4);assert(polls.every(p=>p.endsWith('/new-job')));
 await page.screenshot({path:path.join(out,'trace-job-result-1920.png'),fullPage:true});
 fail=true;await page.locator('#monitor [data-agent-action=deep]').click();
 await page.waitForFunction(()=>document.querySelector('[data-agent-strip]').textContent.includes('HTTP 500'));
 assert.match(await page.locator('[data-agent-strip]').innerText(),/Job new-job/);
 assert.equal(requests.length,2);
 await trace.locator('[data-trace-run]').click();await page.waitForFunction(()=>document.querySelector('[data-trace-status]').textContent.includes('HTTP 500'));
 assert.equal(requests.length,3);assert.deepEqual(errors,[]);
 console.log('PASS: selected failures/counts, unlimited defaults, real click/POST/job/polling, stages/result, new errors visible with prior job in both views.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
