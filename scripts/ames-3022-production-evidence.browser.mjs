import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const fixture=JSON.parse(execFileSync(process.env.PYTHON_BIN||'python3',['scripts/agent-3022-production-evidence.test.py','--fixture'],{encoding:'utf8'}));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const harness=`import {normalizeCanonical} from '/ames/data/canonical.mjs';
import {buildDailyFailureRows,createDailyFailureAnalytics} from '/ames/daily-failure-analytics.mjs';
import {failureOccurrenceEvidence,renderFailureEvidenceInspector} from '/ames/console-failure-evidence.mjs';
import {renderSnTemporalProof,temporalProofForFailure} from '/ames/console-sn-temporal-proof.mjs';
import {filterProcessScope,createProcessConsoleView} from '/ames/console-specialized-views.mjs';
const f=${JSON.stringify(fixture)},snapshot=normalizeCanonical(f.after),old=normalizeCanonical(f.before),other=normalizeCanonical(f.other_line);
const store={read:line=>({snapshot:line===snapshot.line_id?snapshot:line===other.line_id?other:null})};
store.occurrences=({line_id})=>({rows:store.read(line_id)?.snapshot?.occurrences||[]});
const daily=createDailyFailureAnalytics(document.querySelector('#daily'),store);
const process=createProcessConsoleView(document.querySelector('#process'),store);
window.qa={show(lang,dark){document.documentElement.lang=lang;document.body.classList.toggle('dark',dark);
const rows=buildDailyFailureRows(store),contexts=snapshot.process_timeline.contexts;
this.rows=rows;this.proven=rows.filter(r=>r.production_evidence_proven).length;
this.scope=filterProcessScope(contexts,[]).contexts.filter(r=>r.production_evidence_proven).length;
this.oldProven=buildDailyFailureRows({read:line=>({snapshot:line===old.line_id?old:null})}).filter(r=>r.production_evidence_proven).length;
this.agree=snapshot.occurrences.every(o=>{const expected=rows.find(r=>r.pcba===o.pcba_sn&&r.defect_time===o.defect_time).production_evidence_proven;
return failureOccurrenceEvidence(snapshot,o).production.trusted===expected&&temporalProofForFailure(o,{local_snapshot:{process_contexts:contexts}},o.pcba_sn).production.trusted===expected;});
daily.render();process.render();this.select('GOOD',0,lang);},select(sn,index=0,lang=document.documentElement.lang){
const o=snapshot.occurrences.filter(r=>r.pcba_sn===sn).sort((a,b)=>a.defect_time.localeCompare(b.defect_time))[index];
document.querySelector('#failure').innerHTML=renderFailureEvidenceInspector(failureOccurrenceEvidence(snapshot,o),lang,{snapshot});
document.querySelector('#sn').innerHTML=renderSnTemporalProof({current:o,current_pcba:sn,own_history:[]},{local_snapshot:{process_contexts:snapshot.process_timeline.contexts}},lang);
}};qa.show('pt-BR',false);`;
const root=process.cwd(),server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://local').pathname;
 if(name==='/'){res.setHeader('content-type','text/html');return res.end('<html lang="pt-BR"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/ames/console-theme.css"><link rel="stylesheet" href="/ames/console-improvements.css"><body><main class="ames-legacy-shell"><section id="daily"></section><section id="failure"></section><section id="sn"></section><section id="process"></section></main><script type="module" src="/qa.mjs"></script></body></html>');}
 if(name==='/qa.mjs'){res.setHeader('content-type','text/javascript');return res.end(harness);}
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>!!window.qa);
 for(const lang of ['pt-BR','en-US'])for(const dark of [false,true]){
  await page.evaluate(({lang,dark})=>qa.show(lang,dark),{lang,dark});
  assert.deepEqual(await page.evaluate(()=>({proven:qa.proven,process:qa.scope,old:qa.oldProven,agree:qa.agree})),{proven:3,process:3,old:0,agree:true});
  await page.locator('#daily [data-dfa-3022-missing] details').evaluate(el=>el.open=true);
  assert.match(await page.locator('#daily [data-dfa-3022-missing]').innerText(),/3\/13/);
  assert.match(await page.locator('#daily [data-dfa-3022-missing]').innerText(),lang==='en-US'?/explicit clocks conflict/:/relógios explícitos divergentes/);
  assert.match(await page.locator('#failure').innerText(),/09:00/);
  await page.evaluate(()=>qa.select('GOOD',1));
  assert.match(await page.locator('#failure').innerText(),/10:30/);
  assert.match(await page.locator('#sn').innerText(),/10:30/);
  for(const sn of ['CONFLICT','INVALID','TIMEZONE','EMPTY','RAW_ONLY','PARTIAL','UNQUERIED']){
   await page.evaluate(sn=>qa.select(sn),sn);
   assert.doesNotMatch(await page.locator('#failure').innerText(),/3022 · (?:Processo comprovado|Proven process)/);
  }
  const codes=await page.evaluate(()=>Object.fromEntries(qa.rows.map(r=>[r.pcba,r.generation_evidence_gap])));
  assert.match(codes.RAW_ONLY,/resposta salva/);assert.match(codes.PARTIAL,/consulta parcial/);
  const out=process.env.BROWSER_OUTPUT||'../3022-browser';fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,`production3022-${lang}-${dark?'dark':'light'}.png`),fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('3022 Chromium PASS: same disposable SQLite, exact occurrence times, cross-view parity, old revision, pending diagnostics, PT/EN × themes');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
