import fs from 'node:fs';

const path='hardening/production-readiness.json';
const doc=JSON.parse(fs.readFileSync(path,'utf8'));
const gate=doc?.gates?.multi_collector_authority;
if(!gate)throw new Error('multi_collector_authority gate missing');
if(gate.status!=='partial_runtime_observer_green_confirm_wiring_pending_enforcement_off')throw new Error(`unexpected multi_collector_authority status: ${gate.status}`);

const addUnique=(list,value)=>{if(!list.includes(value))list.push(value);};
const removeExact=(list,value)=>{const i=list.indexOf(value);if(i>=0)list.splice(i,1);};

for(const item of [
  'runtime confirmation invokes confirmOwned only for same-workstation candidates; vacant, other-workstation and unavailable observations remain non-authoritative',
  'successful same-workstation server confirmations retain publication fences only in private runtime memory while public agent state stays sanitized',
  'fenced MES head Rules require the current active server-time lease for exact line, owner, workstation and generation',
  'expired leases and stale generations are rejected by Firestore Rules before a fenced MES head can advance',
  'same-content fenced heads may advance only to a higher current generation and a fenced head cannot downgrade back to unfenced',
  'server-enforced fenced head scenarios passed full Static Quality and Firestore Rules/cross-PC emulator E2E'
])addUnique(gate.green,item);

for(const item of [
  'hardening/collector-fence-confirmation-evidence.json',
  'hardening/fenced-mes-head-rules-evidence.json'
])addUnique(gate.evidence,item);

for(const item of [
  'after server-authoritative confirmation is proven, wire only that confirmed fence into collectorFenceForLine while stale-publisher rejection remains disabled',
  'after runtime observer diagnostics are proven, invoke confirmOwned only for same-workstation candidates and feed only successful server-confirmed fences into collectorFenceForLine while stale-publisher rejection remains disabled',
  'invoke confirmOwned only for same-workstation candidates in a separate gated runtime slice; vacant/other/unavailable observations must remain read-only'
])removeExact(gate.remaining,item);

const desiredRemaining=[
  'do not enforce lease on amesUsers/amesTeamLines publication until conflict scenarios are physically proven',
  'wire only successful server-confirmed fences into collectorFenceForLine only after the matching Firestore Rules are promoted; current production Rules have not been published with collector_fence support',
  'define an explicit initial lease acquisition path for a vacant configured line without introducing automatic takeover',
  'reject stale offline publisher only after two-workstation physical conflict/takeover/recovery scenarios are GREEN',
  'physical multi-PC same-line conflict and recovery test'
];
gate.remaining=[];
for(const item of desiredRemaining)addUnique(gate.remaining,item);
gate.status='partial_server_fence_rules_green_runtime_binding_and_physical_enforcement_pending';
addUnique(gate.full_ci_runs,38188308176);

const workstation=doc?.gates?.workstation_identity;
if(workstation?.remaining){
  workstation.remaining=[
    'stable workstation identity is integrated into collector observation/confirmation, but MES publication binding and physical multi-PC enforcement remain pending'
  ];
}

const mesRules=doc?.gates?.mes_rules_authority;
if(mesRules){
  mesRules.green=mesRules.green||[];
  addUnique(mesRules.green,'fenced MES heads are validated against the current active server-time collector lease in code/emulator');
  addUnique(mesRules.green,'fenced heads reject expired/stale generation and cannot downgrade to unfenced');
  mesRules.evidence=mesRules.evidence||[];
  addUnique(mesRules.evidence,'hardening/fenced-mes-head-rules-evidence.json');
}

if(doc.promotion?.production_rules_publish_allowed!==false)throw new Error('production Rules publication guard must remain false');
if(doc.promotion?.stable_allowed!==false||doc.promotion?.main_merge_allowed!==false)throw new Error('promotion guards changed unexpectedly');
if(gate.status.includes('green')&&!gate.status.includes('partial'))throw new Error('multi collector gate must remain partial');

fs.writeFileSync(path,JSON.stringify(doc,null,2)+'\n');
console.log('PASS: fenced collector authority readiness reconciled without promotion/enforcement');
