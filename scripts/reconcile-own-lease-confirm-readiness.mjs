import fs from 'node:fs';

const file='hardening/production-readiness.json';
const doc=JSON.parse(fs.readFileSync(file,'utf8'));
const gate=doc?.gates?.multi_collector_authority;
if(!gate||gate.priority!=='P1')throw new Error('multi_collector_authority gate missing or changed');
if(!String(gate.status||'').startsWith('partial_'))throw new Error(`multi_collector_authority is no longer partial: ${gate.status}`);

const green=[...(gate.green||[])],evidence=[...(gate.evidence||[])],runs=[...(gate.full_ci_runs||[])];
const add=(arr,value)=>{if(!arr.includes(value))arr.push(value);};
for(const value of [
  'server-authoritative confirmOwned renews only an existing lease owned by the same authenticated account and validated workstation',
  'confirmOwned preserves generation and acquired_at and relies on Rules request.time acceptance of sameCollectorRenewal for liveness proof',
  'vacant, different-collector and expired/not-current leases never become authority through confirmOwned',
  'confirmOwned never retries as generation+1 takeover and contains no automatic takeover path',
  'legacy lease-client activation contract remains stable while the dormant confirmation capability is exposed separately'
])add(green,value);
for(const value of [
  'ames/collector-lease-client.mjs',
  'scripts/ames-collector-lease-confirm.test.mjs',
  'scripts/ames-collector-confirm-rules.test.mjs',
  'hardening/collector-own-lease-confirmation-evidence.json'
])add(evidence,value);
add(runs,38186650668);

let remaining=[...(gate.remaining||[])];
remaining=remaining.filter(item=>!String(item).includes('add a server-authoritative same-workstation lease confirmation/renew path'));
for(const item of [
  'instantiate the read-only collector lease observer in runtime diagnostics using the authenticated account plus validated workstation identity; do not claim or take over',
  'after runtime observer diagnostics are proven, invoke confirmOwned only for same-workstation candidates and feed only successful server-confirmed fences into collectorFenceForLine while stale-publisher rejection remains disabled',
  'reject stale offline publisher only after two-workstation physical conflict/takeover/recovery scenarios are GREEN',
  'physical multi-PC same-line conflict and recovery test'
])if(!remaining.includes(item))remaining.push(item);

gate.status='partial_server_confirm_green_runtime_observer_not_wired_enforcement_off';
gate.green=green;gate.evidence=evidence;gate.full_ci_runs=runs;gate.remaining=remaining;
fs.writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({status:gate.status,enforcement:false,full_ci_run:38186650668,remaining},null,2));
