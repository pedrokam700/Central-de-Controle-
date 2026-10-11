import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');

function fn(name){
  const marker='async function '+name+'(';
  const start=app.indexOf(marker);
  assert.ok(start>=0,name+' missing');
  const next=app.indexOf('\n    async function ',start+marker.length);
  const nextSync=app.indexOf('\n    function ',start+marker.length);
  const candidates=[next,nextSync].filter(x=>x>start);
  return app.slice(start,candidates.length?Math.min(...candidates):start+5000);
}

test('all CORA direct requests use coraAppFetch and only boundary helpers retain raw fetch',()=>{
  assert.equal((app.match(/\bfetch\(/g)||[]).length,2);
  assert.equal((app.match(/\bcoraAppFetch\(/g)||[]).length,12);
  const helper=fn('coraAppFetch');
  assert.match(helper,/prepareCoraNetworkRequest\(\{/);
  assert.ok(helper.includes('approvedExternalOrigins:[]'));
  assert.match(helper,/origin:window\.location\.origin/);
  assert.match(helper,/return fetch\(prepared\.url,request\)/);
});

test('mutable FAILURE_AI_ENDPOINT cannot bypass the destination boundary',()=>{
  const run=fn('aiRun');
  assert.match(run,/window\.FAILURE_AI_ENDPOINT\|\|['"]\/api\/failure-analysis['"]/);
  assert.match(run,/coraAppFetch\(endpoint,/);
  assert.doesNotMatch(run,/\bfetch\(endpoint,/);
  const helper=fn('coraAppFetch');
  assert.ok(helper.includes('approvedExternalOrigins:[]'));
  assert.doesNotMatch(helper,/FAILURE_AI_ENDPOINT|localStorage|sessionStorage|CORA_EXTERNAL_ORIGINS/);
});

test('local-only CORA features remain same-origin boundary calls with original routes',()=>{
  for(const route of ['/api/ai-audit','/api/ai-metrics','/api/investigation-artifact','/api/generate-slides','/api/generate-image','/api/failure-intake','/api/failure-analysis/stream','/api/chat-cognitive','/api/transcribe-audio']){
    assert.ok(app.includes(route),route+' missing');
  }
  assert.doesNotMatch(app,/fetch\(['"]\/api\//);
});

test('coraAppFetch preserves GET-without-body and POST JSON semantics',()=>{
  const helper=fn('coraAppFetch');
  assert.match(helper,/method=String\(options\.method\|\|['"]GET['"]\)\.toUpperCase\(\)/);
  assert.match(helper,/JSON\.parse\(options\.body\)/);
  assert.match(helper,/if\(payload===undefined\)delete request\.body/);
  assert.match(helper,/request\.body=JSON\.stringify\(prepared\.payload\)/);
});
