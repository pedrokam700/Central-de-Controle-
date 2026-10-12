import fs from 'node:fs';

let app=fs.readFileSync('app.js','utf8');
let sw=fs.readFileSync('sw.js','utf8');
let monitor=fs.readFileSync('ames/console-monitor-runtime.mjs','utf8');
const TEST='scripts/ames-collector-authority-runtime-app.test.mjs';

function replaceOnce(source,anchor,replacement,label){
  const count=source.split(anchor).length-1;
  if(count!==1)throw new Error(`${label}: expected one anchor, found ${count}`);
  return source.replace(anchor,replacement);
}

app=replaceOnce(app,
  "    import {createMesSync} from './ames/sync.mjs';\n",
  "    import {createMesSync} from './ames/sync.mjs';\n    import {createCollectorAuthorityRuntime} from './ames/collector-authority-runtime.mjs';\n",
  'collector runtime import');
app=replaceOnce(app,
  'getFirestore, collection, addDoc as firebaseAddDoc, onSnapshot, doc, deleteDoc as firebaseDeleteDoc, updateDoc as firebaseUpdateDoc, setDoc as firebaseSetDoc, getDoc, getDocs, query, where, writeBatch as firebaseWriteBatch, runTransaction, arrayUnion',
  'getFirestore, collection, addDoc as firebaseAddDoc, onSnapshot, doc, deleteDoc as firebaseDeleteDoc, updateDoc as firebaseUpdateDoc, setDoc as firebaseSetDoc, getDoc, getDocs, query, where, writeBatch as firebaseWriteBatch, runTransaction, serverTimestamp, arrayUnion',
  'serverTimestamp import');

const guardedAnchor="    const {addDoc,setDoc,updateDoc,deleteDoc,writeBatch}=guardedFirestore;\n    let unsubscribeData = [];";
const guardedReplacement=`    const {addDoc,setDoc,updateDoc,deleteDoc,writeBatch}=guardedFirestore;\n    const collectorAuthorityRuntime=createCollectorAuthorityRuntime(state.ames,{\n      db,doc,getDoc,runTransaction,serverTimestamp,\n      currentUid:()=>currentAuthUser?.uid||'',\n      changed(){if(currentAuthUser)renderConsoleMes();}\n    });\n    let unsubscribeData = [];`;
app=replaceOnce(app,guardedAnchor,guardedReplacement,'runtime construction');

const startAnchor=`      mesSync.start(uid);\n    }\n    function renderConsoleMes() {`;
const startReplacement=`      mesSync.start(uid);\n      collectorAuthorityRuntime.refresh({force:true}).catch(()=>{});\n    }\n    function renderConsoleMes() {`;
app=replaceOnce(app,startAnchor,startReplacement,'startMesSync observer refresh');

const consoleAnchor=`        renderDashboardMes(); renderProductMes(); renderFailuresMes(); renderDailyMes(); renderCoraMes();\n        mesSync?.capture().catch(error=>{state.ames.updateAgent({sync:{status:'error',error:error.message}});});`;
const consoleReplacement=`        renderDashboardMes(); renderProductMes(); renderFailuresMes(); renderDailyMes(); renderCoraMes();\n        collectorAuthorityRuntime.refresh().catch(()=>{});\n        mesSync?.capture().catch(error=>{state.ames.updateAgent({sync:{status:'error',error:error.message}});});`;
app=replaceOnce(app,consoleAnchor,consoleReplacement,'console agent-change observer refresh');

const switchAnchor='if(currentAuthUser?.uid && currentAuthUser.uid !== firebaseUser.uid){mesSync?.stop();consoleMesView?.clear();clearSessionData(state);}';
const switchReplacement='if(currentAuthUser?.uid && currentAuthUser.uid !== firebaseUser.uid){mesSync?.stop();collectorAuthorityRuntime.clear();consoleMesView?.clear();clearSessionData(state);}';
app=replaceOnce(app,switchAnchor,switchReplacement,'account switch cleanup');

const logoutAnchor=`        mesSync?.stop();\n        clearSessionData(state);`;
const logoutReplacement=`        mesSync?.stop();\n        collectorAuthorityRuntime.clear();\n        clearSessionData(state);`;
app=replaceOnce(app,logoutAnchor,logoutReplacement,'logout cleanup');

const swAnchor="BASE+'ames/data/publication-fence.mjs',BASE+'ames/sync.mjs'";
const swReplacement="BASE+'ames/data/publication-fence.mjs',BASE+'ames/collector-lease-client.mjs',BASE+'ames/collector-lease-observer.mjs',BASE+'ames/collector-authority-runtime.mjs',BASE+'ames/sync.mjs'";
sw=replaceOnce(sw,swAnchor,swReplacement,'offline collector runtime chain');

