import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
function fixture(line,date,source){
 const p=canonicalAgentFixture(productFixture(line,77));p.source_id=source;p.snapshot_id=line+date;p.summary.snapshot_id=p.snapshot_id;
 p.summary.period={mode:'today',start_at:date+'T07:00',end_at:date==='2026-10-19'?'2026-10-20T07:00':date+'T17:30'};
 p.collected_at=date==='2026-10-19'?'2026-10-20T20:29:07Z':'2026-10-20T20:30:09Z';p.summary.collected_at=p.collected_at;
 p.summary.fpy=94.46;p.summary.check_fpy=96.47;p.summary.quantity=1390;
 p.datasets.defects.forEach((r,i)=>{r.snapshot_id=p.snapshot_id;r.product_model=r.product='CPH2819BR';r.defect_time=date+'T12:00:00-03:00';r.defect_code=i<10?'JG07-SX94':i<15?'JG13-DC001':i<18?'GN03-DL14':i<40?'F1_9999':'OTHER-'+i;r.defect_desc=i<40?(i>=18?'Standard Error':'Synthetic defect'):'Other defect '+i;});return p;
}
const rows=[fixture('TAN10102','2026-10-19','96620cb5-test'),fixture('TAN10103','2026-10-20','10361ff7-test')];
const harness=`
import {createAmesStore} from './ames/data/store.mjs';
import {createConsoleView} from './ames/console-view.mjs';
let clock=Date.parse('2026-10-20T23:00Z'),rows=${JSON.stringify(rows)},mutations=0;
const store=createAmesStore({now:()=>clock});store.updateContext({line_id:'TAN10102'});
const history={list:async line=>rows.filter(p=>p.line_id===line).map(p=>({line_id:p.line_id,source_id:p.source_id,snapshot_id:p.snapshot_id,snapshot_revision:1,collected_at:p.collected_at,period_start:p.summary.period.start_at,period_end:p.summary.period.end_at,history_source:'shared'})),open:async e=>rows.find(p=>p.source_id===e.source_id&&p.snapshot_id===e.snapshot_id)};
const client={collect:async()=>mutations++,refresh:async()=>{},clear(){},savedSnHistory:async()=>({items:[]}),canOpenOfficial:()=>false,canPairFromOfficial:()=>false};
const view=createConsoleView(document.querySelector('#mesConsole'),store,{agentClient:client,history});
document.querySelectorAll('.page').forEach(el=>el.classList.add('hidden'));document.querySelector('#mesConsoleView').classList.remove('hidden');document.querySelector('#accountScreen')?.classList.add('hidden');
window.qa={store,view,rows,clock:v=>clock=Date.parse(v),mutations:()=>mutations};view.render();
`;
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'<script type="module" src="/capture-harness.mjs"></script>';
const root=process.cwd(),server=http.createServer((req,res)=>{
 const url=decodeURIComponent((req.url||'/').split('?')[0]).replace(/^\/Central-de-Controle-\//,'/');
 if(url==='/capture-harness.mjs'){res.setHeader('Content-Type','text/javascript');res.end(harness);return;}
 if(url==='/'||url==='/index.html'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>window.qa?.store.agent().period_read?.status==='ready');
 assert.equal(await page.evaluate(()=>qa.store.readingPeriod().mode),'latest');
 assert.match(await page.locator('[data-capture-provenance]').innerText(),/19\/10\/2026/);
 assert.match(await page.locator('.ames-line-summary').innerText(),/94.46%/);
 await page.locator('[data-console-view=top3]').click();
 assert.equal(await page.locator('[data-daily-top3-defect]').count(),3);
 assert.match(await page.locator('[data-target-ranking-excluded]').innerText(),/^22 /);
 assert.match(await page.locator('[data-top3-main]').innerText(),/77/);
 // Stale date from the newer line must be cleared via the input event.
 await page.locator('[data-dfa=from]').fill('2026-10-20');await page.locator('[data-dfa=from]').dispatchEvent('input');
 await page.evaluate(()=>{qa.store.updateContext({period:null});qa.view.render();});
 await page.locator('[data-daily-top3-defect="JG07-SX94"]').click();
 await page.waitForFunction(()=>!!document.querySelector('[data-top3-analytics] .ames-dfa-rank-item[open]'));
 assert.match(await page.locator('[data-top3-analytics] .ames-dfa-rank-item[open]').innerText(),/JG07-SX94/);
 assert.equal(await page.locator('[data-daily-top3-defect]').count(),3);
 await page.locator('[data-daily-summary-line]').selectOption('TAN10103');
 await page.locator('[data-daily-top3-defect="JG07-SX94"]').click();await page.waitForFunction(()=>!!document.querySelector('.ames-dfa-rank-item[open]'));
 await page.locator('[data-console-view=reuse]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-console-pane=reuse] [data-history-day]').length===92);
 await page.locator('[data-console-pane=reuse] [data-history-chart-metric]').selectOption('observed_failures');
 await page.locator('[data-console-pane=reuse] [data-history-chart-point]').first().click();
 assert.equal(await page.locator('[data-history-population-detail]').count(),1);
 await page.locator('[data-console-view=monitor]').click();await page.locator('[data-line-tab=TAN10102]').click();
 await page.locator('[data-read-period=today]').click();await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10102').snapshot),null);
 await page.locator('[data-read-period=latest]').click();await page.waitForFunction(()=>!!qa.store.read('TAN10102').snapshot);
 await page.evaluate(()=>{qa.clock('2026-10-21T10:00Z');qa.store.selectReadingPeriod('latest');qa.view.render();});
 assert.match(await page.locator('[data-capture-provenance]').innerText(),/19\/10\/2026/);
 await page.locator('[data-read-period=today]').click();await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');assert.equal(await page.evaluate(()=>qa.store.read('TAN10102').snapshot),null);
 await page.locator('[data-console-view=sn]').click();assert.match(await page.locator('[data-sn-source-health]').innerText(),/Não consultado/);assert.doesNotMatch(await page.locator('[data-sn-source-health]').innerText(),/Aguardando/);
 assert.equal(await page.evaluate(()=>qa.mutations()),0);assert.deepEqual(errors,[]);
 console.log('PASS: screenshot 77/22/Top3 both lines, latest default, Today isolation, 07:00 rollover, automatic 92-day trend/drilldown, explicit SN session; no MES calls');
}finally{await browser.close();await new Promise(r=>server.close(r));}
