import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const payloads=['TAN10101','TAN10102'].map((line,index)=>{
  const payload=canonicalAgentFixture(productFixture(line,4+index));
  payload.snapshot_id=`CTX-${index+1}`;payload.summary.snapshot_id=payload.snapshot_id;
  for(const rows of Object.values(payload.datasets))for(const row of rows)row.snapshot_id=payload.snapshot_id;
  return payload;
});
const harness=`
import {createAmesStore} from './ames/data/store.mjs';
import {createConsoleView} from './ames/console-view.mjs';
const store=createAmesStore();let view;
store.replaceSyncedSnapshots(${JSON.stringify(payloads)});
function mount(){view?.clear();view=createConsoleView(document.querySelector('#mesConsole'),store,{locale:()=>document.documentElement.lang||'pt-BR',transport:{fetcher:async()=>{throw Error('Failed to fetch');}},history:{list:async()=>[],open:async()=>null}});view.render();}
document.querySelectorAll('.page').forEach(el=>el.classList.add('hidden'));
document.querySelector('#mesConsoleView')?.classList.remove('hidden');
document.querySelector('#accountScreen')?.classList.add('hidden');
window.qa={store,mount};mount();
`;
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'<script type="module" src="/Central-de-Controle-/qa-context.mjs"></script>';
const root=process.cwd(),server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  if(pathname==='/release-build.json'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({sha:'c'.repeat(40),branch:'test'}));}
  if(pathname.endsWith('/qa-context.mjs')){res.setHeader('content-type','text/javascript');return res.end(harness);}
  if(pathname==='/Central-de-Controle-/'){res.setHeader('content-type','text/html');return res.end(html);}
  const file=path.resolve(root,pathname.replace(/^\/Central-de-Controle-\//,''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;return res.end();}
  res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'image/svg+xml');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/Central-de-Controle-/`);
  await page.waitForFunction(()=>!!window.qa);
  const sharedOnly=page.getByRole('button',{name:'Usar somente dados compartilhados',exact:true});
  if(await sharedOnly.count())await sharedOnly.click();

  await page.locator('[data-console-view=top3]').click();
  await page.locator('[data-daily-summary-line]').selectOption('TAN10102');
  await page.waitForFunction(()=>qa.store.context().line_id==='TAN10102');

  await page.locator('[data-console-view=failures]').click();
  await page.locator('[data-failure-line]').waitFor();
  assert.equal(await page.locator('[data-failure-line]').inputValue(),'TAN10102','Failures must inherit Line 2');

  await page.locator('[data-console-view=trace]').click();
  await page.locator('[data-trace-line]').waitFor();
  assert.equal(await page.locator('[data-trace-line]').inputValue(),'TAN10102','Trace evidence must inherit Line 2');

  await page.locator('[data-console-view=reuse]').click();
  const reuseLine2=page.locator('[data-reuse-line-tab="TAN10102"]');
  await reuseLine2.waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-reuse-line-tab="TAN10102"]')?.getAttribute('aria-selected')==='true');
  assert.equal(await reuseLine2.getAttribute('aria-selected'),'true','Reuse must inherit Line 2');

  await page.locator('[data-console-view=process]').click();
  const processLine=page.locator('[data-process-line]');
  await processLine.waitFor();
  assert.equal(await processLine.inputValue(),'TAN10102','Process / 3022 must inherit Line 2');
  await processLine.selectOption('TAN10101');
  await page.waitForFunction(()=>qa.store.context().line_id==='TAN10101');
  await processLine.selectOption('TAN10102');
  await page.waitForFunction(()=>qa.store.context().line_id==='TAN10102');

  await page.locator('[data-console-view=base]').click();
  const baseLine=page.locator('[data-base-line]');
  await baseLine.waitFor();
  assert.equal(await baseLine.inputValue(),'TAN10102','Base must inherit Line 2');
  await baseLine.selectOption('TAN10101');
  await page.waitForFunction(()=>qa.store.context().line_id==='TAN10101');
  await baseLine.selectOption('TAN10102');
  await page.waitForFunction(()=>qa.store.context().line_id==='TAN10102');

  await page.locator('[data-console-view=knowledge]').click();
  const knowledgeLine=page.locator('[data-knowledge-line]');
  await knowledgeLine.waitFor();
  assert.equal(await knowledgeLine.inputValue(),'TAN10102','CORA must inherit Line 2');
  await knowledgeLine.selectOption('TAN10101');
  await page.waitForFunction(()=>qa.store.context().line_id==='TAN10101');
  await page.locator('[data-console-view=top3]').click();
  assert.equal(await page.locator('[data-daily-summary-line]').inputValue(),'TAN10101','Top 3 must inherit a line explicitly changed in CORA');
  await page.locator('[data-daily-summary-line]').selectOption('TAN10102');
  await page.waitForFunction(()=>qa.store.context().line_id==='TAN10102');

  const shift=page.locator('[data-top3-analytics] [data-dfa="shift"]');
  await shift.waitFor();
  await shift.selectOption('1st Shift');
  await page.locator('[data-daily-shift-unclassified]').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-top3-analytics] [data-dfa-kpi="shift1"] .stat-value')?.textContent?.trim()==='—');
  const shift1Kpi=page.locator('[data-top3-analytics] [data-dfa-kpi="shift1"]');
  const shift2Kpi=page.locator('[data-top3-analytics] [data-dfa-kpi="shift2"]');
  assert.equal(await shift1Kpi.locator('.stat-value').innerText(),'—');
  assert.equal(await shift1Kpi.isDisabled(),true,'1st-shift drilldown must be disabled without 3022 classification');
  assert.equal(await shift2Kpi.isDisabled(),true,'2nd-shift drilldown must be disabled without 3022 classification');
  assert.equal(await shift1Kpi.getAttribute('aria-disabled'),'true');
  const matrixShiftButtons=page.locator('[data-top3-analytics] [data-matrix-line][data-matrix-shift]');
  if(await matrixShiftButtons.count())assert.equal(await matrixShiftButtons.first().isDisabled(),true,'Line × shift drilldown must be disabled without 3022 classification');
  const rankCount=await page.locator('[data-top3-analytics] .ames-dfa-rank-item').count();
  assert(rankCount>0,'unclassified shift must not erase the daily ranking');
  assert.equal(await page.evaluate(()=>qa.store.context().shift),'1st Shift');

  console.log('PASS: shared Line 2 survives Top 3 → Failures → Trace → Reuse → Process → Base → CORA; Process/Base/CORA write back to the same context; unclassified 3022 shift stays unknown, keeps ranking and disables false-zero drilldowns.');
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
