import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../offline-bootstrap.mjs',import.meta.url),'utf8');

test('offline bootstrap strips legacy password fields before app.js',()=>{
  const scrub=source.indexOf("const key='controleFalhas.users.v1'");
  const importApp=source.indexOf("await import(`./app.js?v=${BUILD}`)");
  assert.ok(scrub>=0,'legacy credential scrub expected');
  assert.ok(importApp>scrub,'credential scrub must run before app.js');
  assert.match(source,/hasOwnProperty\.call\(item,'password'\)/);
  assert.match(source,/const \{password,\.\.\.rest\}=item/);
  assert.match(source,/__centralLegacyCredentialBridge='disabled'/);
});
