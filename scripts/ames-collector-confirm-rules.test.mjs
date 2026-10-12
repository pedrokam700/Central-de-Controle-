import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules=fs.readFileSync('firestore.rules','utf8');

function block(name){
  const marker=`function ${name}()`;
  const start=rules.indexOf(marker);
  assert.ok(start>=0,`${name} missing`);
  const next=rules.indexOf('\n      function ',start+marker.length);
  const allow=rules.indexOf('\n      allow ',start+marker.length);
  const ends=[next,allow].filter(x=>x>start);
  return rules.slice(start,ends.length?Math.min(...ends):start+1600);
}

test('sameCollectorRenewal is server-time active-only and cannot change collector identity or generation',()=>{
  const renewal=block('sameCollectorRenewal');
  assert.match(renewal,/leaseStillActive\(\)/);
  assert.match(renewal,/d\.owner_uid == resource\.data\.owner_uid/);
  assert.match(renewal,/d\.workstation_id == resource\.data\.workstation_id/);
  assert.match(renewal,/d\.generation == resource\.data\.generation/);
  assert.match(renewal,/d\.acquired_at == resource\.data\.acquired_at/);
  assert.match(renewal,/d\.renewed_at == request\.time/);
});

test('expired lease path remains generation+1 takeover and cannot accept confirmOwned same-generation renewal',()=>{
  const takeover=block('expiredTakeover');
  assert.match(takeover,/resource\.data\.renewed_at \+ duration\.value\(10, 'm'\) <= request\.time/);
  assert.match(takeover,/d\.generation == resource\.data\.generation \+ 1/);
  assert.match(takeover,/d\.acquired_at == request\.time/);
  assert.match(takeover,/d\.renewed_at == request\.time/);
});

test('lease update remains guarded by validCollectorLease and only renewal or expired takeover branches',()=>{
  const matchStart=rules.indexOf('match /amesLineLeases/{lineId}');
  assert.ok(matchStart>=0);
  const tail=rules.slice(matchStart,matchStart+4200);
  assert.match(tail,/allow update: if canOperationalWrite\(\) && validCollectorLease\(\)\s*&& \(sameCollectorRenewal\(\) \|\| expiredTakeover\(\)\);/);
});
