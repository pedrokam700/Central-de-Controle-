import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { integrationMode, readRelease } from '../ames/data/onboarding.mjs';
const release=JSON.parse(fs.readFileSync(new URL('../ames/releases/latest/release.json',import.meta.url),'utf8'));
test('onboarding reads the versioned release, whitelists metadata and only saves a mode',()=>{
  const m=readRelease({...release,password:'secret',cookies:'secret',endpoint:'invented'});
  assert.equal(m.version,release.version);assert.equal(m.download_url,release.download_url);assert.equal(m.sha256,release.sha256);
  assert(!JSON.stringify(m).includes('secret'));assert.equal(m.endpoint,undefined);
  assert.equal(integrationMode('collector'),'collector');assert.equal(integrationMode('viewer'),'viewer');
  assert.equal(integrationMode('connected'),null);assert.equal(integrationMode('password'),null);
});
test('onboarding rejects missing/invalid manifest, insecure or credential-bearing URLs',()=>{
  for(const v of [null,{}, {...release,sha256:'bad'},{...release,download_url:'javascript:alert(1)'},{...release,download_url:'https://user:password@example.com/file.zip'}]) assert.throws(()=>readRelease(v));
});
