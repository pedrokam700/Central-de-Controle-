import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

function functionText(name){
  const marker='async function '+name+'(';
  const start=app.indexOf(marker);
  assert.ok(start>=0,name+' missing');
  const next=app.indexOf('\n    async function ',start+marker.length);
  const nextSync=app.indexOf('\n    function ',start+marker.length);
  const candidates=[next,nextSync].filter(x=>x>start);
  return app.slice(start,candidates.length?Math.min(...candidates):start+3000);
}

test('aiPostJSON routes requests through destination boundary before fetch',()=>{
  assert.match(app,/import \{prepareCoraNetworkRequest\} from ['"]\.\/core\/cora-network-boundary\.mjs['"]/);
  const fn=functionText('aiPostJSON');
  assert.match(fn,/prepareCoraNetworkRequest\(\{/);
  assert.match(fn,/origin:window\.location\.origin/);
  assert.match(fn,/method:['"]POST['"]/);
  assert.ok(fn.includes('approvedExternalOrigins:[]'));
  assert.match(fn,/headers\.Authorization=\x60Bearer \$\{token\}\x60/);
  assert.match(fn,/fetch\(prepared\.url,\{method:['"]POST['"],headers:prepared\.headers,body:JSON\.stringify\(prepared\.payload\)\}\)/);
  assert.doesNotMatch(fn,/fetch\(url,/);
});

test('no mutable browser config can approve an external provider through aiPostJSON',()=>{
  const fn=functionText('aiPostJSON');
  assert.ok(fn.includes('approvedExternalOrigins:[]'));
  assert.doesNotMatch(fn,/CORA_EXTERNAL_ORIGINS|FAILURE_AI_ENDPOINT|localStorage|sessionStorage/);
});

test('offline shell contains destination boundary module',()=>{
  assert.match(sw,/core\/cora-network-boundary\.mjs/);
});
