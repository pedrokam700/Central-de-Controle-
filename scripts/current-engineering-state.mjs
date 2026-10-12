import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {buildReleaseIdentity} from './release-identity.mjs';

const json=path=>JSON.parse(fs.readFileSync(path,'utf8'));

export function buildEngineeringState({headSha=process.env.GITHUB_SHA||null}={}){
  const readiness=json('hardening/production-readiness.json');
  const release=json('ames/releases/latest/release.json');
  const cora=json('hardening/cora-api-contract.json');
  const identity=buildReleaseIdentity({frontendSha:headSha});
  const gates=readiness.gates||{};
  const entries=Object.entries(gates);
  const blockers=entries
    .filter(([,gate])=>gate.status!=='green'&&!String(gate.status).startsWith('green_'))
    .map(([id,gate])=>({id,priority:gate.priority,status:gate.status,remaining:gate.remaining||[],blocker:gate.blocker||null}));
  const green=entries.filter(([,gate])=>gate.status==='green'||String(gate.status).startsWith('green_')).map(([id])=>id);
  return {
    schema:'central-engineering-state-v1',
    head_sha:headSha,
    central:{
      version:identity.central_version,
      build:identity.central_build,
      canonical_schema:identity.canonical_schema,
      db_schema_version:identity.db_schema_version
    },
    agent:{
      candidate_version:identity.agent_candidate_version,
      release_status:release.candidate_status,
      package_available:release.package_available,
      r12_engine_contract:identity.r12_engine_contract
    },
    physical_candidate:readiness.physical_candidate,
    promotion:readiness.promotion,
    hardening:{
      branch:readiness.hardening_branch,
      green_count:green.length,
      gate_count:entries.length,
      green,
      blockers
    },
    cora:{
      contract_schema:cora.schema,
      status:cora.status,
      backend:cora.backend,
      route_count:cora.routes.length
    },
    invariants:{
      stable_allowed:false,
      main_merge_allowed:false,
      production_rules_publish_allowed:false,
      factory_gate_required:true
    }
  };
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(invoked)process.stdout.write(JSON.stringify(buildEngineeringState(),null,2)+'\n');
