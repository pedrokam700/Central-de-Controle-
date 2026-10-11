import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const read=path=>fs.readFileSync(path,'utf8');
const json=path=>JSON.parse(read(path));
const capture=(text,regex,label)=>{
  const match=text.match(regex);
  if(!match)throw new Error(`Release identity: ${label} ausente`);
  return match[1];
};
const sha256=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');

export function buildReleaseIdentity({frontendSha=null}={}){
  const pkg=json('package.json');
  const latest=json('ames/releases/latest/release.json');
  const index=read('index.html');
  const offline=read('offline-bootstrap.mjs');
  const hardened=read('ames/agent/agent_hardened_entry.py');
  const hardening=read('ames/agent/hardening.py');
  const canonical=read('ames/data/canonical.mjs');
  const entry=read('ames/agent/agent_entry.py');

  const centralBuild=capture(index,/const\s+BUILD\s*=\s*["']([^"']+)["']/,'index BUILD');
  const offlineBuild=capture(offline,/const\s+BUILD\s*=\s*["']([^"']+)["']/,'offline bootstrap BUILD');
  if(centralBuild!==offlineBuild)throw new Error('Release identity: shell e offline bootstrap usam builds diferentes');

  const candidateVersion=capture(hardened,/HARDENED_CANDIDATE_VERSION\s*=\s*["']([^"']+)["']/,'HARDENED_CANDIDATE_VERSION');
  if(candidateVersion!==latest.version)throw new Error('Release identity: agente hardened divergiu do release latest');

  const dbSchemaVersion=Number(capture(hardening,/HARDENING_SCHEMA_VERSION\s*=\s*(\d+)/,'HARDENING_SCHEMA_VERSION'));
  const canonicalSchema=capture(canonical,/CANONICAL_SCHEMA\s*=\s*["']([^"']+)["']/,'CANONICAL_SCHEMA');
  const processContract=capture(entry,/"process_contract"\s*:\s*["']([^"']+)["']/,'process_contract');

  return {
    schema:'central-release-identity-v1',
    central_version:pkg.version,
    central_build:centralBuild,
    frontend_sha:frontendSha||null,
    agent_candidate_version:candidateVersion,
    db_schema_version:dbSchemaVersion,
    canonical_schema:canonicalSchema,
    firestore_rules_sha256:sha256('firestore.rules'),
    r12_engine_contract:processContract,
    r12_bridge_sha256:sha256('ames/agent/process_r11.py'),
    collector_3028_source:{
      path:'ames/agent/agent.py',
      sha256:sha256('ames/agent/agent.py')
    },
    release_status:latest.candidate_status,
    factory_gate_required:latest.new_pc_status==='requires_fused_package_after_factory_r12_capture'
  };
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(invoked)process.stdout.write(JSON.stringify(buildReleaseIdentity({frontendSha:process.env.FRONTEND_SHA||process.env.GITHUB_SHA||null}),null,2)+'\n');
