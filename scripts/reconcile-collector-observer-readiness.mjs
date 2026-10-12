import fs from 'node:fs';

const file='hardening/production-readiness.json';
const doc=JSON.parse(fs.readFileSync(file,'utf8'));
const gate=doc?.gates?.multi_collector_authority;
if(!gate||gate.priority!=='P1')throw new Error('multi_collector_authority gate missing or changed');
if(!['partial_fence_metadata_green_enforcement_not_active','partial_observe_only_identity_and_lease_green_enforcement_not_active'].includes(gate.status))throw new Error(`unexpected multi_collector_authority status: ${gate.status}`);

const green=[...(gate.green||[])];
const evidence=[...(gate.evidence||[])];
const runs=[...(gate.full_ci_runs||[])];
const add=(array,value)=>{if(!array.includes(value))array.push(value);};

for(const item of [
  'local hardened agent exposes a stable random workstation identity that the browser validates before storing in session state',
  'browser workstation identity state retains only schema, workstation_id, stable and identity_kind; hostname, identity path and pairing token stay out',
  'legacy or malformed workstation identity leaves the current MES path explicitly unfenced without breaking connectivity',
  'read-only collector lease observer uses status only and exposes no claim, renew, takeover or release API',
  'matching lease ownership produces only a non-authoritative candidate fence because a Firestore read cannot prove request-time lease liveness',
  'held-by-other and read-failure observations do not expose remote collector identity or raw error detail and do not block the current unfenced publication path'
])add(green,item);

for(const item of [
  'ames/agent-client.mjs',
  'scripts/ames-agent-workstation-identity-client.test.mjs',
  'hardening/agent-workstation-identity-client-evidence.json',
  'ames/collector-lease-observer.mjs',
  'scripts/ames-collector-lease-observer.test.mjs',
  'hardening/collector-lease-observer-evidence.json'
])add(evidence,item);
for(const run of [38186194411,38186334738])add(runs,run);

const remove=new Set([
  'wire the live collector lease generation/workstation into collectorFenceForLine in an observe-only runtime path before any enforcement'
]);
let remaining=[...(gate.remaining||[])].filter(x=>!remove.has(x));
for(const item of [
  'instantiate the read-only collector lease observer in runtime diagnostics using the authenticated account plus validated workstation identity; do not claim or take over',
  'add a server-authoritative same-workstation lease confirmation/renew path that cannot acquire a vacant lease or take over another workstation, before any collectorFenceForLine runtime binding',
  'after server-authoritative confirmation is proven, wire only that confirmed fence into collectorFenceForLine while stale-publisher rejection remains disabled',
  'reject stale offline publisher only after two-workstation physical conflict/takeover/recovery scenarios are GREEN',
  'physical multi-PC same-line conflict and recovery test'
])if(!remaining.includes(item))remaining.push(item);

gate.status='partial_observe_only_identity_and_lease_green_enforcement_not_active';
gate.green=green;
gate.evidence=evidence;
gate.full_ci_runs=runs;
gate.remaining=remaining;

fs.writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({status:gate.status,enforcement:false,full_ci_runs:runs.slice(-4),remaining},null,2));
