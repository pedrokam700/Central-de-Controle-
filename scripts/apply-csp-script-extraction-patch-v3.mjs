import './apply-csp-script-extraction-patch-v2.mjs';
import fs from 'node:fs';

function replaceExactly(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`${label}: anchor not found`);
  if(source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: anchor is not unique`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

let identity=fs.readFileSync('scripts/release-identity.mjs','utf8');
identity=replaceExactly(identity,"  const index=read('index.html');","  const buildGuard=read('cora-build-guard.js');",'release identity build source');
identity=replaceExactly(identity,"  const centralBuild=capture(index,/const\\s+BUILD\\s*=\\s*[\"']([^\"']+)[\"']/,'index BUILD');","  const centralBuild=capture(buildGuard,/const\\s+BUILD\\s*=\\s*[\"']([^\"']+)[\"']/,'cora build guard BUILD');",'release identity BUILD capture');
if(identity.includes("capture(index,/const\\s+BUILD"))throw new Error('release identity still depends on index BUILD');
fs.writeFileSync('scripts/release-identity.mjs',identity);

let contract=fs.readFileSync('scripts/release-contract.test.mjs','utf8');
contract=replaceExactly(contract,"const index=read('index.html');","const buildGuard=read('cora-build-guard.js');",'release contract build source');
contract=replaceExactly(contract,"  const shellBuild=capture(index,/const\\s+BUILD\\s*=\\s*[\"']([^\"']+)[\"']/,'index BUILD');","  const shellBuild=capture(buildGuard,/const\\s+BUILD\\s*=\\s*[\"']([^\"']+)[\"']/,'cora build guard BUILD');",'release contract BUILD capture');
contract=replaceExactly(contract,"  assert.equal(bootstrapBuild,shellBuild,'offline bootstrap usa build diferente do shell');","  assert.equal(bootstrapBuild,shellBuild,'offline bootstrap usa build diferente do shell');\n  assert.match(buildGuard,/const\\s+BUILD\\s*=\\s*[\"']15\\.1\\.13\\.48[\"']/,'build guard externo deixou de expor o BUILD canônico');",'release contract external guard assertion');
if(contract.includes("capture(index,/const\\s+BUILD"))throw new Error('release contract still depends on index BUILD');
fs.writeFileSync('scripts/release-contract.test.mjs',contract);

console.log('PASS CSP extraction V3 with release identity authority moved to external build guard');