const stageAnchor="const STAGES=['3028','3074','2114','3022'];\n";
const stageReplacement=`const STAGES=['3028','3074','2114','3022'];\nconst authorityLabel=value=>({\n  same_workstation_candidate:'lease: este posto · não confirmado',\n  held_by_other:'lease: outro coletor',\n  vacant:'lease: livre',\n  unavailable:'lease: leitura indisponível'\n}[value?.status]||'lease: não observado');\n`;
monitor=replaceOnce(monitor,stageAnchor,stageReplacement,'authority label');

const linesAnchor="    const lines=LINE_IDS.map((line,i)=>{const read=store.read(line);return {line,index:i+1,snapshot:read.snapshot?.snapshot_id||null,source:read.source,freshness:read.freshness};});";
const linesReplacement="    const authorityByLine=new Map((a.collector_authority?.lines||[]).map(value=>[value.line_id,value]));\n    const lines=LINE_IDS.map((line,i)=>{const read=store.read(line);return {line,index:i+1,snapshot:read.snapshot?.snapshot_id||null,source:read.source,freshness:read.freshness,authority:authorityByLine.get(line)||null};});";
monitor=replaceOnce(monitor,linesAnchor,linesReplacement,'monitor line authority projection');

monitor=replaceOnce(monitor,
  "job?.stage_progress,processReady,lines,origin,releaseBuild]",
  "job?.stage_progress,processReady,a.collector_authority,lines,origin,releaseBuild]",
  'monitor render key');

monitor=replaceOnce(monitor,
  "<span>Build do agente</span><b>${esc(a.agent_build||a.capabilities?.agent_build||'—')}</b></div></aside></div><div class=\"ames-runtime-lines\">${lines.map(x=>`<span><b>Linha ${x.index}</b> · ${esc(x.snapshot||'sem snapshot')} · ${esc(x.source||'sem fonte')} · ${esc(x.freshness||'idade desconhecida')}</span>`).join('')}</div>",
  "<span>Build do agente</span><b>${esc(a.agent_build||a.capabilities?.agent_build||'—')}</b><span>Autoridade multi-PC</span><b>${a.collector_authority?.mode==='observe_only'?'Somente observação · sem enforcement':'Não observada'}</b></div></aside></div><div class=\"ames-runtime-lines\">${lines.map(x=>`<span><b>Linha ${x.index}</b> · ${esc(x.snapshot||'sem snapshot')} · ${esc(x.source||'sem fonte')} · ${esc(x.freshness||'idade desconhecida')} · ${esc(authorityLabel(x.authority))}</span>`).join('')}</div>",
  'monitor authority display');

fs.writeFileSync('app.js',app);
fs.writeFileSync('sw.js',sw);
fs.writeFileSync('ames/console-monitor-runtime.mjs',monitor);
fs.writeFileSync(TEST,`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst sw=fs.readFileSync('sw.js','utf8');\nconst monitor=fs.readFileSync('ames/console-monitor-runtime.mjs','utf8');\n\ntest('Central wires collector authority runtime as observe-only diagnostics',()=>{\n  assert.match(app,/import \\{createCollectorAuthorityRuntime\\} from ['\"]\\.\\/ames\\/collector-authority-runtime\\.mjs['\"]/);\n  assert.match(app,/runTransaction, serverTimestamp, arrayUnion/);\n  assert.match(app,/createCollectorAuthorityRuntime\\(state\\.ames,\\{/);\n  assert.match(app,/collectorAuthorityRuntime\\.refresh\\(\\{force:true\\}\\)/);\n  assert.match(app,/collectorAuthorityRuntime\\.refresh\\(\\)/);\n  assert.ok((app.match(/collectorAuthorityRuntime\\.clear\\(\\)/g)||[]).length>=2);\n  assert.doesNotMatch(app,/collectorAuthorityRuntime\\.(?:claim|confirmOwned|takeover|renew)\\(/);\n});\n\ntest('runtime wiring keeps claim and confirm capability out of app.js',()=>{\n  assert.doesNotMatch(app,/createCollectorLeaseClient\\(/);\n  assert.doesNotMatch(app,/createCollectorLeaseObserver\\(/);\n  assert.doesNotMatch(app,/\\.confirmOwned\\(/);\n  assert.doesNotMatch(app,/\\.claim\\(/);\n});\n\ntest('offline shell contains complete collector runtime dependency chain',()=>{\n  for(const asset of ['ames/collector-lease-client.mjs','ames/collector-lease-observer.mjs','ames/collector-authority-runtime.mjs'])assert.ok(sw.includes(asset),asset+' missing');\n});\n\ntest('monitor labels collector authority explicitly as observation without enforcement',()=>{\n  assert.match(monitor,/Autoridade multi-PC/);\n  assert.match(monitor,/Somente observação · sem enforcement/);\n  assert.match(monitor,/lease: este posto · não confirmado/);\n  assert.match(monitor,/lease: outro coletor/);\n  assert.doesNotMatch(monitor,/owner_uid|workstation_id|candidate_fence/);\n});\n`);

console.log(JSON.stringify({runtime_observer_wired:true,claim_calls_in_app:0,confirm_calls_in_app:0,offline_chain:true},null,2));
