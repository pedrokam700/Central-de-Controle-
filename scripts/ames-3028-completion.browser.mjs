// Real client polling -> real Console/store/controller -> DOM, synthetic HTTP.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const harness=`
import {createAmesStore} from './ames/data/store.mjs';
import {createAgentClient} from './ames/agent-client.mjs';
import {createConsoleView} from './ames/console-view.mjs';
import {createAutomationView} from './ames/automation-view.mjs';
import {SCHEDULER_POLICY} from './ames/data/agent-contract.mjs';
const line='TAN10101',store=createAmesStore({now:()=>Date.parse('2026-10-19T15:00:00Z')});
const make=(id,source)=>({schema:'central-ames-v2',schema_version:2,source_id:source,snapshot_id:id,snapshot_revision:1,content_hash:'hash-'+id,line_id:line,collected_at:'2026-10-19T15:00:00Z',
 summary:{line,snapshot_id:id,period:{mode:'previous_day',start_at:'2026-10-16T07:00',end_at:'2026-10-17T07:00'}},
 datasets:Object.fromEntries(['defects','pcba_history','material_reuse','history_contexts','process_timeline'].map(n=>[n,[]])),
 coverage:Object.fromEntries(['defects','pcba_history','material_reuse','history_contexts','process_timeline'].map(n=>[n,{stored_total:0,transport_complete:true,source_complete:false}])),capabilities:{}});
const remote=make(8,'shared-pc');let local=make(38,'local-pc');
const entry=(p,source)=>({line_id:line,source_id:p.source_id,snapshot_id:p.snapshot_id,snapshot_revision:p.snapshot_revision,content_hash:p.content_hash,collected_at:p.collected_at,period_start:p.summary.period.start_at,period_end:p.summary.period.end_at,history_source:source});
let visible=sessionStorage.getItem('synthetic-capture')==='saved',completed=false,queued=[],posts=0,historyReads=0;
const history={list:async l=>{historyReads++;return l===line?[entry(remote,'shared'),...(visible?[entry(local,'local')]:[])]:[];},open:async e=>e.source_id==='local-pc'?local:remote};
let view,automation;
const fetcher=async(url,options)=>{
 const key=new URL(url).pathname.replace('/api/v1/','');let value;
 if(key==='ready')value={ready:true};
 else if(key==='health')value={agent_version:'0.5.23',mes_scheduler:{policy:SCHEDULER_POLICY},engine_found:true};
 else if(key==='v2/capabilities')value={schema:'central-ames-v2',native_console:true,revision:true,cursor:true,source_id:'local-pc'};
 else if(key==='config')value={configured_lines:[line],timezone:'America/Sao_Paulo'};
 else if(key==='monitor')value={enabled:false};
 else if(key==='v2/snapshots'){if(completed){visible=true;sessionStorage.setItem('synthetic-capture','saved');}value={snapshots:[],scope:'today'};}
 else if(key==='runs'){posts++;value={id:'J',status:'queued'};}
 else if(key==='jobs/J'){completed=true;value={id:'J',kind:'analysis',status:'done',result:{snapshot_ids:{[line]:38},start_at:local.summary.period.start_at,end_at:local.summary.period.end_at}};}
 else throw Error('Unexpected request '+key);
 return {ok:true,json:async()=>structuredClone(value)};
};
const client=createAgentClient(store,{fetcher,schedule:fn=>{queued.push(fn);return fn;},unschedule:()=>{},changed:()=>{view?.render();automation?.render();}});
view=createConsoleView(document.querySelector('#mesConsole'),store,{agentClient:client,history,historyPreferenceScope:'synthetic-browser-user'});
automation=createAutomationView(document.querySelector('#automation'),store,client);
document.querySelectorAll('.page').forEach(e=>e.classList.add('hidden'));
document.querySelector('#mesConsoleView').classList.remove('hidden');document.querySelector('#accountScreen')?.classList.add('hidden');
await client.connect();view.render();automation.render();
window.qa={store,client,view,posts:()=>posts,reads:()=>historyReads,poll:()=>queued.shift()(),enrich:()=>{local={...local,snapshot_revision:2,content_hash:'enriched-r2'};}};
`;
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'<div id="automation"></div><script type="module" src="/Central-de-Controle-/qa.mjs"></script>';
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://local').pathname);
 if(name.endsWith('/qa.mjs')){res.setHeader('content-type','text/javascript');return res.end(harness);}
 if(name==='/Central-de-Controle-/'){res.setHeader('content-type','text/html');return res.end(html);}
 const file=path.resolve(root,name.replace(/^\/Central-de-Controle-\//,''));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;return res.end();}
 res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'application/json');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),page=await browser.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/Central-de-Controle-/');
 await page.waitForFunction(()=>!!window.qa);
 await page.locator('[data-read-period=previous]').click();
 await page.waitForFunction(()=>String(qa.store.read('TAN10101').snapshot?.snapshot_id)==='8');
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').source),'remote');
 await page.locator('#automation').evaluate(e=>e.style.cssText='position:fixed;inset:0;z-index:99999;background:white;overflow:auto');
 await page.locator('#automation [data-agent-action=previous_day]').click();
 await page.locator('#automation').evaluate(e=>e.style.display='none');
 await page.evaluate(()=>qa.poll());
 await page.waitForFunction(()=>String(qa.store.read('TAN10101').snapshot?.snapshot_id)==='38');
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').source),'local');
 assert.equal(await page.evaluate(()=>qa.posts()),1);
 assert(await page.evaluate(()=>qa.reads())>=6,'completion and post-refresh must reread history');
 await page.locator('[data-console-view=reuse]').click();
 await page.locator('[data-console-view=monitor]').click();
 assert.equal(await page.evaluate(()=>String(qa.store.read('TAN10101').snapshot.snapshot_id)),'38');
 // New enriched content with the SAME snapshot ID must be selected too.
 await page.evaluate(()=>{qa.enrich();qa.store.updateAgent({job:{id:'TRACE',kind:'deep_trace',status:'done',trace_receipt:{snapshot_ids:{TAN10101:38}}}});qa.view.render();});
 await page.waitForFunction(()=>qa.store.read('TAN10101').snapshot?.snapshot_revision===2);
 await page.reload();await page.waitForFunction(()=>!!window.qa);
 // Persisted source preference must reopen the saved local capture.
 await page.locator('[data-read-period=previous]').click();
 await page.waitForFunction(()=>qa.store.agent().period_read?.status!=='loading');
 assert.equal(await page.evaluate(()=>qa.posts()),0,'reload must not repeat collection');
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').source),'local');
 assert.deepEqual(errors,[]);
 console.log('PASS 3028 click -> polling -> delayed local index -> local revision -> navigation -> enriched r2; synthetic HTTP, no MES');
}catch(error){console.error('Synthetic state:',await page.evaluate(()=>({agent:qa.store.agent(),read:qa.store.read('TAN10101')})));throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));}
