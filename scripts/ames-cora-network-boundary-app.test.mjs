import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

function fn(name){
  const marker='async function '+name+'(';
  const start=app.indexOf(marker);
  assert.ok(start>=0,name+' missing');
  const next=app.indexOf('\n    async function ',start+marker.length);
  const nextSync=app.indexOf('\n    function ',start+marker.length);
  const candidates=[next,nextSync].filter(x=>x>start);
  return app.slice(start,candidates.length?Math.min(...candidates):start+1200);
}

test('app delegates CORA browser networking to extracted transport',()=>{
  assert.match(app,/import \{createCoraBrowserTransport\} from ['"]\.\/core\/cora-browser-transport\.mjs['"]/);
  assert.doesNotMatch(app,/import \{prepareCoraNetworkRequest\}/);
  assert.match(app,/createCoraBrowserTransport\(\{/);
  assert.match(app,/fetcher:globalThis\.fetch\.bind\(globalThis\)/);
  assert.match(app,/getOrigin:\(\)=>window\.location\.origin/);
  assert.match(app,/getToken:async\(\)=>auth\?\.currentUser\?await auth\.currentUser\.getIdToken\(\):null/);
});

test('aiPostJSON and coraAppFetch are thin delegates, not duplicate policy implementations',()=>{
  assert.match(fn('aiPostJSON'),/return coraBrowserTransport\.postJSON\(url,payload\)/);
  assert.match(fn('coraAppFetch'),/return coraBrowserTransport\.fetch\(url,options\)/);
  assert.doesNotMatch(app,/prepareCoraNetworkRequest/);
});

test('offline shell caches both destination boundary and browser transport modules',()=>{
  assert.match(sw,/core\/cora-network-boundary\.mjs/);
  assert.match(sw,/core\/cora-browser-transport\.mjs/);
});
