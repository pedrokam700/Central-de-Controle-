// Isolated native sprint smoke. Real shell entry functions + DOM/CSS + data store.
// Manual routine workflows and Auth/backend/collector are not executed here.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { productFixture } from './ames-fixtures.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const app=fs.readFileSync('app.js','utf8');
const extract=(a,b)=>{assert(app.includes(a)&&app.includes(b));return app.slice(app.indexOf(a),app.indexOf(b));};
const harness=`
import {createAmesStore,clearSessionData} from './ames/data/store.mjs';
import {createDailyView} from './ames/daily-view.mjs';
import {createCoraView} from './ames/cora-view.mjs';
import {MES_REASONING_RULES} from './ames/data/cora.mjs';
import {createOnboardingView,savedIntegrationMode} from './ames/onboarding-view.mjs';
const state={ames:createAmesStore(),workShifts:[{docId:'S1',name:'Turno manual A'}],routineExecutions:[{id:'MANUAL',status:'pending'}],activities:[{id:'TASK'}]};
let currentAuthUser={uid:'synthetic'},activeView='daily',currentLanguage='pt-BR',dailySelectedDate='2026-10-08',dailySelectedShiftId='S1';
${extract('    let dailyMesView;','    function renderDaily(){')}
${extract('    let coraMesView;','    function renderAIAnalysis(){')}
${extract('    let integrationView;','    function renderProfile()')}
const AI_SYSTEM_PROMPT='Test existing transport';
${extract('    function aiBuildPromptText(', '    function aiPageState(')}
${extract('let coraRoutePlaceholder = null;','function applyActiveView()')}
function show(view){activeView=view;if(view==='aiAnalysis')enterCoraRoute();else exitCoraRoute();applyCoraPageLayout(view==='aiAnalysis');for(const id of ['home','daily','profile','aiAnalysis'])document.querySelector('#'+id+'View').classList.toggle('hidden',id!==view);document.body.classList.toggle('cora-route-active',view==='aiAnalysis');document.body.classList.toggle('ai-focus-mode',view==='aiAnalysis');renderDailyMes();renderCoraMes();renderIntegration();}
${extract("    document.querySelector('[data-open-integration]')", "    document.querySelector('#failureOrigin')")}
document.querySelector('#accountScreen').classList.add('hidden');
document.querySelector('#dailyRoutineTimeline').innerHTML='<p>Rotina manual preservada</p>';
window.sprint={show,
replace(d){state.ames.replaceRemoteDocuments(d);renderDailyMes();renderCoraMes();},
replaceSilent(d){state.ames.replaceRemoteDocuments(d);},
date(d){dailySelectedDate=d;renderDailyMes();},
manual(){return JSON.stringify([state.routineExecutions,state.activities]);},
context(){return currentCoraMesContext();},
prompt(){return aiBuildPromptText({centralData:{mes:currentCoraMesContext()}});},
logout(){currentAuthUser=null;clearSessionData(state);dailyMesView?.clear();coraMesView?.clear();integrationView?.clear();renderIntegration();},
login(){currentAuthUser={uid:'next'};show('profile');}
};show('daily');
`;
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</html>','<script type="module" src="./sprint-harness.mjs"></script></html>');
const allowed=new Set(['mobile.css','ames/dashboard.css','ames/product.css','manifest.webmanifest',...fs.readdirSync('ames').filter(f=>f.endsWith('.mjs')).map(f=>'ames/'+f),...fs.readdirSync('ames/data').filter(f=>f.endsWith('.mjs')).map(f=>'ames/data/'+f),'ames/releases/latest/release.json']);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.replace(/^\/Central-de-Controle-\//,'');
  if(name==='index.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  if(name==='sprint-harness.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(harness);}
  if(!allowed.has(name)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'application/json');res.end(fs.readFileSync(name));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort();});
  await page.goto(`http://127.0.0.1:${server.address().port}/Central-de-Controle-/index.html`);await page.waitForFunction(()=>window.sprint);
  const a=productFixture(),b=productFixture('TAN10102',10);const manual=await page.evaluate(()=>sprint.manual());
  const replace=docs=>page.evaluate(d=>sprint.replace(d),docs),show=view=>page.evaluate(v=>sprint.show(v),view);
  await replace([a,b]);
  assert.equal(await page.locator('#dailyMesRecords .stat-value').innerText(),'60');
  await page.locator('#dailyMesProduct').selectOption('CPH2859V');assert.equal(await page.locator('#dailyMesRecords .stat-value').innerText(),'30');
  await page.evaluate(()=>sprint.date('2000-01-01'));
  assert.match(await page.locator('#dailyMes').innerText(),/2000-01-01.*Turno manual A/);
  assert.equal(await page.locator('#dailyMesRecords .stat-value').innerText(),'30');
  assert.match(await page.locator('#dailyMes').innerText(),/sem atribuí-lo a esta data ou turno/);
  await page.locator('#dailyMesRecords').click();
  await page.locator('#dailyMes [data-mes-trace]').first().focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#dailyMesTraceTitle').evaluate(el=>el===document.activeElement),true);
  const trace=page.locator('#dailyMes [data-trace-slot]:not([hidden])');
  assert.match(await trace.innerText(),/3074/);assert.match(await trace.innerText(),/PCBA SN e Material SN/);
  assert.match(await trace.innerText(),/event_time ≤ defect_time/);assert.equal(await trace.locator('.mes-record-list > li').count(),1);
  const corrected=productFixture();corrected.payload.defects[0].defect_desc='CORRECTED';
  await replace([corrected,b]);assert.equal(await page.locator('#dailyMes [data-trace-slot]:not([hidden])').count(),0);
  assert.equal(await page.locator('#dailyMesRecords').evaluate(el=>el===document.activeElement),true);
  await page.locator('#dailyMesRecords').click();await page.evaluate(d=>sprint.replaceSilent(d),[a,b]);
  await page.locator('#dailyMes [data-mes-trace]').first().click();assert.equal(await page.locator('#dailyMesEvidence').isVisible(),false);
  await page.locator('#dailyMesLine').selectOption('TAN10102');assert.equal(await page.locator('#dailyMesRecords .stat-value').innerText(),'10');
  assert.equal(await page.evaluate(()=>sprint.manual()),manual);assert.match(await page.locator('#dailyRoutineTimeline').innerText(),/Rotina manual preservada/);
  console.log('PASS: daily line/CPH/date boundaries, manual state preserved, trace semantics/keyboard/correction/race');

  await show('aiAnalysis');await page.locator('#coraMes summary').click();
  assert.equal((await page.evaluate(()=>sprint.context())).status,'not_selected');
  await page.locator('[data-cora-mes-include]').check();await page.locator('#coraMesProduct').selectOption('CPH2859V');
  let context=await page.evaluate(()=>sprint.context());assert.equal(context.included_rows,25);assert.equal(context.matched_rows,30);assert.equal(context.product,'CPH2859V');
  assert.deepEqual(context.human_confirmed_causes,[]);assert.match(await page.evaluate(()=>sprint.prompt()),/current_read_only/);
  await page.locator('#coraMesProduct').selectOption('CPH2859');context=await page.evaluate(()=>sprint.context());assert(context.facts.every(r=>r.product==='CPH2859'));
  await page.locator('#coraMesLine').selectOption('TAN10102');assert.equal((await page.evaluate(()=>sprint.context())).matched_rows,10);
  await replace([]);assert.equal((await page.evaluate(()=>sprint.context())).status,'unavailable');await replace([a,b]);
  console.log('PASS: CORA explicit scope, bounded structured prompt, no confirmed causes, missing snapshot');

  await show('home');await page.locator('[data-open-integration]').click();
  await page.waitForSelector('.mes-release');
  const release=JSON.parse(fs.readFileSync('ames/releases/latest/release.json','utf8'));
  assert.equal(await page.locator('.mes-release a').getAttribute('href'),release.download_url);
  assert.match(await page.locator('.mes-release').innerText(),new RegExp(release.sha256));
  await page.locator('#amesSetupCollector').click();assert.match(await page.locator('#amesIntegration').innerText(),/Coleta ainda não conectada/);
  assert.match(await page.locator('#amesIntegration').innerText(),/contrato de transporte/);
  await page.locator('#amesSetupViewer').click();await show('daily');await show('profile');
  assert.equal(await page.locator('#amesSetupViewer').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>localStorage.getItem('central.ames.integration-mode.v1')),'viewer');
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),['central.ames.integration-mode.v1']);
  console.log('PASS: onboarding manifest package/version/hash, collector blocked, viewer preference, Profile reentry');

  for(const width of [360,390,768,1280]){
    await page.setViewportSize({width,height:900});
    for(const [view,selector] of [['daily','#dailyMes'],['aiAnalysis','#coraMes'],['profile','#amesIntegration']]){
      await show(view);
      if(view==='daily'){
        await page.locator('#dailyMesLine').selectOption('TAN10101');await page.locator('#dailyMesRecords').click();
        await page.locator('#dailyMes [data-mes-trace]').first().click();
      }
      const overflow=await page.locator(selector).evaluate(root=>[root,...root.querySelectorAll('*')].filter(el=>el.getClientRects().length&&(el.getBoundingClientRect().left< -1||el.getBoundingClientRect().right>innerWidth+1||el.scrollWidth>el.clientWidth+2)).map(el=>el.id||el.tagName));
      assert.deepEqual(overflow,[],view+' overflow '+width);
      if(process.env.SPRINT_SCREENSHOTS){fs.mkdirSync(process.env.SPRINT_SCREENSHOTS,{recursive:true});await page.locator(selector).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.SPRINT_SCREENSHOTS,view+'-'+width+'.png')});}
    }
  }
  await page.setViewportSize({width:390,height:900});await page.evaluate(()=>document.documentElement.style.zoom='2');
  for(const [view,selector] of [['daily','#dailyMes'],['aiAnalysis','#coraMes'],['profile','#amesIntegration']]){
    await show(view);assert.deepEqual(await page.locator(selector).evaluate(root=>[root,...root.querySelectorAll('*')].filter(el=>el.getClientRects().length&&(el.getBoundingClientRect().right>innerWidth+1||el.scrollWidth>el.clientWidth+2)).map(el=>el.id||el.tagName)),[],view+' zoom 200%');
  }
  await page.evaluate(()=>document.documentElement.style.zoom='');
  await page.evaluate(()=>sprint.logout());assert.equal((await page.evaluate(()=>sprint.context())).status,'signed_out');
  for(const selector of ['#dailyMes','#coraMes','#amesIntegration'])assert.equal(await page.locator(selector).innerText(),'');
  await page.route('**/ames/releases/latest/release.json',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.evaluate(()=>sprint.login());await page.waitForSelector('[data-release-retry]');assert.equal(await page.locator('.mes-release a').count(),0);
  await page.unroute('**/ames/releases/latest/release.json');await page.locator('[data-release-retry]').click();await page.waitForSelector('.mes-release');
  // Late release response after logout must not repopulate a cleared session.
  await page.evaluate(()=>sprint.logout());let releaseResponse;
  await page.route('**/ames/releases/latest/release.json',async route=>{await new Promise(resolve=>releaseResponse=resolve);await route.fulfill({json:release}).catch(()=>{});});
  await page.evaluate(()=>sprint.login());await page.waitForTimeout(100);await page.evaluate(()=>sprint.logout());releaseResponse?.();await page.waitForTimeout(100);
  assert.equal(await page.locator('#amesIntegration').innerText(),'');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: 360/390/768/1280 + zoom 200%, logout, invalid manifest/retry and late async response');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
