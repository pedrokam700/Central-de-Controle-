import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('bundle de migração atualiza apenas R12 existente e não carrega dados runtime',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r12-migration-'));
  const out=path.join(dir,'bundle.zip');
  const python=process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');
  try{
    const build=spawnSync(python,['scripts/build-r12-migration-bundle.py',out],{encoding:'utf8'});
    assert.equal(build.status,0,(build.stdout||'')+(build.stderr||''));
    const inspect=`import json,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1]);n=set(z.namelist());m=json.loads(z.read('MIGRATION_MANIFEST.json'));assert m['new_pc_supported'] is False;assert m['factory_gate_required'] is True;assert 'ames-agent/agent_entry.py' in n;assert 'ames-agent/process_r11.py' in n;assert 'ATUALIZAR_R12_EXISTENTE.bat' in n;assert 'suporte/ames-workstation/capture-r12-engine.py' in n;assert not any(x.endswith(('.sqlite3','.db','.log')) for x in n);print('ok')`;
    const check=spawnSync(python,['-c',inspect,out],{encoding:'utf8'});
    assert.equal(check.status,0,(check.stdout||'')+(check.stderr||''));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
