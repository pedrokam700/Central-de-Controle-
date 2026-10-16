import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {workstationMaintenance} from '../ames/console-preparation.mjs';

test('local installation health is independent from MES network and manual session state',()=>{
  const model=workstationMaintenance({
    status:'connected',agent_build:'build-123',
    runtime:{candidate_version:'candidate-456',setup_complete:true},
    readiness:{engine:true,python:true,dependencies:true,playwright:true,sqlite:true,chrome:false,ames:false,session:false}
  });
  assert.equal(model.tone,'ok');
  assert.equal(model.label,'Núcleo local pronto');
  assert.equal(model.build,'build-123');
  assert.equal(model.candidate,'candidate-456');
  assert.equal(model.localChecks.every(item=>item.state==='ok'),true);
});

test('recovery-point model keeps useful metadata and strips local filesystem path',()=>{
  const model=workstationMaintenance({
    status:'connected',agent_build:'build-safe',
    runtime:{setup_complete:true},
    readiness:{engine:true,python:true,dependencies:true,playwright:true,sqlite:true},
    auxiliary:{name:'backup',result:{ok:true,backup:{path:'C:/Users/private/ames.sqlite3',bytes:2048,created_at:'2026-10-15T09:30:00',reason:'native_console',token:'secret'}}}
  });
  assert.deepEqual(model.latest_backup,{created_at:'2026-10-15T09:30:00',bytes:2048,reason:'native_console'});
  const serialized=JSON.stringify(model);
  assert.equal(serialized.includes('C:/Users/private'),false);
  assert.equal(serialized.includes('secret'),false);
});

test('maintenance surface uses existing backup action and does not expose browser rollback or update execution',()=>{
  const source=fs.readFileSync('ames/console-preparation.mjs','utf8');
  assert.match(source,/data-workstation-maintenance/);
  assert.match(source,/data-workstation-backup/);
  assert.match(source,/client\.auxiliary\('backup'\)/);
  assert.match(source,/A atualização e o rollback dos arquivos continuam fora do navegador/);
  assert.doesNotMatch(source,/client\.auxiliary\(['"]rollback['"]\)/);
  assert.doesNotMatch(source,/client\.auxiliary\(['"]update['"]\)/);
  assert.doesNotMatch(source,/data-workstation-rollback/);
});

test('disconnected or incomplete local core never claims readiness',()=>{
  assert.equal(workstationMaintenance({status:'disconnected'}).tone,'unknown');
  const partial=workstationMaintenance({status:'connected',readiness:{engine:true,python:true,dependencies:false,playwright:true,sqlite:true}});
  assert.equal(partial.tone,'partial');
  assert.notEqual(partial.label,'Núcleo local pronto');
});