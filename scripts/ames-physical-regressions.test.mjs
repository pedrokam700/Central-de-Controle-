import fs from 'node:fs';
import assert from 'node:assert/strict';

const bridge=fs.readFileSync('ames/agent/engine_bridge.py','utf8');
const view3022=fs.readFileSync('ames/factory-engine/ames/tela_3022.py','utf8');

assert.match(bridge,/done_3074\s*=\s*int\(result_3074\.get\("requested_pcba_count"\)/,'3074 terminal progress must use the real requested PCBA count');
assert.match(bridge,/"stage":"3074","kind":"result","current":done_3074,"total":done_3074/,'3074 result event must not overwrite completed progress with 0\/0');
assert.match(bridge,/done_2114\s*=\s*int\(result_2114\.get\("requested_pcba_count"\)/,'2114 terminal progress must also stay terminal');
assert.match(bridge,/"stage":"2114","kind":"result","current":done_2114,"total":done_2114/);

assert.match(view3022,/c\.isVisible\s*&&\s*!c\.isVisible\(true\)/,'3022 ExtJS discovery must reject hidden stale fields');
assert.match(view3022,/getBoundingClientRect\(\)/,'3022 discovery must verify a rendered input box');
assert.match(view3022,/#\{meta\['inputId'\]\}:visible/,'3022 locator must be constrained to a visible input');
assert.doesNotMatch(view3022,/campo\.click\(timeout=3000\)/,'3022 must not click the stale input before fill');
assert.match(view3022,/for attempt in range\(2\):/,'3022 must re-resolve once if Ext swaps the internal form');

console.log('PASS: physical regressions locked — terminal MES progress is preserved and 3022 ignores hidden stale inputs.');
