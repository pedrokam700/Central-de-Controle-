import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {reuseTimelineFixture} from './fixtures/reuse-timeline.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const fixture=reuseTimelineFixture();
const harness=`import {mountReuseCohorts} from '/ames/console-reuse-cohorts.mjs';
const fixture=${JSON.stringify(fixture)};window.qa={calls:{repairs:0,operators:0},fixture};
qa.show=(lang='pt-BR',dark=false,mode='ok')=>{
 document.documentElement.lang=lang;document.body.classList.toggle('dark',dark);qa.calls={repairs:0,operators:0};
 mountReuseCohorts(document.querySelector('#root'),fixture.snapshot,{
 cachedRepairHistory:async()=>{qa.calls.repairs++;if(mode==='repair-error')throw Error('synthetic read failure');return mode==='long'?Array.from({length:23},(_,i)=>({...fixture.repairs[0],row_key:'R'+i,repair_comment:'Nota '+i})):fixture.repairs;},
 cached3022Operators:async()=>{qa.calls.operators++;if(mode==='operator-error')throw Error('synthetic read failure');return fixture.operators.map(e=>({...e,snapshot_id:Number(e.snapshot_id),source_id:undefined,snapshot_revision:undefined,operator_role:'observed_process_operator'}));}});
};qa.show();`;
const root=process.cwd(),server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://local').pathname;
 if(name==='/'){res.setHeader('content-type','text/html');return res.end('<html lang="pt-BR"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/ames/console-theme.css"><link rel="stylesheet" href="/ames/console-improvements.css"><body><main id="root" class="ames-legacy-shell" data-reuse-cohorts></main><script type="module" src="/qa.mjs"></script></body></html>');}
 if(name==='/qa.mjs'){res.setHeader('content-type','text/javascript');return res.end(harness);}
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('[data-cohort-kind="pcbas"][data-cohort-metric="observed"]').click();
 const detail=page.locator('details[data-cohort-row]').first();await detail.locator('summary').first().click();
 await page.waitForFunction(()=>qa.calls.repairs===1&&qa.calls.operators===1);
 await detail.locator('[data-timeline-coverage="3012"]').waitFor();
 assert.equal(await detail.locator('table').count(),1,'ONE operational timeline, no second 3012 table');
 assert.equal(await detail.locator('[data-reuse-timeline-row]').count(),8);
 for(const text of ['Reparadora Alfa','Reparador Beta','Operadora Gama','Autor histórico zero','Comentário completo Alfa','Comentário independente Beta <seguro>']){
  const element=detail.getByText(text,{exact:false}).first();assert.equal(await element.isVisible(),true,text);
 }
 const historical=detail.locator('[data-source-view="2114"]');
 for(const forbidden of ['Reparadora Alfa','Reparador Beta','Operadora Gama','Comentário completo Alfa'])assert.ok(!(await historical.allInnerTexts()).some(x=>x.includes(forbidden)),forbidden+' copied to 2114');
 await detail.locator('summary').first().click();await detail.locator('summary').first().click();
 await page.waitForTimeout(50);assert.deepEqual(await page.evaluate(()=>qa.calls),{repairs:1,operators:1});
 assert.deepEqual(errors,[]);
 const out=process.env.BROWSER_OUTPUT||'../issue85-browser';fs.mkdirSync(out,{recursive:true});
 await page.screenshot({path:path.join(out,'reuse-timeline-pt.png'),fullPage:true});
 for(const lang of ['pt-BR','en-US'])for(const dark of [false,true]){
  await page.evaluate(({lang,dark})=>qa.show(lang,dark),{lang,dark});
  await page.locator('[data-cohort-kind="pcbas"][data-cohort-metric="observed"]').click();
  const current=page.locator('details[data-cohort-row]').first();await current.locator('summary').first().click();
  await current.locator('[data-timeline-coverage="3012"]').waitFor();
  assert.equal(await current.locator('table').count(),1);assert.equal(await current.locator('[data-reuse-timeline-row]').count(),8);
  assert.equal(await current.locator('[data-reuse-history-timeline] details:not([data-event-proof])').count(),0,'operational names and comments remain visible');
  const text=await current.locator('[data-reuse-history-timeline]').innerText();
  assert.ok(!/\+\d/.test(text));assert.match(text,lang==='en-US'?/Person \/ role/i:/Técnico \/ papel/i);
  if(dark)assert.notEqual(await current.locator('th').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(245, 246, 248)');
  await page.screenshot({path:path.join(out,`reuse-timeline-${lang}-${dark?'dark':'light'}.png`),fullPage:true});
 }
 for(const [mode,expected] of [['repair-error',6],['operator-error',8]]){
  await page.evaluate(mode=>qa.show('pt-BR',false,mode),mode);
  await page.locator('[data-cohort-kind="pcbas"][data-cohort-metric="observed"]').click();
  const current=page.locator('details[data-cohort-row]').first();await current.locator('summary').first().click();
  const status=current.locator(`[data-timeline-coverage="${mode==='repair-error'?'3012':'3022'}"]`);await status.waitFor();
  assert.match(await status.innerText(),/indisponível.*preservadas/);
  assert.equal(await current.locator('[data-reuse-timeline-row]').count(),expected);
 }
 await page.evaluate(()=>qa.show('pt-BR',false,'long'));
 await page.locator('[data-cohort-kind="pcbas"][data-cohort-metric="observed"]').click();
 const long=page.locator('details[data-cohort-row]').first();await long.locator('summary').first().click();
 await long.locator('[data-timeline-coverage="3012"]').waitFor();
 assert.equal(await long.locator('[data-reuse-timeline-row]:visible').count(),20);
 await long.locator('[data-page-step="1"]').click();
 assert.equal(await long.locator('[data-reuse-timeline-row]:visible').count(),9);
 await long.locator('[data-page-step="-1"]').click();
 assert.equal(await long.locator('[data-reuse-timeline-row]:visible').count(),20);
 await page.evaluate(()=>qa.show());await page.locator('[data-cohort-kind="components"][data-cohort-metric="observed"]').click();
 const component=page.locator('details[data-cohort-row]').first();await component.locator('summary').first().click();
 await component.locator('[data-timeline-coverage="3012"]').waitFor();
 assert.equal(await component.locator('table').count(),1);
 assert.match(await component.locator('table').innerText(),/SYNTH-PCBA-OLD/);
 assert.match(await component.locator('table').innerText(),/Histórico não disponível/);
 assert.match(await component.locator('table').innerText(),/Vínculo 3074 · Y/);
 assert.deepEqual(errors,[]);
 console.log('U1b Chromium PASS: independent events, single table, PT/EN × themes, visible names/comments, cached reads, partial/error safety, multiple bound boards');
}finally{await browser.close();await new Promise(r=>server.close(r));}
