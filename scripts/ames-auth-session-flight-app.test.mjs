import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

function occurrences(source,needle){
  return source.split(needle).length-1;
}

test('finishLogin delegates only concurrency coordination to extracted UID flight',()=>{
  assert.equal(occurrences(app,"import {createAuthSessionFlight} from './core/auth-session-flight.mjs';"),1);
  assert.equal(occurrences(app,'const finishLoginFlight = createAuthSessionFlight();'),1);
  assert.equal(occurrences(app,'return finishLoginFlight.run(firebaseUser.uid, async () => {'),1);
  assert.equal(app.includes('finishLoginPromise'),false);
  assert.equal(app.includes('finishLoginUid'),false);
});

test('auth orchestration remains in app and still converges through finishLogin',()=>{
  assert.match(app,/async function finishLogin\(firebaseUser, legacyUser = null\)/);
  assert.match(app,/onAuthStateChanged\(auth, async firebaseUser => \{/);
  assert.match(app,/if \(firebaseUser && registrationInProgress\) return;/);
  assert.match(app,/await finishLogin\(firebaseUser, legacyUser\);/);
  assert.match(app,/await finishLogin\(credential\.user/);
  assert.match(app,/clearDataListeners\(\);/);
});

test('offline shell contains extracted auth session flight dependency exactly once',()=>{
  assert.equal(occurrences(sw,"BASE+'core/auth-session-flight.mjs'"),1);
  assert.ok(sw.includes("BASE+'core/user-profile-service.mjs',BASE+'core/auth-session-flight.mjs'"));
});
