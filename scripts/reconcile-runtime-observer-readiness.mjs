import fs from 'node:fs';
const file='hardening/production-readiness.json';
const doc=JSON.parse(fs.readFileSync(file,'utf8'));
const gate=doc?.gates?.multi_collector_authority;
if(!gate||gate.priority!=='P1'||!String(gate.status||'').startsWith('partial_'))throw new Error('multi_collector_authority gate changed unexpectedly');
const add=(arr,value)=>{if(!arr.includes(value))arr.push(value);};
const green=[...(gate.green||[])],evidence=[...(gate.evidence||[])],runs=[...(gate.full_ci_runs||[])];
for(const value of [
  'runtime collector authority observer is instantiated with authenticated UID, stable workstation identity and configured MES lines',
  'runtime observer stores only sanitized per-line status/reason and never retains candidate fence, remote UID or remote workstation identity',
  'runtime observer is throttled and performs no claim, confirm, takeover, renewal or serverTimestamp write',
  'Monitoramento displays collector authority diagnostics explicitly as observation-only with no enforcement',
  'account switch/logout clears collector authority runtime state and offline shell includes the full observer dependency chain'
])add(green,value);
for(const value of [
  'ames/collector-authority-runtime.mjs',
  'scripts/ames-collector-authority-runtime.test.mjs',
  'scripts/ames-collector-authority-runtime-app.test.mjs',
  'ames/console-monitor-runtime.mjs',
  'app.js',
  'hardening/collector-authority-runtime-evidence.json'
])add(evidence,value);
add(runs,38187026029);
let remaining=[...(gate.remaining||[])].filter(item=>!String(item).includes('instantiate the read-only collector lease observer in runtime diagnostics'));
for(const item of [
  'invoke confirmOwned only for same-workstation candidates in a separate gated runtime slice; vacant/other/unavailable observations must remain read-only',
  'wire only successful server-confirmed fences into collectorFenceForLine while stale-publisher rejection remains disabled',
  'reject stale offline publisher only after two-workstation physical conflict/takeover/recovery scenarios are GREEN',
  'physical multi-PC same-line conflict and recovery test'
])if(!remaining.includes(item))remaining.push(item);
gate.status='partial_runtime_observer_green_confirm_wiring_pending_enforcement_off';
gate.green=green;gate.evidence=evidence;gate.full_ci_runs=runs;gate.remaining=remaining;
fs.writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({status:gate.status,enforcement:false,full_ci_run:38187026029,remaining},null,2));
