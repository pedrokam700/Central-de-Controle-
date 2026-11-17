import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
test('CI wraps every workload shell and never tries to write NODE_OPTIONS to GITHUB_ENV',()=>{
 const workflow=fs.readFileSync('.github/workflows/ames-pr76-cross-views.yml','utf8');
 assert.match(workflow,/defaults:\s+run:\s+shell: bash \.\/scripts\/audit\/guarded-ci\.sh \{0\}/);
 assert.doesNotMatch(workflow,/NODE_OPTIONS[^\n]*GITHUB_ENV/);
 assert.equal((workflow.match(/Prove effective distribution preload/g)||[]).length,2);
 // CI's real preload refused Playwright's browser ZIP download. Keep the
 // test-tool fix explicit: use installed Chrome, fail if absent, never relax ZIP.
 assert.doesNotMatch(workflow,/playwright install/);
 assert.match(workflow,/command -v google-chrome/);
 assert.match(workflow,/No preinstalled Chrome: refusing a browser ZIP download/);
 assert.match(workflow,/PLAYWRIGHT_EXECUTABLE_PATH=\$chrome_path/);
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
