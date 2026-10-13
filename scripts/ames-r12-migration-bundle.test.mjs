import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('bundle atualiza R11/R12 existente com seletor de pasta, resultado persistente, captura, rollback e frontend exato',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'existing-install-migration-'));
  const out=path.join(dir,'bundle.zip'),frontendSha='1'.repeat(40);
  const python=process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');
  try{
    const build=spawnSync(python,['scripts/build-r12-migration-bundle.py',out,'--frontend-sha',frontendSha],{encoding:'utf8'});
    assert.equal(build.status,0,(build.stdout||'')+(build.stderr||''));
    const inspect=`import json,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1]);n=set(z.namelist())\nm=json.loads(z.read('MIGRATION_MANIFEST.json'));g=json.loads(z.read('FRONTEND_GATE.json'))\nu=z.read('ATUALIZAR_INSTALACAO_EXISTENTE.bat').decode('ascii',errors='replace')\nua=z.read('ATUALIZAR_R12_EXISTENTE.bat').decode('ascii',errors='replace')\nr=z.read('RESTAURAR_INSTALACAO_ANTERIOR.bat').decode('ascii',errors='replace')\nra=z.read('ROLLBACK_R12_EXISTENTE.bat').decode('ascii',errors='replace')\nl=z.read('00_INICIAR_AQUI.bat').decode('utf-8',errors='replace')\nreadme=z.read('LEIA_PRIMEIRO.txt').decode('utf-8',errors='replace')\nassert m['schema']=='central-existing-installation-migration-v5'\nassert m['purpose']=='update-existing-compatible-r11-r12'\nassert 'V0.5.23_LOCAL_3022_R11' in m['supported_existing_baselines']\nassert m['new_pc_supported'] is False\nassert m['factory_gate_required'] is True\nassert m['frontend_sha']==sys.argv[2]\nassert m['installer_ux']=='folder-picker-explicit-result-no-auto-close'\nassert g['expected_sha']==sys.argv[2] and len(g['preview_urls'])>=2\nfor name in ['ames-agent/agent_entry.py','ames-agent/agent_hardened_entry.py','ames-agent/hardening.py','ames-agent/local_security.py','ames-agent/operational_calendar.py','ames-agent/process_r11.py','ATUALIZAR_INSTALACAO_EXISTENTE.bat','ATUALIZAR_R12_EXISTENTE.bat','RESTAURAR_INSTALACAO_ANTERIOR.bat','ROLLBACK_R12_EXISTENTE.bat','suporte/ames-workstation/capture-r12-engine.py','FRONTEND_GATE.json','LEIA_PRIMEIRO.txt']:\n    assert name in n,name\nassert 'BrowseForFolder' in u\nassert 'V0.5.23 LOCAL 3022 R11' in u\nassert 'Get-NetTCPConnection' in u and '8765' in u\nassert 'ENGINE_CAPTURE_PREMIGRATION.zip' in u\nassert 'capture-r12-engine.py' in u\nassert 'update_candidate.py' in u and ' update ' in u\nassert 'pause' in u.lower()\nassert 'nao vai fechar sozinha' in u.lower()\nassert 'ATUALIZAR_INSTALACAO_EXISTENTE.bat' in ua\nassert 'BrowseForFolder' in r\nassert 'update_candidate.py' in r and ' rollback ' in r\nassert 'candidate-backups' in r\nassert 'RESTAURAR_INSTALACAO_ANTERIOR.bat' in ra\nassert 'V0.5.23 LOCAL 3022 R11' in readme\nassert ':depsrepair' in l and 'playwright>=1.55' in l and 'pandas>=2.2' in l and '09_REPARAR_DEPENDENCIAS.bat' in l\ncf=json.loads(z.read('ames-agent/candidate-files.json'))\nassert 'agent_hardened_entry.py' in cf and 'hardening.py' in cf and 'local_security.py' in cf and 'operational_calendar.py' in cf\nassert not any(x.endswith(('.sqlite3','.db','.log')) for x in n)\nassert not any('local_agent_token' in x for x in n)\nprint('ok')`;
    const check=spawnSync(python,['-c',inspect,out,frontendSha],{encoding:'utf8'});
    assert.equal(check.status,0,(check.stdout||'')+(check.stderr||''));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
