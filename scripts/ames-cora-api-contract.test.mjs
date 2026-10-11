import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const contract=JSON.parse(fs.readFileSync('hardening/cora-api-contract.json','utf8'));
const app=fs.readFileSync('app.js','utf8');

function normalize(path){
  return path
    .replace(/\$\{[^}]+\}/g,':id')
    .replace(/\/+/g,'/')
    .replace(/[?#].*$/,'');
}

function discoveredRoutes(source){
  const found=new Set();
  const regex=/["'`]((?:\/api\/)[^"'`\s]*)["'`]/g;
  let match;
  while((match=regex.exec(source))){
    const value=normalize(match[1]);
    if(value.startsWith('/api/'))found.add(value);
  }
  return [...found].sort();
}

test('CORA API dependency contract is explicitly non-promotable until backend identity exists',()=>{
  assert.equal(contract.schema,'central-cora-api-dependencies-v1');
  assert.equal(contract.status,'frontend_contract_only_backend_identity_pending');
  assert.equal(contract.backend.authoritative_source,null);
  assert.equal(contract.backend.service_version,null);
  assert.equal(contract.backend.health_verified,false);
  assert.equal(contract.backend.version_verified,false);
  assert.equal(contract.backend.promotion_blocking,true);
  assert.equal(contract.rules.backend_version_required_before_stable,true);
  assert.equal(contract.rules.backend_health_required_before_stable,true);
  assert.equal(contract.rules.backend_source_required_before_stable,true);
});

test('every literal /api route used by app.js is registered in the frontend contract',()=>{
  const declared=contract.routes.map(route=>route.path).sort();
  const discovered=discoveredRoutes(app);
  assert.deepEqual(discovered,declared,`CORA/API route drift detected. Discovered: ${JSON.stringify(discovered)}`);
});

test('route contract has no duplicate path and declares method/domain',()=>{
  const paths=contract.routes.map(route=>route.path);
  assert.equal(new Set(paths).size,paths.length,'duplicate API route in contract');
  for(const route of contract.routes){
    assert.match(route.path,/^\/api\//);
    assert.ok(Array.isArray(route.methods)&&route.methods.length>0,`${route.path} missing methods`);
    assert.ok(route.methods.every(method=>['GET','POST','PUT','PATCH','DELETE'].includes(method)),`${route.path} has invalid method`);
    assert.ok(typeof route.domain==='string'&&route.domain.length>0,`${route.path} missing domain`);
  }
});

test('health/version are requirements, not falsely claimed frontend dependencies',()=>{
  const declared=new Set(contract.routes.map(route=>route.path));
  assert.equal(declared.has('/api/health'),false);
  assert.equal(declared.has('/api/version'),false);
  assert.equal(contract.backend.health_endpoint,'/api/health');
  assert.equal(contract.backend.version_endpoint,'/api/version');
});
