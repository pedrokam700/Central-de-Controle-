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
  return app.slice(start,candidates.length?Math.min(...candidates):start+3000);
}

test('app.js contains no raw fetch primitive after transport extraction',()=>{
  assert.equal((app.match(/(?<![\w$.])fetch\(/g)||[]).length,0);
  assert.equal((app.match(/\bcoraAppFetch\(/g)||[]).length,12);
});

test('mutable FAILURE_AI_ENDPOINT remains behind coraAppFetch',()=>{
  const run=fn('aiRun');
  assert.match(run,/window\.FAILURE_AI_ENDPOINT\|\|['"]\/api\/failure-analysis['"]/);
  assert.match(run,/coraAppFetch\(endpoint,/);
  assert.doesNotMatch(run,/\bfetch\(endpoint,/);
});

test('reviewed CORA routes remain present but cannot bypass the extracted transport',()=>{
  for(const route of ['/api/ai-audit','/api/ai-metrics','/api/investigation-artifact','/api/generate-slides','/api/generate-image','/api/failure-intake','/api/failure-analysis/stream','/api/chat-cognitive','/api/transcribe-audio'])assert.ok(app.includes(route),route+' missing');
  assert.doesNotMatch(app,/fetch\(['"]\/api\//);
  assert.doesNotMatch(app,/prepareCoraNetworkRequest/);
});
