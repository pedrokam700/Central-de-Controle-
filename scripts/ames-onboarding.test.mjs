import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { integrationMode, readRelease } from '../ames/data/onboarding.mjs';
const release=JSON.parse(fs.readFileSync(new URL('../ames/releases/latest/release.json',import.meta.url),'utf8'));

test('onboarding aceita manifesto pendente sem anunciar ZIP antigo',()=>{
  const m=readRelease({...release,password:'secret',cookies:'secret',endpoint:'invented'});
  assert.equal(m.version,release.version);
  assert.equal(m.package_available,false);
  assert.equal(m.download_url,'');assert.equal(m.sha256,'');assert.equal(m.package_name,'');
  assert.equal(m.existing_r12_migration,true);
  assert.equal(m.local_runtime.start_file,'INICIAR_POSTO_CENTRAL_V2.bat');
  assert.equal(m.local_runtime.agent_health_url,'http://127.0.0.1:8765/api/v1/health');
  assert(!JSON.stringify(m).includes('secret'));assert.equal(m.endpoint,undefined);
  assert.equal(integrationMode('collector'),'collector');assert.equal(integrationMode('viewer'),'viewer');
  assert.equal(integrationMode('connected'),null);assert.equal(integrationMode('password'),null);
});

test('pacote disponível exige ZIP SHA256 e HTTPS sem credenciais',()=>{
  const valid={...release,package_available:true,package_name:'AMES_Central_0.5.25-rc1.zip',sha256:'a'.repeat(64),download_url:'https://example.com/AMES.zip'};
  const m=readRelease(valid);assert.equal(m.package_available,true);assert.equal(m.download_url,'https://example.com/AMES.zip');
  for(const v of [
    null,{},
    {...release,version:'bad'},
    {...release,package_available:false,download_url:'https://example.com/old.zip'},
    {...valid,sha256:'bad'},
    {...valid,download_url:'javascript:alert(1)'},
    {...valid,download_url:'https://user:password@example.com/file.zip'},
    {...valid,local_runtime:{...valid.local_runtime,start_file:'00_INICIAR_AQUI.bat'}}
  ]) assert.throws(()=>readRelease(v));
});
