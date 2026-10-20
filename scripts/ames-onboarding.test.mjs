import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { integrationMode, readRelease } from '../ames/data/onboarding.mjs';
const release=JSON.parse(fs.readFileSync(new URL('../ames/releases/latest/release.json',import.meta.url),'utf8'));

test('approved public GitHub CLEAN is SHA-bound and safe for new Windows computers',()=>{
  const m=readRelease({...release,password:'secret',cookies:'secret',endpoint:'invented'});
  assert.equal(m.version,'0.5.25');
  assert.equal(m.package_available,true);
  assert.equal(m.validated_sha,'e60cef8d4f033c4654b3fb730573e1ecfdd174bd');
  assert.equal(m.sha256,'f73f12f2894e666700231b1fc9c7e16252e03ddebdf307ae807c2b52451bc152');
  assert.equal(m.download_url,'https://github.com/pedrokam700/Central-de-Controle-/releases/download/ames-v0.5.25-factory-20261020/AMES_Central_CLEAN_e60cef8d.zip');
  assert.equal(m.local_runtime.agent_health_url,'http://127.0.0.1:8765/api/v1/health');
  assert(!JSON.stringify(m).includes('secret'));assert.equal(m.endpoint,undefined);
  assert.equal(integrationMode('collector'),'collector');assert.equal(integrationMode('viewer'),'viewer');
  assert.equal(integrationMode('connected'),null);assert.equal(integrationMode('password'),null);
});
test('never recommend arbitrary CDN, preview, stale ZIP or unverified candidate',()=>{
  const other={...release,package_available:true};
  const invalid=[
    null,{},{...release,version:'bad'},
    {...release,package_available:false,download_url:release.download_url},
    {...other,sha256:'bad'},
    {...other,download_url:'javascript:alert(1)'},
    {...other,download_url:'https://example.com/AMES.zip'},
    {...other,download_url:'https://github.com.evil.com/pedrokam700/Central-de-Controle-/releases/download/ames-v0.5.25-factory-20261020/AMES_Central_CLEAN_e60cef8d.zip'},
    {...other,download_url:'https://user:password@github.com'+new URL(release.download_url).pathname},
    {...other,download_url:release.download_url+'?token=fake'},
    {...other,validated_candidate_sha:'1'.repeat(40)},
    {...other,package_name:'AMES_Central_CLEAN_fake0000.zip'},
    {...other,local_runtime:{...other.local_runtime,start_file:'00_INICIAR_AQUI.bat'}}
  ];
  for(const v of invalid)assert.throws(()=>readRelease(v));
});
test('not-yet-published candidate must explicitly hide its download',()=>{
 const m=readRelease({...release,package_available:false,package_name:'',download_url:'',sha256:''});
 assert.equal(m.package_available,false);assert.equal(m.download_url,'');
});
