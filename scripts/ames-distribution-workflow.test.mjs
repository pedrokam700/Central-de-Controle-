import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
test('CI wraps every workload shell and never tries to write NODE_OPTIONS to GITHUB_ENV',()=>{
 const workflow=fs.readFileSync('.github/workflows/ames-pr76-cross-views.yml','utf8');
 assert.match(workflow,/defaults:\s+run:\s+shell: bash \.\/scripts\/audit\/guarded-ci\.sh \{0\}/);
 assert.doesNotMatch(workflow,/NODE_OPTIONS[^\n]*GITHUB_ENV/);
 assert.equal((workflow.match(/Prove effective distribution preload/g)||[]).length,2);
 const wrapper=fs.readFileSync('scripts/audit/guarded-ci.sh','utf8');
 assert.match(wrapper,/export NODE_OPTIONS=/);assert.match(wrapper,/assert-distribution-preload\.mjs/);
});
test('missing preload really fails closed while an inherited preload passes the same child checker',()=>{
 const command=['scripts/audit/assert-distribution-preload.mjs'];
 const absent=spawnSync(process.execPath,command,{encoding:'utf8',env:{...process.env,NODE_OPTIONS:''}});
 assert.notEqual(absent.status,0);assert.match(absent.stderr,/Required distribution preload is missing/);
 const loaded=spawnSync(process.execPath,command,{encoding:'utf8'});
 assert.equal(loaded.status,0,loaded.stderr);assert.match(loaded.stdout,/simulated builder blocked before launch/);
});
