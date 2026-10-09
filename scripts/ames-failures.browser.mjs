// Isolated real Falhas shell + store/read renderer with synthetic data. No Auth/Firebase.
// Optional PLAYWRIGHT_MODULE, BROWSER_CHANNEL, FAILURES_SCREENSHOTS.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { productFixture } from './ames-fixtures.mjs';

const { chromium }=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const app=fs.readFileSync('app.js','utf8');
const extract=(start,end)=>{assert(app.includes(start)&&app.includes(end));return app.slice(app.indexOf(start),app.indexOf(end));};
const harness=`
import { createAmesStore,clearSessionData } from './ames/data/store.mjs';
import { createOccurrenceView } from './ames/occurrence-view.mjs';
import { escapeHtml as esc } from './ames/evidence-view.mjs';
const state={ames:createAmesStore(),products:[],reports:Array.from({length:26},(_,i)=>({id:'R'+i,product:'CPH2859V',issue:'Manual report',linha:'TAN10101',sourceOperationalFailureId:i===0?'F1':''})),operationalFailures:[{id:'F1',product:'CPH2859V',linha:'TAN10101',issue:'Manual case',pcba_sn:'SYNTHETIC-PCBA-0',defect_code:'D2',convertedToReportId:'R0'}]};
let currentAuthUser={uid:'synthetic'},activeView='operations',currentLanguage='pt-BR';
const ordered=xs=>xs,formatDate=x=>String(x||''),chip=x=>esc(x),operationalStatus=r=>r.status||'pendente';
const productDisplayCode=x=>String(x||''),failureProductCodes=r=>[r.product].filter(Boolean),failureScopeSummary=r=>r.product||'Sem produto';
function renderRecurrenceRadar(){} // Existing manual-only radar is outside this isolated smoke.
${extract('    function failureClassificationLabel(', '    const recurrenceStopWords=')}
${extract('    let failuresMesView;', '    function activityRow(')}
${extract("    document.querySelector('#failureOrigin')?.addEventListener", "    document.querySelectorAll('.close-confirm')")}
window.manualOpened=[];
document.addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(b)window.manualOpened.push(b.dataset.id);});
document.querySelector('#accountScreen').classList.add('hidden');
document.querySelector('#homeView').classList.add('hidden');
document.querySelector('#operationsView').classList.remove('hidden');
window.failureTest={
replace(docs){state.ames.replaceRemoteDocuments(docs);renderFailuresMes();},
replaceSilent(docs){state.ames.replaceRemoteDocuments(docs);},
render(){renderFailuresMes();},
manual(){return JSON.stringify([state.reports,state.operationalFailures]);},
logout(){clearSessionData(state);failuresMesView?.clear();manualReportPage=0;document.querySelector('#failureOrigin').value='all';currentAuthUser=null;renderOperations();}
};
renderOperations();
`;
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace('</html>','<script type="module" src="./failures-test-harness.mjs"></script></html>');
const allowed=new Set(['mobile.css','ames/dashboard.css','ames/product.css','ames/occurrence-view.mjs','ames/trace-view.mjs','ames/data/trace.mjs','ames/evidence-view.mjs','ames/data/contract.mjs','ames/data/store.mjs','ames/data/dashboard.mjs','ames/data/failures.mjs','manifest.webmanifest']);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.replace(/^\/Central-de-Controle-\//,'');
  if(name==='index.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  if(name==='failures-test-harness.mjs'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(harness);}
  if(!allowed.has(name)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'application/json');res.end(fs.readFileSync(name));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  const external=[];await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort();});
  await page.goto(`http://127.0.0.1:${server.address().port}/Central-de-Controle-/index.html`);
  await page.waitForFunction(()=>window.failureTest);
  const manual=await page.evaluate(()=>window.failureTest.manual());
  const storage=await page.evaluate(()=>[JSON.stringify(localStorage),JSON.stringify(sessionStorage)]);
  assert.equal(await page.locator('#opTotalCount').innerText(),'1');
  assert.equal(await page.locator('#opRows tr').count(),1);
  assert.equal(await page.locator('#failureMesRecords').isDisabled(),true);
  const a=productFixture(),b=productFixture('TAN10102',10);
  a.payload.defects[0].defect_desc='<img src=x onerror="window.INJECTED=true">';
  a.payload.defects[0].pcba_sn='LONG-SYNTHETIC-SN-'.repeat(20);
  const replace=docs=>page.evaluate(docs=>window.failureTest.replace(docs),docs);
  await replace([a,b]);
  assert.equal(await page.locator('#failureMesRecords .stat-value').innerText(),'60');
  assert.equal(await page.locator('#opTotalCount').innerText(),'1');
  assert.match(await page.locator('#failuresMes').innerText(),/Cobertura parcial/);
  assert.match(await page.locator('#failuresMes').innerText(),/Sem ID durável/);
  assert.equal(await page.locator('#failuresMes [data-id], #failuresMes [data-op-id]').count(),0);
  assert.deepEqual(await page.locator('#failureOrigin option').allTextContents(),['Manual e MES','Manual','MES']);
  await page.locator('#failureOrigin').selectOption('manual');
  assert.equal(await page.locator('#failuresMes').isVisible(),false);
  await page.locator('.failure-manual-reports summary').click();
  assert.equal(await page.locator('#failureManualReports button').count(),25);
  await page.locator('#failureManualReports button').first().click();
  assert.deepEqual(await page.evaluate(()=>window.manualOpened),['R0']);
  await page.locator('#failureReportNext').click();
  assert.equal(await page.locator('#failureManualReports button').count(),1);
  assert.equal(await page.locator('#failureManualReports').evaluate(el=>el===document.activeElement),true);
  await page.locator('#failureOrigin').selectOption('mes');
  assert.equal(await page.locator('#failureManual').isVisible(),false);
  await page.locator('#failureOrigin').selectOption('all');
  assert.equal(await page.locator('#failureManual').isVisible(),true);
  console.log('PASS: Manual/MES coexist, counts independent, report pagination/open action, origin filter without Ambos');

  await page.locator('#failureMesRecords').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#failureMesEvidenceTitle').evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.locator('#failuresMes .mes-record-list li').count(),25);
  assert.equal(await page.locator('#failuresMes img').count(),0);
  await page.locator('#failureMesNext').click();
  assert.match(await page.locator('#failuresMes .mes-record-list li').first().innerText(),/SYNTHETIC-PCBA-25/);
  await page.locator('#failureMesProduct').selectOption('CPH2859V');
  assert.equal(await page.locator('#failureMesRecords .stat-value').innerText(),'30');
  await page.locator('#failureMesRecords').click();
  assert(!(await page.locator('#failuresMes .mes-record-list dd').allTextContents()).includes('CPH2859'));
  await page.locator('#failureMesProduct').selectOption('CPH2859');
  await page.locator('#failureMesRecords').click();
  assert(!(await page.locator('#failuresMes .mes-record-list dd').allTextContents()).includes('CPH2859V'));
  await page.locator('#failureMesLine').selectOption('TAN10102');
  assert.equal(await page.locator('#failureMesProduct').inputValue(),'');
  assert.equal(await page.locator('#failureMesRecords .stat-value').innerText(),'10');
  await page.locator('#failureMesRecords').click();
  assert.match(await page.locator('#failureMesEvidence').innerText(),/TAN10102/);
  assert.doesNotMatch(await page.locator('#failureMesEvidence').innerText(),/TAN10101/);
  await page.locator('#failureMesLine').selectOption('TAN10103');
  assert.equal(await page.locator('#failureMesRecords').isDisabled(),true);
  console.log('PASS: CPH2859 vs CPH2859V, line-required SN context, pagination and keyboard, escaped evidence');

  await page.locator('#failureMesLine').selectOption('TAN10101');
  await page.locator('#failureMesRecords').click();
  const correction=productFixture();correction.payload.defects[0].defect_desc='CORRECTED SAME ID';
  await replace([correction,b]);
  assert.equal(await page.locator('#failureMesEvidence').isVisible(),false);
  assert.equal(await page.locator('#failureMesRecords').evaluate(el=>el===document.activeElement),true);
  await page.locator('#failureMesRecords').click();
  assert.match(await page.locator('#failureMesEvidence').innerText(),/CORRECTED SAME ID/);
  assert.equal(await page.evaluate(()=>{const el=document.querySelector('#failureMesRecords');window.failureTest.render();return el===document.querySelector('#failureMesRecords');}),true);
  await page.locator('#failureMesRecords').click();
  await page.evaluate(docs=>window.failureTest.replaceSilent(docs),[a,b]);
  await page.locator('#failureMesRecords').click();
  assert.equal(await page.locator('#failureMesEvidence').isVisible(),false);
  await page.locator('#failureMesRecords').click();
  await page.locator('#failureOrigin').selectOption('manual');
  await replace([correction,b]);
  await page.locator('#failureOrigin').selectOption('mes');
  assert.equal(await page.locator('#failureMesEvidence').isVisible(),false);
  await replace([a,b]);await page.locator('#failureMesRecords').click();
  await page.locator('#failureOrigin').selectOption('all');
  console.log('PASS: replacement/correction/race/hidden-origin update invalidates details; unchanged read skips DOM');

  for(const width of [360,390,768,1280]){
    await page.setViewportSize({width,height:900});await page.evaluate(()=>window.scrollTo(0,0));
    if(width<=860)await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
    const overflow=await page.locator('#operationsView').evaluate(root=>[...root.querySelectorAll('#failuresMes *, .failure-manual-reports, .failure-manual-reports *')].filter(el=>el.getClientRects().length&&(el.getBoundingClientRect().left< -1||el.getBoundingClientRect().right>innerWidth+1||el.scrollWidth>el.clientWidth+2)).map(el=>el.id||el.tagName));
    assert.deepEqual(overflow,[],`MES overflow ${width}`);
    assert.equal(await page.locator('#failureOrigin').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+5,r.top+r.height/2));}),true);
    if(process.env.FAILURES_SCREENSHOTS){fs.mkdirSync(process.env.FAILURES_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.FAILURES_SCREENSHOTS,`failures-${width}.png`)});}
  }
  await page.setViewportSize({width:390,height:900});await page.evaluate(()=>{document.documentElement.style.zoom='2';});
  assert.deepEqual(await page.locator('#operationsView').evaluate(root=>[...root.querySelectorAll('#failuresMes *, .failure-manual-reports, .failure-manual-reports *')].filter(el=>el.getClientRects().length&&(el.getBoundingClientRect().right>innerWidth+1||el.scrollWidth>el.clientWidth+2)).map(el=>el.id||el.tagName)),[]);
  await page.evaluate(()=>{document.documentElement.style.zoom='';});
  assert.equal(await page.evaluate(()=>window.failureTest.manual()),manual);
  assert.deepEqual(await page.evaluate(()=>[JSON.stringify(localStorage),JSON.stringify(sessionStorage)]),storage);
  assert.equal(await page.evaluate(()=>Boolean(window.INJECTED)),false);
  await replace([]);assert.equal(await page.locator('#failureMesRecords').isDisabled(),true);
  await replace([a,b]);await page.locator('#failureMesRecords').click();
  await page.evaluate(()=>window.failureTest.logout());
  assert.equal(await page.locator('#failuresMes').innerText(),'');assert.equal(await page.locator('#opRows tr').count(),0);
  assert.equal(await page.locator('#failureManualReports button').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: mobile 360/390/768/1280 and zoom 200%, no persisted links/writes/conversions, deletion/logout');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
