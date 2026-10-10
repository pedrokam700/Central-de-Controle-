import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('bundle de migração atualiza apenas R12 existente, fixa frontend, captura antes da troca e possui rollback',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r12-migration-'));
  const out=path.join(dir,'bundle.zip'),frontendSha='1'.repeat(40);
  const python=process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');
  try{
    const build=spawnSync(python,['scripts/build-r12-migration-bundle.py',out,'--frontend-sha',frontendSha],{encoding:'utf8'});
    assert.equal(build.status,0,(build.stdout||'')+(build.stderr||''));
    const inspect=`import json,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1]);n=set(z.namelist());m=json.loads(z.read('MIGRATION_MANIFEST.json'));g=json.loads(z.read('FRONTEND_GATE.json'));u=z.read('ATUALIZAR_R12_EXISTENTE.bat').decode('ascii',errors='replace');r=z.read('ROLLBACK_R12_EXISTENTE.bat').decode('ascii',errors='replace');assert m['new_pc_supported'] is False;assert m['factory_gate_required'] is True;assert m['frontend_sha']==sys.argv[2];assert m['pre_migration_capture']=='best-effort-before-update';assert m['rollback']=='latest-candidate-backup';assert g['expected_sha']==sys.argv[2];assert len(g['preview_urls'])>=2;assert 'ames-agent/agent_entry.py' in n;assert 'ames-agent/process_r11.py' in n;assert 'ATUALIZAR_R12_EXISTENTE.bat' in n;assert 'ROLLBACK_R12_EXISTENTE.bat' in n;assert 'suporte/ames-workstation/capture-r12-engine.py' in n;assert 'FRONTEND_GATE.json' in n;assert 'R12_ENGINE_CAPTURE_PREMIGRATION.zip' in u;assert 'capture-r12-engine.py' in u;assert 'update_candidate.py' in u and ' update ' in u;assert 'update_candidate.py' in r and ' rollback ' in r;assert 'candidate-backups' in r;assert not any(x.endswith(('.sqlite3','.db','.log')) for x in n);print('ok')`;
    const check=spawnSync(python,['-c',inspect,out,frontendSha],{encoding:'utf8'});
    assert.equal(check.status,0,(check.stdout||'')+(check.stderr||''));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
