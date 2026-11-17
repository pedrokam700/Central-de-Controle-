import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
assert.equal(globalThis[Symbol.for('central.no-distribution.active')],true,'Required distribution preload is missing');
const simulated='/synthetic-never-created/build-simulated.mjs';
assert.equal(fs.existsSync(simulated),false);
assert.throws(()=>spawnSync('node',[simulated]),/NO_DISTRIBUTION/);
console.log('NO_DISTRIBUTION active: simulated builder blocked before launch');
