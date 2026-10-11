import fs from 'node:fs';

const FILE='ames/agent-client.mjs';
let src=fs.readFileSync(FILE,'utf8');

function replaceOnce(anchor,replacement,label){
  const count=src.split(anchor).length-1;
  if(count!==1)throw new Error(`${label}: expected one anchor, found ${count}`);
  src=src.replace(anchor,replacement);
}

replaceOnce(
  "import {CANONICAL_SCHEMA,DATASETS} from './data/canonical.mjs';\n",
  "import {CANONICAL_SCHEMA,DATASETS} from './data/canonical.mjs';\nimport {validateCollectorIdentity} from './data/collector-authority.mjs';\n",
  'collector authority import'
);

const helperAnchor="\n// Transport belongs to the existing session; all operational data lives in store.\n";
const helper=`\nexport const AGENT_WORKSTATION_IDENTITY_SCHEMA='central-workstation-identity-v1';\n\nexport function publicAgentWorkstationIdentity(payload){\n  const raw=payload?.workstation_identity;\n  if(!raw||typeof raw!=='object'||raw.schema!==AGENT_WORKSTATION_IDENTITY_SCHEMA||raw.stable!==true)return null;\n  let workstationId;\n  try{workstationId=validateCollectorIdentity(raw.workstation_id);}\n  catch{return null;}\n  return Object.freeze({\n    schema:AGENT_WORKSTATION_IDENTITY_SCHEMA,\n    workstation_id:workstationId,\n    stable:true,\n    identity_kind:String(raw.identity_kind||'random_local_capability')\n  });\n}\n`;
replaceOnce(helperAnchor,helper+helperAnchor,'workstation identity helper');

const connectAnchor=`      const health=await request('/health');\n      if(health.agent_version!=='0.5.23'||health.mes_scheduler?.policy!==SCHEDULER_POLICY)throw new Error('Instale o patch de serialização com scheduler FIFO antes de conectar o Console.');\n      let capabilities=null;`;
const connectReplacement=`      const health=await request('/health');\n      if(health.agent_version!=='0.5.23'||health.mes_scheduler?.policy!==SCHEDULER_POLICY)throw new Error('Instale o patch de serialização com scheduler FIFO antes de conectar o Console.');\n      let workstationIdentity=null,workstationIdentityStatus='legacy_unavailable';\n      try {\n        const hardened=await request('/hardening/health');\n        workstationIdentity=publicAgentWorkstationIdentity(hardened);\n        workstationIdentityStatus=workstationIdentity?'ready':'invalid';\n      } catch(error) {\n        if(error.name==='AbortError')throw error;\n        if(String(error.message||'').includes('não autorizado'))throw error;\n      }\n      let capabilities=null;`;
replaceOnce(connectAnchor,connectReplacement,'connect identity probe');

const publishAnchor="      publish({status:'connected',config,capabilities,readiness:{engine:!!health.engine_found,chrome:!!health.chrome_cdp_reachable,ames:!!health.ames_reachable,process:!!health.auto_3022_ready,playwright:health.playwright_ready!==false},agent_build:health.agent_build||'',error:''});";
const publishReplacement="      publish({status:'connected',config,capabilities,workstation_identity:workstationIdentity,workstation_identity_status:workstationIdentityStatus,readiness:{engine:!!health.engine_found,chrome:!!health.chrome_cdp_reachable,ames:!!health.ames_reachable,process:!!health.auto_3022_ready,playwright:health.playwright_ready!==false},agent_build:health.agent_build||'',error:''});";
replaceOnce(publishAnchor,publishReplacement,'connected publish');

const clearAnchor="store.updateAgent({status:'disconnected',config:null,job:null,readiness:null,monitor:null,capabilities:null,auxiliary:null,resultSource:null,upload_path:null,agent_build:'',error:''});";
const clearReplacement="store.updateAgent({status:'disconnected',config:null,job:null,readiness:null,monitor:null,capabilities:null,workstation_identity:null,workstation_identity_status:null,auxiliary:null,resultSource:null,upload_path:null,agent_build:'',error:''});";
replaceOnce(clearAnchor,clearReplacement,'session clear');

if((src.match(/request\('\/hardening\/health'\)/g)||[]).length!==1)throw new Error('hardening health probe missing or duplicated');
if((src.match(/workstation_identity_status/g)||[]).length!==3)throw new Error('workstation identity status contract changed unexpectedly');
fs.writeFileSync(FILE,src);
console.log(JSON.stringify({hardening_health_probe:true,legacy_fallback:true,session_clear:true},null,2));
