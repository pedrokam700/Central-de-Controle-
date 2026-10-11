import fs from 'node:fs';

const file='hardening/production-readiness.json';
const doc=JSON.parse(fs.readFileSync(file,'utf8'));
const gate=doc?.gates?.multi_collector_authority;
if(!gate||gate.priority!=='P1')throw new Error('multi_collector_authority gate missing or changed');
if(gate.status!=='partial_groundwork_not_enforced')throw new Error(`unexpected multi_collector_authority status: ${gate.status}`);

const green=[...(gate.green||[])];
const evidence=[...(gate.evidence||[])];
const runs=[...(gate.full_ci_runs||[])];
const add=(array,value)=>{if(!array.includes(value))array.push(value);};

for(const item of [
  'publication fence contract validates exact line, owner, workstation, generation and deterministic fencing token',
  'MES publication can carry optional collector_fence metadata while the default unfenced runtime remains backward-compatible',
  'collector generation participates in fenced publication identity so takeover generations cannot silently reuse the same queued publication id',
  'optional collectorFenceForLine recaptures unchanged MES content when collector authority generation changes',
  'publication fence classifies current, stale, unknown and unfenced states without activating transport enforcement',
  'offline shell precaches the publication-fence dependency chain including operational registry and collector authority'
])add(green,item);

for(const item of [
  'ames/data/publication-fence.mjs',
  'ames/sync.mjs',
  'scripts/ames-publication-fence.test.mjs',
  'sw.js',
  'hardening/mes-publication-fence-groundwork-evidence.json'
])add(evidence,item);
add(runs,38185679744);

const remaining=[...(gate.remaining||[])];
const required=[
  'do not enforce lease on amesUsers/amesTeamLines publication until conflict scenarios are physically proven',
  'bind generation/workstation fence to MES head publication',
  'reject stale offline publisher after another workstation takes the line',
  'physical multi-PC same-line conflict and recovery test'
];
for(const item of required)if(!remaining.includes(item))throw new Error(`expected remaining blocker changed: ${item}`);
const nextRemaining=remaining.filter(x=>x!=='bind generation/workstation fence to MES head publication');
const runtimeBinding='wire the live collector lease generation/workstation into collectorFenceForLine in an observe-only runtime path before any enforcement';
if(!nextRemaining.includes(runtimeBinding))nextRemaining.splice(1,0,runtimeBinding);

gate.status='partial_fence_metadata_green_enforcement_not_active';
gate.green=green;
gate.evidence=evidence;
gate.full_ci_runs=runs;
gate.remaining=nextRemaining;

fs.writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({
  status:gate.status,
  full_ci_run:38185679744,
  enforcement:false,
  remaining:gate.remaining
},null,2));
